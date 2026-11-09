import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Platform, Pressable, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import AttendanceCamera from '../components/AttendanceCamera';
import type { EnrollmentCapture } from '../components/AttendanceCamera.web';
import MarkTimeline from '../components/MarkTimeline';
import TabScreen from '../components/TabScreen';
import { apiFetch } from '../services/api';
import { buildMarks, fetchHistory, formatClockDate, HistoryLog, MarkItem } from '../services/attendance';
import { useLanguage } from '../services/language';
import { goToTab } from '../services/session-params';
import { getWebPushPermission, subscribeToWebPush, supportsWebPush } from '../services/web-push';
import { styles } from '../styles/dashboard';
import { colors, WIDE_MAX_WIDTH } from '../styles/theme';
import { addDays, checkTimeToInstant, formatLimaTime, formatShiftTime, limaDateStr, serverNow } from '../utils/time';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type Marcacion = MarkItem & {
  id?: string;
  // Instante de la marcación (ms), para ordenar por fecha y hora.
  instante?: number;
};

// Las dos formas de marcar: el servidor rechaza una marcación sin credencial.
type AttendanceCredential =
  | { kind: 'face'; photoDataUrl: string; faceDescriptor: number[] }
  | { kind: 'pin'; pin: string };

type Tone = 'info' | 'ok' | 'error';

// El día de hoy en Lima, con el reloj del servidor (no el del celular).
const getTodayDateStr = () => limaDateStr(serverNow());

const getStorageKey = (userEmail?: string | null) => {
  const cleanEmail = (userEmail || 'guest').trim().toLowerCase();
  return `@asistencia_marcaciones_${cleanEmail}`;
};

