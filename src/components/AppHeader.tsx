import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, logoutFromApi } from '../services/api';
import { useLanguage } from '../services/language';
import { AppTab, goToTab, isAdminRole, isSuperAdminRole, openScreen, SessionParams } from '../services/session-params';
import { colors } from '../styles/theme';

type Notification = {
  id: number | string;
  type?: string;
  title?: string;
  message?: string;
  isRead?: boolean | number;
  createdAt?: string;
};

type Props = SessionParams & {
  title: string;
  active?: AppTab;
};

const formatNotificationDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const roleLabel = (rol: string | undefined, tr: (en: string, es: string) => string) => {
  const value = String(rol || '').toUpperCase();
  if (value === 'SUPER_ADMIN') return tr('Super administrator', 'Super administrador');
  if (value === 'ADMIN') return tr('Administrator', 'Administrador');
  return tr('Employee', 'Colaborador');
};

/**
 * Cabecera azul: menú lateral, título y campana. La campana lee las
 * notificaciones del propio usuario (GET /api/notifications), las mismas que ve
 * en el gestor: sus marcaciones y, si es administrador, las solicitudes.
 */
export default function AppHeader({ title, active, fullName, rol, email }: Props) {
  const { tr } = useLanguage();
  const insets = useSafeAreaInsets();
  const params = { fullName, rol, email };
  const [menuVisible, setMenuVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const unread = notifications.filter((n) => !n.isRead).length;

  const loadNotifications = useCallback(async () => {
    if (!email) return;
    try {
      const response = await apiFetch('/api/notifications');
      if (!response.ok) return;
      const data = await response.json().catch(() => []);
      setNotifications(Array.isArray(data) ? data : []);
    } catch {
      // Sin red la campana simplemente se queda como estaba.
    }
  }, [email]);

  useFocusEffect(useCallback(() => { loadNotifications(); }, [loadNotifications]));

  useEffect(() => {
    const interval = setInterval(loadNotifications, 60_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const openNotifications = async () => {
    setNotificationsVisible(true);
    setNotificationsLoading(true);
    await loadNotifications();
    setNotificationsLoading(false);
  };

  const markAsRead = async (notification: Notification) => {
    if (notification.isRead) return;
    setNotifications((list) => list.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
    try {
      await apiFetch(`/api/notifications/${encodeURIComponent(String(notification.id))}/read`, { method: 'POST' });
    } catch {
      // Se reintenta solo al volver a abrir.
    }
  };

  const markAllAsRead = async () => {
    setNotifications((list) => list.map((n) => ({ ...n, isRead: true })));
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
    } catch {
      loadNotifications();
    }
  };

  const go = (tab: AppTab) => {
    setMenuVisible(false);
    if (tab !== active) goToTab(tab, params);
  };

  const open = (pathname: '/permisos' | '/asistencia-general') => {
    setMenuVisible(false);
    openScreen(pathname, params);
  };

  const logout = async () => {
    setMenuVisible(false);
    await logoutFromApi();
    router.replace('/');
  };

  const menuItems: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; visible: boolean }[] = [
    { key: 'inicio', icon: 'home-outline', label: tr('Home', 'Inicio'), onPress: () => go('inicio'), visible: true },
    { key: 'historial', icon: 'calendar-outline', label: tr('Attendance history', 'Historial de asistencia'), onPress: () => go('historial'), visible: true },
    { key: 'perfil', icon: 'person-outline', label: tr('My profile', 'Mi perfil'), onPress: () => go('perfil'), visible: true },
    { key: 'permisos', icon: 'document-text-outline', label: tr('My requests', 'Mis solicitudes'), onPress: () => open('/permisos'), visible: true },
    { key: 'general', icon: 'people-outline', label: tr('General attendance', 'Asistencia general'), onPress: () => open('/asistencia-general'), visible: isAdminRole(rol) },
    {
      key: 'configuracion',
      icon: isSuperAdminRole(rol) ? 'shield-checkmark-outline' : 'settings-outline',
      label: isSuperAdminRole(rol) ? tr('Settings and devices', 'Configuración y dispositivos') : tr('Settings', 'Configuración'),
      onPress: () => go('configuracion'),
      visible: true,
    },
  ];

  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.row}>
        <TouchableOpacity style={styles.iconButton} onPress={() => setMenuVisible(true)} accessibilityLabel={tr('Open menu', 'Abrir menú')}>
          <Ionicons name="menu" size={30} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <TouchableOpacity style={styles.iconButton} onPress={openNotifications} accessibilityLabel={tr('Notifications', 'Notificaciones')}>
          <Ionicons name="notifications-outline" size={27} color="#FFFFFF" />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Menú lateral */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.drawerOverlay} onPress={() => setMenuVisible(false)}>
          <Pressable style={[styles.drawer, { paddingTop: insets.top + 20 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.drawerUser}>
              <View style={styles.drawerAvatar}>
                <Ionicons name="person" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.drawerName} numberOfLines={2}>{fullName || tr('User', 'Usuario')}</Text>
                <Text style={styles.drawerRole}>{roleLabel(rol, tr)}</Text>
              </View>
            </View>

            <ScrollView style={{ flex: 1 }}>
              {menuItems.filter((item) => item.visible).map((item) => {
                const isActive = item.key === active;
                return (
                  <TouchableOpacity key={item.key} style={[styles.drawerItem, isActive && styles.drawerItemActive]} onPress={item.onPress}>
                    <Ionicons name={item.icon} size={21} color={isActive ? colors.primary : colors.text} />
                    <Text style={[styles.drawerItemText, isActive && styles.drawerItemTextActive]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.drawerLogout} onPress={logout}>
              <Ionicons name="log-out-outline" size={21} color={colors.red} />
              <Text style={styles.drawerLogoutText}>{tr('Sign out', 'Cerrar sesión')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Notificaciones */}
      <Modal visible={notificationsVisible} transparent animationType="fade" onRequestClose={() => setNotificationsVisible(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setNotificationsVisible(false)}>
          <Pressable style={[styles.sheet, { marginTop: insets.top + 64 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{tr('Notifications', 'Notificaciones')}</Text>
              {unread > 0 && (
                <TouchableOpacity onPress={markAllAsRead}>
                  <Text style={styles.sheetAction}>{tr('Mark all as read', 'Marcar todas como leídas')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {notificationsLoading && notifications.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: 30 }} />
            ) : notifications.length === 0 ? (
              <View style={styles.sheetEmpty}>
                <Ionicons name="notifications-off-outline" size={30} color={colors.faint} />
                <Text style={styles.sheetEmptyText}>{tr('You have no notifications', 'No tienes notificaciones')}</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {notifications.map((n) => (
                  <TouchableOpacity key={String(n.id)} style={[styles.notification, !n.isRead && styles.notificationUnread]} onPress={() => markAsRead(n)} activeOpacity={0.8}>
                    <View style={[styles.notificationDot, !n.isRead && styles.notificationDotUnread]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notificationTitle}>{n.title || tr('Notice', 'Aviso')}</Text>
                      {!!n.message && <Text style={styles.notificationMessage}>{n.message}</Text>}
                      <Text style={styles.notificationDate}>{formatNotificationDate(n.createdAt)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.header, paddingHorizontal: 14, paddingBottom: 30 },
  row: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 1100, alignSelf: 'center' },
  iconButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  badge: {
    position: 'absolute', top: 5, right: 4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9,
    backgroundColor: '#FF4D4F', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.header,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(10, 20, 45, 0.45)', flexDirection: 'row' },
  drawer: { width: 290, maxWidth: '82%', height: '100%', backgroundColor: colors.card, paddingHorizontal: 14, paddingBottom: 24 },
  drawerUser: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 6, paddingBottom: 18, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  drawerAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  drawerName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  drawerRole: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 12 },
  drawerItemActive: { backgroundColor: colors.primarySoft },
  drawerItemText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  drawerItemTextActive: { color: colors.primary, fontWeight: '800' },
  drawerLogout: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.redSoft },
  drawerLogoutText: { color: colors.red, fontSize: 15, fontWeight: '700' },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(10, 20, 45, 0.35)', alignItems: 'center', paddingHorizontal: 14 },
  sheet: { width: '100%', maxWidth: 440, backgroundColor: colors.card, borderRadius: 18, padding: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  sheetAction: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  sheetEmpty: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  sheetEmptyText: { color: colors.muted, fontSize: 14 },
  notification: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, marginBottom: 6 },
  notificationUnread: { backgroundColor: colors.primarySoft },
  notificationDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: 'transparent' },
  notificationDotUnread: { backgroundColor: colors.primary },
  notificationTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  notificationMessage: { color: colors.muted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  notificationDate: { color: colors.faint, fontSize: 11.5, marginTop: 4 },
});
