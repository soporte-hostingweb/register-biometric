import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
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
  const { width } = useWindowDimensions();
  const isMobile = width <= 600;
  const [users, setUsers] = useState<AuthorizedDeviceUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [revokingUserId, setRevokingUserId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'devices' | 'evidence'>('devices');
  const [evidence, setEvidence] = useState<AttendanceEvidence[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<AttendanceEvidence | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);

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
    if (photoUrl) URL.revokeObjectURL(photoUrl);
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
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl(URL.createObjectURL(blob));
    } catch (photoError: any) {
      setSelectedEvidence(null);
      setError(photoError.message || 'No se pudo abrir la fotografía.');
    } finally {
      setPhotoLoading(false);
    }
  };

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

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
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace({ pathname: '/dashboard', params: { fullName, email, rol } })}
        >
          <Ionicons name="arrow-back" size={21} color="#DCEBFA" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>SUPER ADMINISTRACIÓN</Text>
          <Text style={[styles.title, isMobile && styles.titleMobile]}>Configuración</Text>
          <Text style={styles.subtitle}>Administra las computadoras autorizadas de los trabajadores.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, isMobile && styles.contentMobile]} horizontal={false}>
        <View style={[styles.tabs, isMobile && styles.tabsMobile]}>
          <TouchableOpacity
            style={[styles.tab, isMobile && styles.tabMobile, activeTab === 'devices' && styles.activeTab]}
            onPress={() => setActiveTab('devices')}
          >
            <Ionicons name="desktop-outline" size={18} color={activeTab === 'devices' ? '#071C35' : '#9AB1C7'} />
            <Text numberOfLines={1} style={[styles.tabText, isMobile && styles.tabTextMobile, activeTab === 'devices' && styles.activeTabText]}>{isMobile ? 'Dispositivos' : 'Dispositivos autorizados'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, isMobile && styles.tabMobile, activeTab === 'evidence' && styles.activeTab]}
            onPress={() => {
              setActiveTab('evidence');
              if (evidence.length === 0) loadEvidence();
            }}
          >
            <Ionicons name="images-outline" size={18} color={activeTab === 'evidence' ? '#071C35' : '#9AB1C7'} />
            <Text numberOfLines={1} style={[styles.tabText, isMobile && styles.tabTextMobile, activeTab === 'evidence' && styles.activeTabText]}>{isMobile ? 'Evidencias' : 'Evidencias faciales'}</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'devices' && (
          <>
        <View style={[styles.toolbar, isMobile && styles.toolbarMobile]}>
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
                <View style={[styles.card, isMobile && styles.cardMobile]} key={user.userId}>
                  <View style={[styles.cardTop, isMobile && styles.cardTopMobile]}>
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
          </>
        )}

        {activeTab === 'evidence' && (
          <>
            <View style={[styles.toolbar, isMobile && styles.toolbarMobile]}>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={19} color="#7F9BB8" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  onSubmitEditing={loadEvidence}
                  placeholder="Buscar empleado o correo"
                  placeholderTextColor="#70859B"
                  style={styles.searchInput}
                />
              </View>
              <TouchableOpacity style={styles.refreshButton} onPress={loadEvidence} disabled={evidenceLoading}>
                <Ionicons name="search-outline" size={19} color="#071C35" />
                <Text style={styles.refreshText}>Buscar</Text>
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.errorMessage}>{error}</Text> : null}

            {evidenceLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color="#65B9FF" size="large" />
                <Text style={styles.loadingText}>Cargando evidencias…</Text>
              </View>
            ) : evidence.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="images-outline" size={42} color="#58748F" />
                <Text style={styles.emptyTitle}>No hay evidencias faciales</Text>
              </View>
            ) : (
              <View style={styles.evidenceList}>
                {evidence.map(item => (
                  <View style={[styles.evidenceCard, isMobile && styles.evidenceCardMobile]} key={`${item.kind || 'attendance'}-${item.evidenceId}`}>
                    <View style={styles.evidenceIcon}>
                      <Ionicons name="scan-outline" size={25} color="#76C4FF" />
                    </View>
                    <View style={styles.evidenceInfo}>
                      <Text style={styles.userName}>{item.employeeName || 'Empleado'}</Text>
                      <Text style={styles.userEmail}>{item.email || `Empleado #${item.employeeId}`}</Text>
                      <View style={styles.evidenceMeta}>
                        <Text style={styles.detailText}>
                          {item.kind === 'enrollment'
                            ? `Registro: ${item.captureAngle === 'front' ? 'Frente' : item.captureAngle === 'left' ? 'Lado izquierdo' : 'Lado derecho'}`
                            : item.checkType === 0 ? 'Entrada' : 'Salida'}
                        </Text>
                        <Text style={styles.detailText}>•</Text>
                        <Text style={styles.detailText}>{formatDate(item.markedAt || item.capturedAt)}</Text>
                        {item.kind !== 'enrollment' && <Text style={styles.detailText}>• IP: {item.captureIp || 'No disponible'}</Text>}
                      </View>
                      <Text style={styles.locationText}>
                        {item.kind === 'enrollment' ? 'Plantilla de registro facial' : item.locationSource || 'Ubicación no disponible'}
                      </Text>
                    </View>
                    <TouchableOpacity style={[styles.photoButton, isMobile && styles.photoButtonMobile]} onPress={() => openPhoto(item)}>
                      <Ionicons name="eye-outline" size={19} color="#071C35" />
                      <Text style={styles.photoButtonText}>Ver fotografía</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={Boolean(selectedEvidence)} transparent animationType="fade" onRequestClose={closePhoto}>
        <Pressable style={styles.photoBackdrop} onPress={closePhoto}>
          <Pressable style={[styles.photoModal, isMobile && styles.photoModalMobile]} onPress={() => {}}>
            <View style={styles.photoHeader}>
              <View>
                <Text style={styles.eyebrow}>{selectedEvidence?.kind === 'enrollment' ? 'ROSTRO REGISTRADO' : 'EVIDENCIA FACIAL'}</Text>
                <Text style={styles.photoTitle}>{selectedEvidence?.employeeName}</Text>
                <Text style={styles.userEmail}>{formatDate(selectedEvidence?.markedAt || selectedEvidence?.capturedAt)}</Text>
              </View>
              <TouchableOpacity style={styles.closePhotoButton} onPress={closePhoto}>
                <Ionicons name="close" size={23} color="#DCEBFA" />
              </TouchableOpacity>
            </View>
            <View style={[styles.photoFrame, isMobile && styles.photoFrameMobile]}>
              {photoLoading ? (
                <ActivityIndicator color="#65B9FF" size="large" />
              ) : photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.photoImage} resizeMode="contain" />
              ) : (
                <Text style={styles.errorMessage}>No se pudo cargar la fotografía.</Text>
              )}
            </View>
            <Text style={styles.photoPrivacy}>Acceso restringido a SUPER_ADMIN · No compartir sin autorización.</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles: Record<string, any> = {
  page: { flex: 1, minHeight: '100vh', backgroundColor: '#071321' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingHorizontal: 24, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#18314A', backgroundColor: '#0B1929' },
  headerMobile: { alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 16 },
  backButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#152A40', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  eyebrow: { color: '#65B9FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: '#FFFFFF', fontSize: 25, fontWeight: '800', marginTop: 2 },
  titleMobile: { fontSize: 22 },
  subtitle: { color: '#94AAC0', fontSize: 13, marginTop: 4 },
  content: { width: '100%', maxWidth: 1200, alignSelf: 'center', padding: 24, paddingBottom: 50 },
  contentMobile: { padding: 12, paddingBottom: 36 },
  tabs: { flexDirection: 'row', alignSelf: 'flex-start', gap: 8, padding: 5, borderRadius: 13, backgroundColor: '#0D1D2E', borderWidth: 1, borderColor: '#213D56', marginBottom: 18 },
  tabsMobile: { alignSelf: 'stretch', width: '100%', gap: 4 },
  tab: { minHeight: 40, paddingHorizontal: 15, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  tabMobile: { flex: 1, minWidth: 0, paddingHorizontal: 7, gap: 5 },
  activeTab: { backgroundColor: '#77C3FF' },
  tabText: { color: '#9AB1C7', fontSize: 12.5, fontWeight: '700' },
  tabTextMobile: { fontSize: 11.5, flexShrink: 1 },
  activeTabText: { color: '#071C35', fontWeight: '900' },
  toolbar: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  toolbarMobile: { flexDirection: 'column', gap: 9 },
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
  cardMobile: { flexBasis: 'auto', flexGrow: 0, width: '100%', maxWidth: '100%', padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cardTopMobile: { flexWrap: 'wrap', alignItems: 'flex-start' },
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
  evidenceList: { gap: 11 },
  evidenceCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderRadius: 14, borderWidth: 1, borderColor: '#213D56', backgroundColor: '#0D1D2E' },
  evidenceCardMobile: { flexDirection: 'column', alignItems: 'stretch', padding: 13 },
  evidenceIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#17304A', alignItems: 'center', justifyContent: 'center' },
  evidenceInfo: { flex: 1, minWidth: 0 },
  evidenceMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 5 },
  locationText: { color: '#5FAEEA', fontSize: 11, marginTop: 5 },
  photoButton: { minHeight: 41, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#77C3FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  photoButtonMobile: { width: '100%', marginTop: 4 },
  photoButtonText: { color: '#071C35', fontSize: 12, fontWeight: '900' },
  photoBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.84)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  photoModal: { width: '100%', maxWidth: 720, maxHeight: '92vh', borderRadius: 18, borderWidth: 1, borderColor: '#2A4965', backgroundColor: '#0D1D2E', padding: 18 },
  photoModalMobile: { padding: 12, maxHeight: '88vh', borderRadius: 14 },
  photoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  photoTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 3 },
  closePhotoButton: { width: 39, height: 39, borderRadius: 20, backgroundColor: '#18314A', alignItems: 'center', justifyContent: 'center' },
  photoFrame: { width: '100%', minHeight: 320, maxHeight: '68vh', aspectRatio: 4 / 3, backgroundColor: '#040B12', borderRadius: 13, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photoFrameMobile: { minHeight: 210, maxHeight: '58vh' },
  photoImage: { width: '100%', height: '100%' },
  photoPrivacy: { color: '#7089A1', fontSize: 10.5, textAlign: 'center', marginTop: 11 },
};
