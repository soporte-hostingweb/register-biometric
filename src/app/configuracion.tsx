import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import TabScreen from '../components/TabScreen';
import { apiFetch, logoutFromApi } from '../services/api';
import { useLanguage } from '../services/language';
import { goToTab, isAdminRole, isSuperAdminRole, openScreen } from '../services/session-params';
import { getWebPushPermission, subscribeToWebPush, supportsWebPush } from '../services/web-push';
import { cardShadow, colors, WIDE_MAX_WIDTH } from '../styles/theme';

type AuthorizedDeviceUser = {
  userId: number;
  email: string;
  fullName: string;
  role?: string | null;
  deviceId?: number | null;
  deviceName?: string | null;
  deviceLabel?: string | null;
  userAgent?: string | null;
  authorizedAt?: string | null;
  lastUsedAt?: string | null;
  isActive?: boolean | null;
};

type AttendanceEvidence = {
  evidenceId: number;
  attendanceLogId: number;
  employeeId: number;
  employeeName: string;
  email?: string | null;
  markedAt?: string | null;
  checkType: number;
  locationSource?: string | null;
  photoBytes?: number;
  capturedAt: string;
  captureIp?: string | null;
  captureUserAgent?: string | null;
  kind?: 'attendance' | 'enrollment';
  captureAngle?: 'front' | 'left' | 'right';
};

type PushState = 'unsupported' | 'default' | 'granted' | 'denied' | 'native';

const formatDate = (value?: string | null) => {
  if (!value) return 'Sin registro';
  return new Date(value).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });
};