/** El reloj grande «09:41:32» en hora de Lima (Perú es siempre UTC-5). */
const limaClock24 = (instant: number) => {
  const d = new Date(instant - 5 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};

export default function Dashboard() {
  const { tr, language } = useLanguage();
  const { fullName, rol, email } = useLocalSearchParams<{ fullName: string; rol: string; email: string }>();
  const session = { fullName, rol, email };
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [now, setNow] = useState(() => serverNow());
  const [marcaciones, setMarcaciones] = useState<Marcacion[]>([]);
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<Tone>('info');
  const [cargo, setCargo] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [shift, setShift] = useState<{ entryTime: string | null; exitTime: string | null }>({ entryTime: null, exitTime: null });
  const [hasAttendancePin, setHasAttendancePin] = useState(false);
  const [methodPickerVisible, setMethodPickerVisible] = useState(false);
  const [pinPromptVisible, setPinPromptVisible] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [cameraVisible, setCameraVisible] = useState(false);
  const [cameraPurpose, setCameraPurpose] = useState<'attendance' | 'enrollment'>('attendance');
  const [faceEnrolled, setFaceEnrolled] = useState<boolean | null>(null);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [pushActivating, setPushActivating] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  const notify = (text: string, tone: Tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  useEffect(() => {
    if (!email) router.replace('/');
  }, [email]);

  // Hora del servidor (header Date de la API), no la del celular.
  useEffect(() => {
    const interval = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(interval);
  }, []);

  useFocusEffect(useCallback(() => {
    if (!email) return;
    let objectUrl: string | null = null;
    const loadProfilePhoto = async () => {
      try {
        const response = await apiFetch(`/api/auth/profile/photo?t=${Date.now()}`);
        if (response.ok) {
          const blob = await response.blob();
          const uri = Platform.OS === 'web'
            ? URL.createObjectURL(blob)
            : await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
          objectUrl = Platform.OS === 'web' ? uri : null;
          setProfilePhoto(uri);
          return;
        }
        const cached = await AsyncStorage.getItem(`@profile_photo_${email.trim().toLowerCase()}`);
        if (cached?.startsWith('data:image/')) setProfilePhoto(cached);
      } catch {
        setProfilePhoto(null);
      }
    };
    loadProfilePhoto();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [email]));

  useEffect(() => {
    if (!email) return;
    apiFetch('/api/attendance/face-status')
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.ok) setFaceEnrolled(Boolean(data.enrolled));
      })
      .catch((err) => console.log('No se pudo consultar el registro facial:', err));
  }, [email]);

  useEffect(() => {
    if (!email || Platform.OS !== 'web') return;
    const prepareWebPush = async () => {
      if (!supportsWebPush()) return;
      const permission = await getWebPushPermission();
      if (permission === 'granted') {
        subscribeToWebPush().catch((error) => console.log('No se pudo renovar la suscripción push:', error));
      } else if (permission === 'default') {
        setShowPushPrompt(true);
      }
    };
    prepareWebPush();
  }, [email]);

  const activateAttendanceNotifications = async () => {
    setPushActivating(true);
    setPushMessage('');
    try {
      await subscribeToWebPush();
      setPushMessage(tr('Attendance notifications enabled.', 'Notificaciones de asistencia activadas correctamente.'));
      setTimeout(() => setShowPushPrompt(false), 1200);
    } catch (error: any) {
      setPushMessage(error?.message || tr('Notifications could not be enabled.', 'No se pudieron activar las notificaciones.'));
    } finally {
      setPushActivating(false);
    }
  };

  // Token push de la app nativa (en Expo Go no hay push remoto: se ignora).
  useEffect(() => {
    const registerPushToken = async () => {
      if (!email || !Device.isDevice) return;
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') return;

        let pushToken: string | undefined;
        try {
          pushToken = (await Notifications.getExpoPushTokenAsync()).data;
        } catch {
          console.log('Aviso (Expo Go): notificaciones push remotas deshabilitadas. Funcionará en el APK.');
        }
        if (pushToken) {
          await apiFetch('/api/users/push-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, pushToken }),
          });
        }
      } catch (err) {
        console.log('Aviso: Registro de token finalizado:', err);
      }
    };
    registerPushToken();
  }, [email]);

  // Las marcaciones de hoy, del servidor. /logs filtra por CAST(LogDateTime AS DATE)
  // y las del celular se guardan en UTC: pasadas las 19:00 de Lima caen en el día
  // siguiente. Por eso se piden hoy y mañana y se quedan las que son de hoy en Lima.
  // Devuelve si el servidor respondió.
  const cargarMarcacionesDelDia = useCallback(async (): Promise<boolean> => {
    if (!email) return false;
    const key = getStorageKey(email);
    try {
      const todayStr = getTodayDateStr();
      const pedir = (dia: string) => apiFetch(`/api/attendance/logs?date=${dia}&t=${Date.now()}`);
      const [response, responseManana] = await Promise.all([pedir(todayStr), pedir(addDays(todayStr, 1))]);
      if (response.ok) {
        const logs = [
          ...(await response.json()),
          ...(responseManana.ok ? await responseManana.json().catch(() => []) : []),
        ];
        const primerNombre = String(fullName || '').split(' ')[0].toLowerCase();
        const userLogs = logs.filter((log: any) => (
          (log.email && log.email.toLowerCase() === email.toLowerCase()) ||
          (log.EMP_NOMBRE && primerNombre && log.EMP_NOMBRE.toLowerCase().includes(primerNombre)) ||
          (log.NOMBRE && primerNombre && log.NOMBRE.toLowerCase().includes(primerNombre))
        ));

        const vistos = new Set<string>();
        const serverMarcaciones: Marcacion[] = [];
        for (const log of userLogs) {
          const id = log.AttendanceLogID ? log.AttendanceLogID.toString() : '';
          if (id && vistos.has(id)) continue;
          if (id) vistos.add(id);
          // La hora según de dónde vino: celular y manual en UTC, biométrico en Lima.
          const instante = checkTimeToInstant(log.CHECKTIME, log.SN);
          if (instante === null || limaDateStr(instante) !== todayStr) continue;
          const tipo: 'Entrada' | 'Salida' = (log.CHECKTYPE === 0 || log.CHECKTYPE === '0' || log.CHECKTYPE === 'I' || log.CHECKTYPE === 'Entrada') ? 'Entrada' : 'Salida';
          serverMarcaciones.push({
            key: id || String(instante),
            id: id || String(instante),
            tipo,
            fecha: todayStr,
            hora: formatLimaTime(instante),
            ubicacion: log.SN ? log.SN.replace('MOBILE_GPS:', '') : 'Servidor Central',
            instante,
          });
        }

        serverMarcaciones.sort((a, b) => (a.instante ?? 0) - (b.instante ?? 0));
        setMarcaciones(serverMarcaciones);
        if (serverMarcaciones.length > 0) {
          await AsyncStorage.setItem(key, JSON.stringify(serverMarcaciones));
        } else {
          // Si en el servidor no hay registros hoy (p. ej. borrados en SQL Server), se limpia lo local.
          await AsyncStorage.removeItem(key);
        }
        return true;
      }
    } catch (err) {
      console.log('Servidor no disponible para sincronizar:', err);
    }

    // Sin servidor: lo último guardado en el dispositivo.
    try {
      const storedData = await AsyncStorage.getItem(key);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        if (Array.isArray(parsed)) setMarcaciones(parsed.map((m: Marcacion) => ({ ...m, key: m.key || m.id || String(m.instante) })));
      }
    } catch (err) {
      console.error('Error al cargar marcaciones:', err);
    }
    return false;
  }, [email, fullName]);

  const refreshHistory = useCallback(async () => {
    if (!email) return;
    const data = await fetchHistory(email);
    if (data) setHistoryLogs(data);
  }, [email]);

  // Al volver a la pestaña se recarga: puede haber marcado en otro equipo.
  useFocusEffect(useCallback(() => {
    cargarMarcacionesDelDia();
    refreshHistory();
  }, [cargarMarcacionesDelDia, refreshHistory]));

  useEffect(() => {
    // /api/auth/profile devuelve los datos del propio usuario sin permisos especiales.
    const fetchProfile = async () => {
      try {
        const response = await apiFetch('/api/auth/profile');
        if (!response.ok) return;
        const employee = (await response.json())?.employee;
        if (!employee) return;
        if (employee.cargo) setCargo(employee.cargo);
        // El área solo aparece si el backend la manda (contrato activo: DepartmentName).
        const areaValue = employee.area || employee.departamento || employee.department;
        if (areaValue) setArea(String(areaValue));
        setShift({ entryTime: formatShiftTime(employee.entryTime), exitTime: formatShiftTime(employee.exitTime) });
      } catch {
        // Sin perfil simplemente no se muestran cargo ni turno.
      }
    };

    // El backend nunca devuelve el PIN, solo si existe: es una credencial cifrada.
    const fetchPinStatus = async () => {
      try {
        const response = await apiFetch('/api/attendance/me/biometric-pin');
        if (!response.ok) return;
        setHasAttendancePin(Boolean((await response.json())?.hasAttendancePin));
      } catch {
        // Sin respuesta simplemente no se ofrece la opción de PIN.
      }
    };

    if (email) {
      fetchProfile();
      fetchPinStatus();
    }
  }, [email]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([cargarMarcacionesDelDia(), refreshHistory()]);
    setRefreshing(false);
  };

  const todayStr = getTodayDateStr();
  const hoyMarcaciones = marcaciones.filter((m) => m.fecha === todayStr);
  const entradaHoy = hoyMarcaciones.find((m) => m.tipo === 'Entrada');
  const tieneEntradaHoy = Boolean(entradaHoy);
  const tieneSalidaHoy = hoyMarcaciones.some((m) => m.tipo === 'Salida');
  const completadoHoy = tieneEntradaHoy && tieneSalidaHoy;
  const siguienteTipo: 'Entrada' | 'Salida' = tieneEntradaHoy ? 'Salida' : 'Entrada';
  const recentMarks = buildMarks(historyLogs, hoyMarcaciones, todayStr).slice(0, isWide ? 8 : 4);

  // ---- Marcar --------------------------------------------------------------

  const alreadyDone = () => {
    if (!completadoHoy) return false;
    notify(tr('You already clocked in and out today', 'Ya registraste tu Entrada y Salida por el día de hoy'), 'info');
    return true;
  };

  const openPinPrompt = () => {
    setMethodPickerVisible(false);
    if (alreadyDone()) return;
    if (!hasAttendancePin) {
      notify(tr('You do not have an attendance PIN yet. Ask your administrator for one.', 'Todavía no tienes PIN de asistencia. Solicítalo a administración.'), 'error');
      return;
    }
    setPinValue('');
    setMessage('');
    setPinPromptVisible(true);
  };

  const openEnrollmentFlow = () => {
    setMethodPickerVisible(false);
    setCameraPurpose('enrollment');
    setMessage('');
    setCameraVisible(true);
  };

  const openCameraFlow = () => {
    setMethodPickerVisible(false);
    if (alreadyDone()) return;
    if (faceEnrolled === false) {
      openEnrollmentFlow();
      return;
    }
    setCameraPurpose('attendance');
    setMessage('');
    setCameraVisible(true);
  };

  // Un botón de marcar: si hay PIN y rostro se pregunta cuál usar; si solo hay
  // uno, va directo. Un fichaje sin verificar no se permite (el backend tampoco).
  const startMark = (tipo: 'Entrada' | 'Salida') => {
    if (alreadyDone() || tipo !== siguienteTipo) return;
    const canFace = faceEnrolled === true;
    if (hasAttendancePin && canFace) {
      setMessage('');
      setMethodPickerVisible(true);
    } else if (canFace) {
      openCameraFlow();
    } else if (hasAttendancePin) {
      openPinPrompt();
    } else if (faceEnrolled === false) {
      setMethodPickerVisible(true);
    } else {
      openPinPrompt();
    }
  };

  const confirmPinMark = () => {
    const pin = pinValue.trim();
    if (!/^[0-9]{6}$/.test(pin)) {
      notify(tr('The PIN must be exactly 6 digits', 'El PIN debe tener exactamente 6 dígitos'), 'error');
      return;
    }
    setPinPromptVisible(false);
    submitAttendance({ kind: 'pin', pin });
  };

  const handleMarcar = (photoDataUrl: string, faceDescriptor: number[]) =>
    submitAttendance({ kind: 'face', photoDataUrl, faceDescriptor });

  const handleEnrollFace = async (_photoDataUrl: string, _faceDescriptor: number[], captures?: EnrollmentCapture[]) => {
    setCameraVisible(false);
    setLoading(true);
    notify(tr('Registering your face…', 'Registrando tu rostro…'), 'info');
    try {
      if (!captures || captures.length !== 3) throw new Error(tr('You must complete the three face captures', 'Debes completar las tres capturas del rostro'));
      const response = await apiFetch('/api/attendance/face-enroll-3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captures, faceModel: 'human-faceres-v1' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'No se pudo registrar el rostro');
      setFaceEnrolled(true);
      notify(data.message || tr('Face registered successfully', 'Rostro registrado correctamente'), 'ok');
    } catch (error: any) {
      notify(error.message || 'No se pudo registrar el rostro', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Con `face` se envía la plantilla y el servidor verifica la identidad; con
  // `pin`, el PIN de asistencia. Además van la ubicación y el tipo de marcación.
  const submitAttendance = async (credential: AttendanceCredential) => {
    if (credential.kind === 'face' &&
      (!credential.photoDataUrl || !Array.isArray(credential.faceDescriptor) || credential.faceDescriptor.length < 64)) {
      notify(tr('You must take a photo to verify your identity', 'Debes tomar una fotografía para verificar tu identidad'), 'error');
      return;
    }

    setCameraVisible(false);
    setLoading(true);
    setMessage('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        notify(tr('Location permission denied', 'Permiso de ubicación denegado'), 'error');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      let direccion = `${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`;
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.coords.latitude}&lon=${location.coords.longitude}&zoom=17`, {
          headers: { 'User-Agent': 'AverageBiometricRegistrationApp' },
        });
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData?.display_name) direccion = geoData.display_name.split(',').slice(0, 4).join(',').trim();
        }
      } catch (geoErr) {
        console.log('Error al obtener dirección:', geoErr);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let registrationMessage = '';
      let registeredLogId = '';

      try {
        const res = await apiFetch('/api/attendance/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            checkType: siguienteTipo === 'Entrada' ? 0 : 1,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            ...(credential.kind === 'face'
              ? { photoData: credential.photoDataUrl, faceDescriptor: credential.faceDescriptor, faceModel: 'human-faceres-v1' }
              : { attendancePin: credential.pin }),
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Acceso Denegado: Tu IP no está autorizada. Conéctate al Wi-Fi de la oficina.');
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const similarityDetail = errData.code === 'FACE_NOT_MATCHED' && Number.isFinite(Number(errData.similarity))
            ? ` Coincidencia detectada: ${Math.round(Number(errData.similarity) * 100)}%.`
            : '';
          throw new Error(`${errData.message || `Error del servidor (${res.status})`}${similarityDetail}`);
        }
        const registerData = await res.json().catch(() => ({}));
        registrationMessage = registerData.message || '';
        registeredLogId = registerData.attendanceLogId ? String(registerData.attendanceLogId) : '';
        if (registerData.faceEnrolled || registerData.faceVerified) setFaceEnrolled(true);
      } catch (apiErr: any) {
        clearTimeout(timeoutId);
        if (apiErr.name === 'AbortError') {
          throw new Error('Tiempo de espera agotado. Asegúrate de estar conectado al Wi-Fi de la oficina.');
        }
        throw apiErr;
      }

      // La hora que vale es la del servidor: se recargan las marcaciones del día.
      // Si el servidor no contesta, se anota con el reloj ajustado al servidor.
      const recargado = await cargarMarcacionesDelDia();
      if (!recargado) {
        const instante = serverNow();
        const nuevas = [...marcaciones, {
          key: registeredLogId || String(instante),
          id: registeredLogId || String(instante),
          tipo: siguienteTipo,
          fecha: todayStr,
          hora: formatLimaTime(instante),
          ubicacion: direccion,
          instante,
        }];
        setMarcaciones(nuevas);
        await AsyncStorage.setItem(getStorageKey(email), JSON.stringify(nuevas));
      }
      await refreshHistory();
      notify(registrationMessage || `${siguienteTipo} registrada correctamente`, 'ok');
    } catch (error: any) {
      notify(error.message || 'No se pudo registrar la asistencia', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ---- Vista ---------------------------------------------------------------

  const shiftLabel = (() => {
    if (!shift.entryTime || !shift.exitTime) return null;
    const startHour = Number(shift.entryTime.slice(0, 2));
    const turno = Number.isFinite(startHour) && startHour >= 12 ? tr('Afternoon shift', 'Turno tarde') : tr('Morning shift', 'Turno mañana');
    return `${turno} · ${shift.entryTime} ${tr('to', 'a')} ${shift.exitTime}`;
  })();

  const banner = (() => {
    if (loading) return { icon: 'sync-circle' as const, text: tr('Registering…', 'Registrando…'), fg: colors.primaryText, bg: colors.primarySoft, border: '#CFDDF6' };
    if (message) {
      if (messageTone === 'error') return { icon: 'alert-circle' as const, text: message, fg: colors.red, bg: colors.redSoft, border: '#F7C9CB' };
      if (messageTone === 'ok') return { icon: 'checkmark-circle' as const, text: message, fg: colors.green, bg: colors.greenSoft, border: colors.greenBorder };
      return { icon: 'information-circle' as const, text: message, fg: colors.primaryText, bg: colors.primarySoft, border: '#CFDDF6' };
    }
    if (completadoHoy) return { icon: 'checkmark-done-circle' as const, text: tr('Day complete. See you tomorrow!', 'Jornada completa. ¡Hasta mañana!'), fg: colors.green, bg: colors.greenSoft, border: colors.greenBorder };
    if (tieneEntradaHoy) return { icon: 'time' as const, text: `${tr('Shift in progress · clocked in at', 'Jornada en curso · entraste a las')} ${entradaHoy?.hora}`, fg: colors.primaryText, bg: colors.primarySoft, border: '#CFDDF6' };
    return { icon: 'checkmark-circle' as const, text: tr('Ready to register your attendance', 'Listo para registrar tu asistencia'), fg: colors.green, bg: colors.greenSoft, border: colors.greenBorder };
  })();

  const entradaDisabled = loading || tieneEntradaHoy;
  const salidaDisabled = loading || !tieneEntradaHoy || tieneSalidaHoy;

  const profileCard = (
    <View style={[styles.card, styles.profileCard]}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          {profilePhoto
            ? <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
            : <Ionicons name="person" size={36} color={colors.primary} />}
        </View>
        <View style={styles.onlineDot} />
      </View>
      <View style={styles.profileInfo}>
        <Text style={styles.profileName} numberOfLines={2}>{fullName}</Text>
        {!!cargo && (
          <View style={styles.profileMetaRow}>
            <Ionicons name="briefcase" size={15} color={colors.muted} />
            <Text style={styles.profileMeta} numberOfLines={1}>{cargo}</Text>
          </View>
        )}
        {!!area && (
          <View style={styles.profileMetaRow}>
            <Ionicons name="business" size={15} color={colors.muted} />
            <Text style={styles.profileMeta} numberOfLines={1}>{tr('Area', 'Área')}: {area}</Text>
          </View>
        )}
      </View>
      <TouchableOpacity style={styles.profileButton} onPress={() => goToTab('perfil', session)} activeOpacity={0.75}>
        <Text style={styles.profileButtonText}>{tr('View profile', 'Ver Perfil')}</Text>
        <Ionicons name="chevron-forward" size={15} color={colors.primaryText} />
      </TouchableOpacity>
    </View>
  );

  const clockCard = (
    <View style={styles.clockCard}>
      <View style={styles.clockIconRow}>
        <View style={styles.clockLine} />
        <View style={styles.clockIcon}>
          <Ionicons name="time-outline" size={44} color={colors.primary} />
        </View>
        <View style={styles.clockLine} />
      </View>
      <Text style={styles.clock} adjustsFontSizeToFit numberOfLines={1}>{limaClock24(now)}</Text>
      <Text style={styles.clockDate}>{formatClockDate(now, language)}</Text>
      {!!shiftLabel && <Text style={styles.clockShift}>{shiftLabel}</Text>}
    </View>
  );

  const markSection = (
    <>
      <View style={[styles.banner, { backgroundColor: banner.bg, borderColor: banner.border }]}>
        <Ionicons name={banner.icon} size={24} color={banner.fg} />
        <Text style={[styles.bannerText, { color: banner.fg }]}>{banner.text}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.action, styles.actionIn, entradaDisabled && styles.actionDisabled]}
          onPress={() => startMark('Entrada')}
          disabled={entradaDisabled}
          activeOpacity={0.85}
          accessibilityLabel={tr('Clock in', 'Marcar entrada')}
        >
          <Ionicons name="enter-outline" size={34} color="#FFFFFF" />
          <Text style={styles.actionText}>{tr('Clock\nin', 'Marcar\nEntrada')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.action, styles.actionOut, salidaDisabled && styles.actionDisabled]}
          onPress={() => startMark('Salida')}
          disabled={salidaDisabled}
          activeOpacity={0.85}
          accessibilityLabel={tr('Clock out', 'Marcar salida')}
        >
          <Ionicons name="exit-outline" size={34} color="#FFFFFF" />
          <Text style={styles.actionText}>{tr('Clock\nout', 'Marcar\nSalida')}</Text>
        </TouchableOpacity>
      </View>

      {/* Alta facial pendiente: no bloquea el marcado con PIN, solo lo sugiere */}
      {faceEnrolled === false && (
        <TouchableOpacity style={styles.enrollCard} onPress={openEnrollmentFlow} disabled={loading} activeOpacity={0.8}>
          <View style={styles.enrollIcon}>
            <Ionicons name="scan-outline" size={20} color={colors.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.enrollTitle}>{tr('Register your face', 'Registra tu rostro')}</Text>
            <Text style={styles.enrollSubtitle}>{tr('Pending · takes 30 seconds', 'Pendiente · toma 30 segundos')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </TouchableOpacity>
      )}
    </>
  );

  const historyCard = (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="time-outline" size={24} color={colors.text} />
          <Text style={styles.sectionTitle}>{tr('Attendance history', 'Historial de Marcaciones')}</Text>
        </View>
        <TouchableOpacity style={styles.linkButton} onPress={() => goToTab('historial', session)} activeOpacity={0.75}>
          <Text style={styles.linkButtonText}>{tr('View all', 'Ver todo')}</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.primaryText} />
        </TouchableOpacity>
      </View>
      {recentMarks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-clear-outline" size={28} color={colors.faint} />
          <Text style={styles.emptyTitle}>{tr('No records yet', 'Aún no hay marcaciones')}</Text>
          <Text style={styles.emptyHint}>{tr('Your clock-ins and clock-outs will show up here', 'Tus entradas y salidas aparecerán aquí')}</Text>
        </View>
      ) : (
        <MarkTimeline marks={recentMarks} showLocation />
      )}
    </View>
  );

  return (
    <>
      <TabScreen
        title={tr('Attendance Record', 'Registro de Asistencia')}
        active="inicio"
        maxWidth={isWide ? WIDE_MAX_WIDTH : undefined}
        refreshing={refreshing}
        onRefresh={onRefresh}
        {...session}
      >
        {isWide ? (
          <View style={styles.wideRow}>
            <View style={styles.wideCol}>{profileCard}{clockCard}{markSection}</View>
            <View style={styles.wideCol}>{historyCard}</View>
          </View>
        ) : (
          <>
            {profileCard}
            {clockCard}
            {markSection}
            {historyCard}
          </>
        )}
      </TabScreen>

      {/* ¿Con qué se verifica la marcación? */}
      <Modal visible={methodPickerVisible} transparent animationType="fade" onRequestClose={() => setMethodPickerVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setMethodPickerVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalIcon, { backgroundColor: siguienteTipo === 'Entrada' ? colors.primarySoft : colors.orangeSoft }]}>
              <Ionicons name={siguienteTipo === 'Entrada' ? 'enter-outline' : 'exit-outline'} size={28} color={siguienteTipo === 'Entrada' ? colors.primary : colors.orange} />
            </View>
            <Text style={styles.modalTitle}>{siguienteTipo === 'Entrada' ? tr('Clock in', 'Marcar entrada') : tr('Clock out', 'Marcar salida')}</Text>
            <Text style={styles.modalText}>{tr('How do you want to verify your identity?', '¿Cómo quieres verificar tu identidad?')}</Text>

            {hasAttendancePin && (
              <TouchableOpacity style={styles.option} onPress={openPinPrompt} activeOpacity={0.8}>
                <View style={[styles.optionIcon, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="keypad-outline" size={21} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{tr('Attendance PIN', 'PIN de asistencia')}</Text>
                  <Text style={styles.optionHint}>{tr('Your 6 digits', 'Tus 6 dígitos')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.faint} />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.option} onPress={faceEnrolled === false ? openEnrollmentFlow : openCameraFlow} activeOpacity={0.8}>
              <View style={[styles.optionIcon, { backgroundColor: colors.greenSoft }]}>
                <Ionicons name="scan-outline" size={21} color={colors.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>
                  {faceEnrolled === false ? tr('Register my face', 'Registrar mi rostro') : tr('Face recognition', 'Reconocimiento facial')}
                </Text>
                <Text style={styles.optionHint}>
                  {faceEnrolled === false ? tr('Required before marking with your face', 'Necesario antes de marcar con tu rostro') : tr('Take a selfie', 'Tómate una foto')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </TouchableOpacity>

            {!hasAttendancePin && faceEnrolled === false && (
              <Text style={styles.modalMessage}>{tr('Or ask your administrator for an attendance PIN.', 'O solicita a administración tu PIN de asistencia.')}</Text>
            )}

            <TouchableOpacity onPress={() => setMethodPickerVisible(false)} style={styles.modalLater}>
              <Text style={styles.modalLaterText}>{tr('Cancel', 'Cancelar')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* PIN */}
      <Modal visible={pinPromptVisible} transparent animationType="fade" onRequestClose={() => setPinPromptVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="keypad-outline" size={26} color={colors.primary} />
            </View>
            <Text style={styles.modalTitle}>{tr('Enter your PIN', 'Ingresa tu PIN')}</Text>
            <Text style={styles.modalText}>
              {siguienteTipo === 'Entrada'
                ? tr('Confirm your clock in with your attendance PIN.', 'Confirma tu entrada con tu PIN de asistencia.')
                : tr('Confirm your clock out with your attendance PIN.', 'Confirma tu salida con tu PIN de asistencia.')}
            </Text>
            <TextInput
              value={pinValue}
              onChangeText={(text: string) => setPinValue(text.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="••••••"
              placeholderTextColor={colors.faint}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              // Evita que el gestor de contraseñas lo tome por una contraseña.
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              autoFocus
              style={styles.pinInput}
              onSubmitEditing={confirmPinMark}
            />
            <TouchableOpacity
              style={[styles.modalButton, siguienteTipo === 'Salida' && { backgroundColor: colors.orange }, pinValue.trim().length !== 6 && styles.actionDisabled]}
              onPress={confirmPinMark}
              disabled={pinValue.trim().length !== 6}
              activeOpacity={0.85}
            >
              <Text style={styles.modalButtonText}>{siguienteTipo === 'Entrada' ? tr('Clock in', 'Marcar entrada') : tr('Clock out', 'Marcar salida')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPinPromptVisible(false)} style={styles.modalLater}>
              <Text style={styles.modalLaterText}>{tr('Cancel', 'Cancelar')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Avisos push en la web */}
      <Modal visible={showPushPrompt} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}><Ionicons name="notifications" size={28} color={colors.primary} /></View>
            <Text style={styles.modalTitle}>{tr('Turn on attendance alerts', 'Activa tus alertas de asistencia')}</Text>
            <Text style={styles.modalText}>
              {tr(
                'You will get a notification on this device when your 10-minute grace period ends, even if the app is closed.',
                'Recibirás una notificación en este dispositivo cuando terminen tus 10 minutos de tolerancia, aunque la aplicación esté cerrada.',
              )}
            </Text>
            {!!pushMessage && <Text style={styles.modalMessage}>{pushMessage}</Text>}
            <TouchableOpacity style={styles.modalButton} onPress={activateAttendanceNotifications} disabled={pushActivating}>
              <Text style={styles.modalButtonText}>{pushActivating ? tr('Enabling…', 'Activando…') : tr('Allow notifications', 'Permitir notificaciones')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowPushPrompt(false)} style={styles.modalLater}>
              <Text style={styles.modalLaterText}>{tr('Not now', 'Ahora no')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <AttendanceCamera
        visible={cameraVisible}
        attendanceType={siguienteTipo}
        mode={cameraPurpose}
        onCancel={() => setCameraVisible(false)}
        onConfirm={cameraPurpose === 'enrollment' ? handleEnrollFace : handleMarcar}
      />
    </>
  );
}
