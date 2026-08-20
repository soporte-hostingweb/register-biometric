import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiFetch } from '../services/api';

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

const formatDate = (value?: string | null) => {
  if (!value) return 'Sin registro';
  return new Date(value).toLocaleString('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  });
};

export default function ConfiguracionScreen() {
  const { fullName, email, rol } = useLocalSearchParams<{ fullName: string; email: string; rol: string }>();
  const [users, setUsers] = useState<AuthorizedDeviceUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [revokingUserId, setRevokingUserId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

  useEffect(() => {
    if (rol !== 'SUPER_ADMIN') {
      router.replace('/');
      return;
    }
    loadDevices();
  }, [rol]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter(user =>
      `${user.fullName || ''} ${user.email || ''}`.toLowerCase().includes(query),
    );
  }, [search, users]);

  const revokeDevice = async (user: AuthorizedDeviceUser) => {
    setRevokingUserId(user.userId);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(`/api/admin/authorized-devices/${user.userId}/revoke`, {
        method: 'POST',
      });
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

  const confirmRevoke = (user: AuthorizedDeviceUser) => {
    const prompt = `¿Deseas reemplazar el equipo autorizado de ${user.email}? El equipo anterior perderá el acceso y el próximo inicio registrará la nueva computadora.`;
    if (Platform.OS === 'web') {
      if (window.confirm(prompt)) revokeDevice(user);
      return;
    }
    Alert.alert('Cambiar equipo autorizado', prompt, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cambiar equipo', style: 'destructive', onPress: () => revokeDevice(user) },
    ]);
  };

  if (rol !== 'SUPER_ADMIN') return null;

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace({ pathname: '/dashboard', params: { fullName, email, rol } })}
        >
          <Ionicons name="arrow-back" size={21} color="#DCEBFA" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>SUPER ADMINISTRACIÓN</Text>
          <Text style={styles.title}>Configuración</Text>
          <Text style={styles.subtitle}>Administra las computadoras autorizadas de los trabajadores.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.toolbar}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={19} color="#7F9BB8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar empleado o correo"
              placeholderTextColor="#70859B"
              style={styles.searchInput}
            />
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={loadDevices} disabled={loading}>
            <Ionicons name="refresh-outline" size={19} color="#071C35" />
            <Text style={styles.refreshText}>Actualizar</Text>
          </TouchableOpacity>
        </View>

        {message ? <Text style={styles.successMessage}>{message}</Text> : null}
        {error ? <Text style={styles.errorMessage}>{error}</Text> : null}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#65B9FF" size="large" />
            <Text style={styles.loadingText}>Cargando dispositivos…</Text>
          </View>
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="laptop-outline" size={42} color="#58748F" />
            <Text style={styles.emptyTitle}>No se encontraron usuarios</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filteredUsers.map(user => {
              const hasDevice = Boolean(user.deviceId && user.isActive);
              const isOwnAccount = Number(user.userId) > 0 && user.email?.toLowerCase() === email?.toLowerCase();
              return (
                <View style={styles.card} key={user.userId}>
                  <View style={styles.cardTop}>
                    <View style={styles.userIcon}>
                      <Ionicons name="person-outline" size={22} color="#77C3FF" />
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{user.fullName || 'Usuario sin nombre'}</Text>
                      <Text style={styles.userEmail}>{user.email}</Text>
                    </View>
                    <View style={[styles.statusBadge, hasDevice ? styles.activeBadge : styles.pendingBadge]}>
                      <Text style={[styles.statusText, hasDevice ? styles.activeText : styles.pendingText]}>
                        {hasDevice ? 'AUTORIZADO' : 'PENDIENTE'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.devicePanel}>
                    <View style={styles.deviceIcon}>
                      <Ionicons name={hasDevice ? 'desktop-outline' : 'alert-circle-outline'} size={24} color={hasDevice ? '#6EDDA5' : '#F0B45A'} />
                    </View>
                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceName}>{hasDevice ? user.deviceLabel || user.deviceName || 'Computadora autorizada' : 'Sin computadora autorizada'}</Text>
                      <Text style={styles.detailText}>Autorizado: {formatDate(user.authorizedAt)}</Text>
                      <Text style={styles.detailText}>Último acceso: {formatDate(user.lastUsedAt)}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.revokeButton,
                      (!hasDevice || isOwnAccount || revokingUserId === user.userId) && styles.disabledButton,
                    ]}
                    disabled={!hasDevice || isOwnAccount || revokingUserId === user.userId}
                    onPress={() => confirmRevoke(user)}
                  >
                    {revokingUserId === user.userId ? (
                      <ActivityIndicator size="small" color="#FFD6D6" />
                    ) : (
                      <Ionicons name="swap-horizontal-outline" size={19} color="#FFD6D6" />
                    )}
                    <Text style={styles.revokeText}>
                      {isOwnAccount ? 'Equipo administrativo actual' : 'Cambiar equipo autorizado'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles: Record<string, any> = {
  page: { flex: 1, minHeight: '100vh', backgroundColor: '#071321' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingHorizontal: 24, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#18314A', backgroundColor: '#0B1929' },
  backButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#152A40', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  eyebrow: { color: '#65B9FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: '#FFFFFF', fontSize: 25, fontWeight: '800', marginTop: 2 },
  subtitle: { color: '#94AAC0', fontSize: 13, marginTop: 4 },
  content: { width: '100%', maxWidth: 1200, alignSelf: 'center', padding: 24, paddingBottom: 50 },
  toolbar: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  searchBox: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#29445E', backgroundColor: '#0F2032', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 9 },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 14, outlineStyle: 'none' },
  refreshButton: { minHeight: 48, paddingHorizontal: 17, borderRadius: 12, backgroundColor: '#77C3FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  refreshText: { color: '#071C35', fontWeight: '800', fontSize: 13 },
  successMessage: { color: '#7BE5AF', backgroundColor: '#0E362A', borderRadius: 10, padding: 12, marginBottom: 14 },
  errorMessage: { color: '#FFAAAA', backgroundColor: '#3A171B', borderRadius: 10, padding: 12, marginBottom: 14 },
  loadingBox: { paddingVertical: 80, alignItems: 'center', gap: 13 },
  loadingText: { color: '#9BB1C7', fontSize: 14 },
  emptyBox: { paddingVertical: 70, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#203950', borderRadius: 16, backgroundColor: '#0B1A2A' },
  emptyTitle: { color: '#B7CADC', fontSize: 16, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { flexGrow: 1, flexBasis: 470, maxWidth: 575, padding: 17, borderRadius: 16, borderWidth: 1, borderColor: '#213D56', backgroundColor: '#0D1D2E' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  userIcon: { width: 43, height: 43, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17304A' },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { color: '#F7FAFD', fontSize: 15, fontWeight: '800' },
  userEmail: { color: '#8FA7BD', fontSize: 12, marginTop: 3 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  activeBadge: { backgroundColor: '#103B2C' },
  pendingBadge: { backgroundColor: '#3A2C15' },
  statusText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  activeText: { color: '#6FE1A6' },
  pendingText: { color: '#F2BD69' },
  devicePanel: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#091725', borderRadius: 12, padding: 13, marginTop: 15 },
  deviceIcon: { width: 39, alignItems: 'center' },
  deviceInfo: { flex: 1 },
  deviceName: { color: '#D9E7F4', fontSize: 13, fontWeight: '700', marginBottom: 5 },
  detailText: { color: '#718BA3', fontSize: 11, marginTop: 2 },
  revokeButton: { marginTop: 14, minHeight: 44, borderRadius: 11, backgroundColor: '#57232A', borderWidth: 1, borderColor: '#80404A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabledButton: { opacity: 0.42 },
  revokeText: { color: '#FFD6D6', fontSize: 12.5, fontWeight: '800' },
};