const confirmAction = (title: string, prompt: string, confirmText: string, onConfirm: () => void, destructive = false) => {
  if (Platform.OS === 'web') {
    if (window.confirm(prompt)) onConfirm();
    return;
  }
  Alert.alert(title, prompt, [
    { text: 'Cancelar', style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
};

/**
 * Pestaña Configuración. Lo que se ve depende del rol:
 * - Todos: idioma, notificaciones, registro facial, seguridad, solicitudes y salir.
 * - ADMIN y SUPER_ADMIN: además, la asistencia general de los colaboradores.
 * - SUPER_ADMIN: además, los dispositivos autorizados (cambiar el equipo de un
 *   empleado que perdió o le robaron el suyo, enviar cambio de contraseña) y las
 *   evidencias faciales. El backend vuelve a exigir el rol en cada endpoint.
 */
export default function ConfiguracionScreen() {
  const { tr, language, setLanguage } = useLanguage();
  const { fullName, email, rol } = useLocalSearchParams<{ fullName: string; email: string; rol: string }>();
  const session = { fullName, rol, email };
  const superAdmin = isSuperAdminRole(rol);
  const admin = isAdminRole(rol);
  const { width } = useWindowDimensions();
  const isMobile = width <= 600;

  // Preferencias
  const [pushState, setPushState] = useState<PushState>(Platform.OS === 'web' ? 'default' : 'native');
  const [pushMessage, setPushMessage] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [faceEnrolled, setFaceEnrolled] = useState<boolean | null>(null);
  const [hasPin, setHasPin] = useState<boolean | null>(null);

  // Administración (SUPER_ADMIN)
  const [users, setUsers] = useState<AuthorizedDeviceUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(superAdmin);
  const [revokingUserId, setRevokingUserId] = useState<number | null>(null);
  const [resettingUserId, setResettingUserId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'devices' | 'evidence'>('devices');
  const [evidenceView, setEvidenceView] = useState<'attendance' | 'enrollment'>('attendance');
  const [evidence, setEvidence] = useState<AttendanceEvidence[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<AttendanceEvidence | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);

  useEffect(() => {
    if (!email) router.replace('/');
  }, [email]);

  useEffect(() => {
    if (!email) return;
    if (Platform.OS === 'web') {
      getWebPushPermission().then((p) => setPushState(p as PushState)).catch(() => setPushState('unsupported'));
    }
    apiFetch('/api/attendance/face-status')
      .then(async (r) => { if (r.ok) setFaceEnrolled(Boolean((await r.json().catch(() => ({}))).enrolled)); })
      .catch(() => undefined);
    apiFetch('/api/attendance/me/biometric-pin')
      .then(async (r) => { if (r.ok) setHasPin(Boolean((await r.json().catch(() => ({}))).hasAttendancePin)); })
      .catch(() => undefined);
  }, [email]);

  const enablePush = async () => {
    setPushBusy(true);
    setPushMessage('');
    try {
      await subscribeToWebPush();
      setPushState('granted');
      setPushMessage(tr('Notifications enabled on this device.', 'Notificaciones activadas en este dispositivo.'));
    } catch (err: any) {
      setPushMessage(err?.message || tr('Notifications could not be enabled.', 'No se pudieron activar las notificaciones.'));
      getWebPushPermission().then((p) => setPushState(p as PushState)).catch(() => undefined);
    } finally {
      setPushBusy(false);
    }
  };

  const logout = () => confirmAction(
    tr('Sign out', 'Cerrar sesión'),
    tr('Do you want to sign out of this device?', '¿Deseas cerrar sesión en este dispositivo?'),
    tr('Sign out', 'Cerrar sesión'),
    async () => { await logoutFromApi(); router.replace('/'); },
    true,
  );

  // ---- SUPER_ADMIN ---------------------------------------------------------

  const groupedEvidence = useMemo(() => {
    const visible = evidence.filter(item => evidenceView === 'enrollment' ? item.kind === 'enrollment' : item.kind !== 'enrollment');
    const groups = new Map<string, { employeeId: number; employeeName: string; email?: string | null; items: AttendanceEvidence[] }>();
    visible.forEach(item => {
      const key = String(item.employeeId || item.email || item.employeeName);
      const group = groups.get(key) || { employeeId: item.employeeId, employeeName: item.employeeName || 'Empleado', email: item.email, items: [] };
      group.items.push(item);
      groups.set(key, group);
    });
    return Array.from(groups.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'es'));
  }, [evidence, evidenceView]);

  const loadDevices = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/admin/authorized-devices');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'No se pudieron cargar los dispositivos.');
      setUsers(data.users || []);
    } catch (loadError: any) {
      setError(loadError.message || 'No se pudieron cargar los dispositivos.');
    } finally {
      setLoading(false);
    }
  };

  const loadEvidence = async () => {
    setEvidenceLoading(true);
    setError('');
    try {
      const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
      const [evidenceResponse, enrollmentResponse] = await Promise.all([
        apiFetch(`/api/admin/attendance-evidence${query}`),
        apiFetch(`/api/admin/face-enrollments${query}`),
      ]);
      const data = await evidenceResponse.json().catch(() => ({}));
      const enrollmentData = await enrollmentResponse.json().catch(() => ({}));
      if (!evidenceResponse.ok) throw new Error(data.message || 'No se pudieron cargar las evidencias.');
      if (!enrollmentResponse.ok) throw new Error(enrollmentData.message || 'No se pudieron cargar los rostros registrados.');
      const enrollmentItems: AttendanceEvidence[] = (enrollmentData.samples || []).map((sample: any) => ({
        evidenceId: sample.sampleId,
        attendanceLogId: 0,
        employeeId: sample.employeeId,
        employeeName: sample.employeeName,
        email: sample.email,
        checkType: -1,
        capturedAt: sample.capturedAt,
        photoBytes: sample.photoBytes,
        kind: 'enrollment',
        captureAngle: sample.captureAngle,
      }));
      setEvidence([...(data.evidence || []).map((item: AttendanceEvidence) => ({ ...item, kind: 'attendance' as const })), ...enrollmentItems]);
    } catch (loadError: any) {
      setError(loadError.message || 'No se pudieron cargar las evidencias.');
    } finally {
      setEvidenceLoading(false);
    }
  };

  const closePhoto = () => {
    if (photoUrl && Platform.OS === 'web') URL.revokeObjectURL(photoUrl);
    setPhotoUrl('');
    setSelectedEvidence(null);
  };

  const openPhoto = async (item: AttendanceEvidence) => {
    setSelectedEvidence(item);
    setPhotoLoading(true);
    setError('');
    try {
      const photoPath = item.kind === 'enrollment'
        ? `/api/admin/face-enrollments/${item.evidenceId}/photo`
        : `/api/admin/attendance-evidence/${item.evidenceId}/photo`;
      const response = await apiFetch(photoPath);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'No se pudo abrir la fotografía.');
      }
      const blob = await response.blob();
      const uri = Platform.OS === 'web'
        ? URL.createObjectURL(blob)
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
      if (photoUrl && Platform.OS === 'web') URL.revokeObjectURL(photoUrl);
      setPhotoUrl(uri);
    } catch (photoError: any) {
      setSelectedEvidence(null);
      setError(photoError.message || 'No se pudo abrir la fotografía.');
    } finally {
      setPhotoLoading(false);
    }
  };

  useEffect(() => () => {
    if (photoUrl && Platform.OS === 'web') URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  useEffect(() => {
    if (superAdmin) loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [superAdmin]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter(user => `${user.fullName || ''} ${user.email || ''}`.toLowerCase().includes(query));
  }, [search, users]);

  const revokeDevice = async (user: AuthorizedDeviceUser) => {
    setRevokingUserId(user.userId);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(`/api/admin/authorized-devices/${user.userId}/revoke`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'No se pudo cambiar el equipo autorizado.');
      setMessage(data.message || 'Equipo autorizado revocado.');
      await loadDevices();
    } catch (revokeError: any) {
      setError(revokeError.message || 'No se pudo cambiar el equipo autorizado.');
    } finally {
      setRevokingUserId(null);
    }
  };

  const sendPasswordReset = async (user: AuthorizedDeviceUser) => {
    setResettingUserId(user.userId);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(`/api/admin/users/${user.userId}/password-reset`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'No se pudo enviar el cambio de contraseña.');
      setMessage(data.message || `Enlace enviado a ${user.email}.`);
    } catch (resetError: any) {
      setError(resetError.message || 'No se pudo enviar el cambio de contraseña.');
    } finally {
      setResettingUserId(null);
    }
  };

  // ---- Vista ---------------------------------------------------------------

  const pushStatus = (() => {
    if (pushState === 'native') return { text: tr('Managed by your phone settings', 'Se gestionan desde los ajustes del celular'), ok: true };
    if (pushState === 'granted') return { text: tr('Enabled on this device', 'Activadas en este dispositivo'), ok: true };
    if (pushState === 'denied') return { text: tr('Blocked in the browser. Allow them in the site settings.', 'Bloqueadas en el navegador. Permítelas en los ajustes del sitio.'), ok: false };
    if (pushState === 'unsupported' || !supportsWebPush()) return { text: tr('This browser does not support notifications', 'Este navegador no admite notificaciones'), ok: false };
    return { text: tr('Not enabled yet', 'Aún no activadas'), ok: false };
  })();

  const Row = ({ icon, iconColor, iconBg, title, subtitle, onPress, right }: {
    icon: keyof typeof Ionicons.glyphMap; iconColor: string; iconBg: string; title: string; subtitle?: string; onPress?: () => void; right?: ReactNode;
  }) => (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress} activeOpacity={0.75}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}><Ionicons name={icon} size={20} color={iconColor} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null)}
    </TouchableOpacity>
  );

  return (
    <TabScreen title={tr('Settings', 'Configuración')} active="configuracion" maxWidth={superAdmin && !isMobile ? WIDE_MAX_WIDTH : undefined} {...session}>
      {/* Preferencias */}
      <Text style={styles.sectionLabel}>{tr('PREFERENCES', 'PREFERENCIAS')}</Text>
      <View style={styles.card}>
        <Row
          icon="language-outline" iconColor={colors.primary} iconBg={colors.primarySoft}
          title={tr('Language', 'Idioma')}
          right={(
            <View style={styles.segment}>
              {(['es', 'en'] as const).map((lang) => (
                <TouchableOpacity key={lang} style={[styles.segmentItem, language === lang && styles.segmentItemActive]} onPress={() => setLanguage(lang)}>
                  <Text style={[styles.segmentText, language === lang && styles.segmentTextActive]}>{lang === 'es' ? 'ES' : 'EN'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />
        <View style={styles.divider} />
        <Row
          icon="notifications-outline" iconColor={colors.orange} iconBg={colors.orangeSoft}
          title={tr('Attendance notifications', 'Notificaciones de asistencia')}
          subtitle={pushStatus.text}
          right={pushState === 'default' && supportsWebPush() ? (
            <TouchableOpacity style={styles.smallButton} onPress={enablePush} disabled={pushBusy}>
              {pushBusy ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.smallButtonText}>{tr('Enable', 'Activar')}</Text>}
            </TouchableOpacity>
          ) : (
            <Ionicons name={pushStatus.ok ? 'checkmark-circle' : 'alert-circle-outline'} size={20} color={pushStatus.ok ? colors.green : colors.faint} />
          )}
        />
        {!!pushMessage && <Text style={styles.inlineMessage}>{pushMessage}</Text>}
      </View>

      {/* Seguridad */}
      <Text style={styles.sectionLabel}>{tr('SECURITY', 'SEGURIDAD')}</Text>
      <View style={styles.card}>
        <Row
          icon="scan-outline" iconColor={colors.green} iconBg={colors.greenSoft}
          title={tr('Face recognition', 'Reconocimiento facial')}
          subtitle={faceEnrolled === null ? '…' : faceEnrolled ? tr('Your face is registered', 'Tu rostro está registrado') : tr('Pending: register it from Home', 'Pendiente: regístralo desde Inicio')}
          onPress={faceEnrolled === false ? () => goToTab('inicio', session) : undefined}
          right={faceEnrolled ? <Ionicons name="checkmark-circle" size={20} color={colors.green} /> : undefined}
        />
        <View style={styles.divider} />
        <Row
          icon="keypad-outline" iconColor={colors.primary} iconBg={colors.primarySoft}
          title={tr('PIN and password', 'PIN y contraseña')}
          subtitle={hasPin === false ? tr('You have no attendance PIN yet', 'Aún no tienes PIN de asistencia') : tr('Change your attendance PIN or password', 'Cambia tu PIN de asistencia o tu contraseña')}
          onPress={() => goToTab('perfil', session)}
        />
      </View>

      {/* Solicitudes */}
      <Text style={styles.sectionLabel}>{tr('REQUESTS', 'SOLICITUDES')}</Text>
      <View style={styles.card}>
        <Row
          icon="document-text-outline" iconColor={colors.amber} iconBg={colors.amberSoft}
          title={tr('My requests', 'Mis solicitudes')}
          subtitle={tr('Permissions and vacations', 'Permisos y vacaciones')}
          onPress={() => openScreen('/permisos', session)}
        />
      </View>

      {/* Administración */}
      {admin && (
        <>
          <Text style={styles.sectionLabel}>{tr('ADMINISTRATION', 'ADMINISTRACIÓN')}</Text>
          <View style={styles.card}>
            <Row
              icon="people-outline" iconColor={colors.primary} iconBg={colors.primarySoft}
              title={tr('General attendance', 'Asistencia general')}
              subtitle={tr('Check the attendance of any employee', 'Consulta la asistencia de cualquier colaborador')}
              onPress={() => openScreen('/asistencia-general', session)}
            />
          </View>
        </>
      )}

      {superAdmin && (
        <View style={styles.card}>
          <View style={styles.adminHeader}>
            <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
            <Text style={styles.adminTitle}>{tr('Super administration', 'Super administración')}</Text>
          </View>
          <Text style={styles.adminSubtitle}>
            {tr(
              'If an employee loses their device or it is stolen, change their authorized device: the old one loses access and the next sign-in registers the new one.',
              'Si a un colaborador se le pierde o le roban el equipo, cambia su equipo autorizado: el anterior pierde el acceso y el próximo inicio de sesión registra el nuevo.',
            )}
          </Text>

          <View style={styles.tabs}>
            {(['devices', 'evidence'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => {
                  setActiveTab(tab);
                  if (tab === 'evidence' && evidence.length === 0) loadEvidence();
                }}
              >
                <Ionicons name={tab === 'devices' ? 'phone-portrait-outline' : 'images-outline'} size={17} color={activeTab === tab ? '#FFF' : colors.muted} />
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]} numberOfLines={1}>
                  {tab === 'devices' ? tr('Devices', 'Dispositivos') : tr('Facial evidence', 'Evidencias')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'evidence' && (
            <View style={styles.tabs}>
              {(['attendance', 'enrollment'] as const).map((view) => (
                <TouchableOpacity key={view} style={[styles.tab, evidenceView === view && styles.tabSoftActive]} onPress={() => setEvidenceView(view)}>
                  <Text style={[styles.tabText, evidenceView === view && { color: colors.primary }]}>{view === 'attendance' ? 'Marcaciones' : 'Registro biométrico'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={[styles.toolbar, isMobile && { flexDirection: 'column' }]}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={colors.faint} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={activeTab === 'evidence' ? loadEvidence : undefined}
                placeholder={tr('Search employee or email', 'Buscar empleado o correo')}
                placeholderTextColor={colors.faint}
                style={styles.searchInput}
              />
            </View>
            <TouchableOpacity style={styles.refreshButton} onPress={activeTab === 'devices' ? loadDevices : loadEvidence} disabled={loading || evidenceLoading}>
              <Ionicons name={activeTab === 'devices' ? 'refresh-outline' : 'search-outline'} size={18} color="#FFF" />
              <Text style={styles.refreshText}>{activeTab === 'devices' ? tr('Refresh', 'Actualizar') : tr('Search', 'Buscar')}</Text>
            </TouchableOpacity>
          </View>

          {!!message && <Text style={styles.success}>{message}</Text>}
          {!!error && <Text style={styles.error}>{error}</Text>}

          {activeTab === 'devices' && (
            loading ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: 40 }} />
            ) : filteredUsers.length === 0 ? (
              <Text style={styles.emptyText}>{tr('No users found', 'No se encontraron usuarios')}</Text>
            ) : (
              <View style={styles.grid}>
                {filteredUsers.map(user => {
                  const hasDevice = Boolean(user.deviceId && user.isActive);
                  const isOwnAccount = Number(user.userId) > 0 && user.email?.toLowerCase() === email?.toLowerCase();
                  return (
                    <View style={[styles.userCard, isMobile && styles.userCardMobile]} key={user.userId}>
                      <View style={styles.userTop}>
                        <View style={styles.userIcon}><Ionicons name="person-outline" size={20} color={colors.primary} /></View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.userName}>{user.fullName || 'Usuario sin nombre'}</Text>
                          <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: hasDevice ? colors.greenSoft : colors.amberSoft }]}>
                          <Text style={[styles.badgeText, { color: hasDevice ? colors.green : colors.amber }]}>{hasDevice ? 'AUTORIZADO' : 'PENDIENTE'}</Text>
                        </View>
                      </View>

                      <View style={styles.devicePanel}>
                        <Ionicons name={hasDevice ? 'phone-portrait-outline' : 'alert-circle-outline'} size={22} color={hasDevice ? colors.green : colors.amber} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.deviceName}>{hasDevice ? user.deviceLabel || user.deviceName || 'Equipo autorizado' : 'Sin equipo autorizado'}</Text>
                          <Text style={styles.detail}>Autorizado: {formatDate(user.authorizedAt)}</Text>
                          <Text style={styles.detail}>Último acceso: {formatDate(user.lastUsedAt)}</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[styles.revokeButton, (!hasDevice || isOwnAccount || revokingUserId === user.userId) && styles.disabled]}
                        disabled={!hasDevice || isOwnAccount || revokingUserId === user.userId}
                        onPress={() => confirmAction(
                          'Cambiar equipo autorizado',
                          `¿Deseas reemplazar el equipo autorizado de ${user.email}? El equipo anterior perderá el acceso y el próximo inicio registrará el nuevo equipo.`,
                          'Cambiar equipo',
                          () => revokeDevice(user),
                          true,
                        )}
                      >
                        {revokingUserId === user.userId ? <ActivityIndicator size="small" color={colors.red} /> : <Ionicons name="swap-horizontal-outline" size={18} color={colors.red} />}
                        <Text style={styles.revokeText}>{isOwnAccount ? 'Equipo administrativo actual' : 'Cambiar equipo autorizado'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.resetButton, resettingUserId === user.userId && styles.disabled]}
                        disabled={resettingUserId === user.userId}
                        onPress={() => confirmAction(
                          'Enviar cambio de contraseña',
                          `Se enviará a ${user.email} un enlace de un solo uso para crear una nueva contraseña. El enlace vencerá en 30 minutos.`,
                          'Enviar enlace',
                          () => sendPasswordReset(user),
                        )}
                      >
                        {resettingUserId === user.userId ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="mail-outline" size={18} color={colors.primary} />}
                        <Text style={styles.resetText}>Enviar cambio de contraseña</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )
          )}

          {activeTab === 'evidence' && (
            evidenceLoading ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: 40 }} />
            ) : groupedEvidence.length === 0 ? (
              <Text style={styles.emptyText}>{evidenceView === 'attendance' ? 'No hay fotografías de marcaciones' : 'No hay registros biométricos'}</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {groupedEvidence.map(group => (
                  <View style={styles.evidenceGroup} key={String(group.employeeId || group.email)}>
                    <View style={styles.userTop}>
                      <View style={styles.userIcon}><Ionicons name="person-outline" size={20} color={colors.primary} /></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.userName}>{group.employeeName}</Text>
                        <Text style={styles.userEmail}>{group.email || `Empleado #${group.employeeId}`}</Text>
                      </View>
                      <Text style={styles.evidenceCount}>{group.items.length} {group.items.length === 1 ? 'registro' : 'registros'}</Text>
                    </View>
                    {group.items.map(item => (
                      <View style={[styles.evidenceItem, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]} key={`${item.kind || 'attendance'}-${item.evidenceId}`}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.evidenceType}>
                            {item.kind === 'enrollment'
                              ? `Registro: ${item.captureAngle === 'front' ? 'Frente' : item.captureAngle === 'left' ? 'Lado izquierdo' : 'Lado derecho'}`
                              : item.checkType === 0 ? 'Entrada' : 'Salida'}
                            {'  ·  '}{formatDate(item.markedAt || item.capturedAt)}
                          </Text>
                          {item.kind !== 'enrollment' && <Text style={styles.detail}>IP: {item.captureIp || 'No disponible'}</Text>}
                          <Text style={styles.location} numberOfLines={2}>{item.kind === 'enrollment' ? 'Plantilla de registro facial' : item.locationSource || 'Ubicación no disponible'}</Text>
                        </View>
                        <TouchableOpacity style={styles.photoButton} onPress={() => openPhoto(item)}>
                          <Ionicons name="eye-outline" size={17} color={colors.primary} />
                          <Text style={styles.photoButtonText}>{tr('View photo', 'Ver fotografía')}</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )
          )}
        </View>
      )}

      <TouchableOpacity style={styles.logout} onPress={logout} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={20} color={colors.red} />
        <Text style={styles.logoutText}>{tr('Sign out', 'Cerrar sesión')}</Text>
      </TouchableOpacity>

      <Modal visible={Boolean(selectedEvidence)} transparent animationType="fade" onRequestClose={closePhoto}>
        <Pressable style={styles.photoBackdrop} onPress={closePhoto}>
          <Pressable style={styles.photoModal} onPress={() => { }}>
            <View style={styles.photoHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.photoEyebrow}>{selectedEvidence?.kind === 'enrollment' ? 'ROSTRO REGISTRADO' : 'EVIDENCIA FACIAL'}</Text>
                <Text style={styles.photoTitle}>{selectedEvidence?.employeeName}</Text>
                <Text style={styles.userEmail}>{formatDate(selectedEvidence?.markedAt || selectedEvidence?.capturedAt)}</Text>
              </View>
              <TouchableOpacity style={styles.closePhoto} onPress={closePhoto}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.photoFrame}>
              {photoLoading ? (
                <ActivityIndicator color={colors.primary} size="large" />
              ) : photoUrl ? (
                <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              ) : (
                <Text style={styles.error}>No se pudo cargar la fotografía.</Text>
              )}
            </View>
            <Text style={styles.photoPrivacy}>Acceso restringido a SUPER_ADMIN · No compartir sin autorización.</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { color: colors.faint, fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginBottom: -6, marginLeft: 4 },
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 6, ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowSubtitle: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 62 },
  inlineMessage: { color: colors.primaryText, fontSize: 12.5, paddingHorizontal: 12, paddingBottom: 10 },
  segment: { flexDirection: 'row', backgroundColor: colors.primarySoft, borderRadius: 10, padding: 3 },
  segmentItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  segmentItemActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.primaryText, fontSize: 12.5, fontWeight: '800' },
  segmentTextActive: { color: '#FFFFFF' },
  smallButton: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, minWidth: 70, alignItems: 'center' },
  smallButtonText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
  adminHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingTop: 8 },
  adminTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  adminSubtitle: { color: colors.muted, fontSize: 12.5, lineHeight: 18, paddingHorizontal: 8, marginTop: 4, marginBottom: 10 },
  tabs: { flexDirection: 'row', gap: 6, backgroundColor: colors.cardSoft, borderRadius: 12, padding: 4, marginHorizontal: 6, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, minHeight: 38, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  tabActive: { backgroundColor: colors.primary },
  tabSoftActive: { backgroundColor: colors.primarySoft },
  tabText: { color: colors.muted, fontSize: 12.5, fontWeight: '700' },
  tabTextActive: { color: '#FFFFFF' },
  toolbar: { flexDirection: 'row', gap: 8, marginHorizontal: 6, marginBottom: 10 },
  searchBox: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, outlineStyle: 'none' } as any,
  refreshButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  refreshText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  success: { color: colors.green, backgroundColor: colors.greenSoft, borderRadius: 10, padding: 11, marginHorizontal: 6, marginBottom: 10, fontSize: 13 },
  error: { color: colors.red, backgroundColor: colors.redSoft, borderRadius: 10, padding: 11, marginHorizontal: 6, marginBottom: 10, fontSize: 13 },
  emptyText: { color: colors.muted, textAlign: 'center', paddingVertical: 30 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 6, paddingBottom: 6 },
  userCard: { flexGrow: 1, flexBasis: 420, maxWidth: 540, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft },
  userCardMobile: { flexBasis: 'auto', maxWidth: '100%', width: '100%' },
  userTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  userIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  userName: { color: colors.text, fontSize: 14.5, fontWeight: '800' },
  userEmail: { color: colors.muted, fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.4 },
  devicePanel: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.card, borderRadius: 12, padding: 11, marginTop: 11, borderWidth: 1, borderColor: colors.border },
  deviceName: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 3 },
  detail: { color: colors.muted, fontSize: 11.5, marginTop: 1 },
  revokeButton: { marginTop: 10, minHeight: 42, borderRadius: 11, backgroundColor: colors.redSoft, borderWidth: 1, borderColor: '#F7C9CB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  revokeText: { color: colors.red, fontSize: 12.5, fontWeight: '800' },
  resetButton: { marginTop: 8, minHeight: 42, borderRadius: 11, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: '#CFDDF6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  resetText: { color: colors.primary, fontSize: 12.5, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  evidenceGroup: { marginHorizontal: 6, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft, gap: 8 },
  evidenceCount: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  evidenceItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  evidenceType: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  location: { color: colors.primary, fontSize: 11.5, marginTop: 3 },
  photoButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  photoButtonText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: 16, backgroundColor: colors.redSoft, borderWidth: 1, borderColor: '#F7C9CB', marginTop: 4 },
  logoutText: { color: colors.red, fontSize: 15, fontWeight: '800' },
  photoBackdrop: { flex: 1, backgroundColor: 'rgba(10, 20, 45, 0.7)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  photoModal: { width: '100%', maxWidth: 680, borderRadius: 18, backgroundColor: colors.card, padding: 16 },
  photoHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  photoEyebrow: { color: colors.primary, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2 },
  photoTitle: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 2 },
  closePhoto: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  photoFrame: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#0B1220', borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photoPrivacy: { color: colors.faint, fontSize: 10.5, textAlign: 'center', marginTop: 10 },
});
