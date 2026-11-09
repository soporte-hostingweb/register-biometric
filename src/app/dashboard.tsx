import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Keyboard, Modal, Platform, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
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
  const [pinPromptVisible, setPinPromptVisible] = useState(false);
  const [pinValue, setPinValue] = useState('');
  // Error del PIN dentro del modal (p. ej. «El PIN no es correcto»).
  const [pinError, setPinError] = useState('');
  const pinInputRef = useRef<TextInput>(null);
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

  // Se marca solo con el PIN de asistencia (el reconocimiento facial se retiró).
  const openPinPrompt = (error = '') => {
    if (alreadyDone()) return;
    if (!hasAttendancePin) {
      notify(tr('You do not have an attendance PIN yet. Ask your administrator for one.', 'Todavía no tienes PIN de asistencia. Solicítalo a administración.'), 'error');
      return;
    }
    setPinValue('');
    setPinError(error);
    setMessage('');
    setPinPromptVisible(true);
  };

  const startMark = (tipo: 'Entrada' | 'Salida') => {
    if (alreadyDone() || tipo !== siguienteTipo) return;
    openPinPrompt();
  };

  // Lleva a Perfil, a la tarjeta «Cambiar PIN de asistencia».
  const goToPinReset = () => {
    Keyboard.dismiss();
    setPinPromptVisible(false);
    router.push({ pathname: '/perfil', params: { ...session, seccion: 'pin' } });
  };

  const onPinChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 6);
    setPinValue(digits);
    if (pinError) setPinError('');
    // Con los 6 dígitos el teclado ya no hace falta: se cierra.
    if (digits.length === 6) {
      pinInputRef.current?.blur();
      Keyboard.dismiss();
    }
  };

  const confirmPinMark = () => {
    const pin = pinValue.trim();
    if (!/^[0-9]{6}$/.test(pin)) {
      setPinError(tr('The PIN must be exactly 6 digits', 'El PIN debe tener exactamente 6 dígitos'));
      return;
    }
    Keyboard.dismiss();
    setPinPromptVisible(false);
    submitAttendance(pin);
  };

  // Envía el PIN de asistencia con la ubicación y el tipo de marcación.
  const submitAttendance = async (pin: string) => {
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
            attendancePin: pin,
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
          // PIN incorrecto: se vuelve a pedir, con el enlace para restablecerlo.
          if (errData.code === 'ATTENDANCE_PIN_NOT_MATCHED' || errData.code === 'ATTENDANCE_PIN_INVALID_FORMAT') {
            openPinPrompt(errData.message || tr('The PIN is not correct.', 'El PIN no es correcto.'));
            return;
          }
          throw new Error(errData.message || `Error del servidor (${res.status})`);
        }
        const registerData = await res.json().catch(() => ({}));
        registrationMessage = registerData.message || '';
        registeredLogId = registerData.attendanceLogId ? String(registerData.attendanceLogId) : '';
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
            : <Ionicons name="person" size={28} color={colors.primary} />}
        </View>
        <View style={styles.onlineDot} />
      </View>
      <View style={styles.profileInfo}>
        <Text style={styles.profileName} numberOfLines={2}>{fullName}</Text>
        {!!cargo && (
          <View style={styles.profileMetaRow}>
            <Ionicons name="briefcase" size={13} color={colors.muted} />
            <Text style={styles.profileMeta} numberOfLines={1}>{cargo}</Text>
          </View>
        )}
        {!!area && (
          <View style={styles.profileMetaRow}>
            <Ionicons name="business" size={13} color={colors.muted} />
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
          <Ionicons name="time-outline" size={26} color={colors.primary} />
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
        <Ionicons name={banner.icon} size={20} color={banner.fg} />
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
          <Ionicons name="enter-outline" size={26} color="#FFFFFF" />
          <Text style={styles.actionText}>{tr('Clock\nin', 'Marcar\nEntrada')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.action, styles.actionOut, salidaDisabled && styles.actionDisabled]}
          onPress={() => startMark('Salida')}
          disabled={salidaDisabled}
          activeOpacity={0.85}
          accessibilityLabel={tr('Clock out', 'Marcar salida')}
        >
          <Ionicons name="exit-outline" size={26} color="#FFFFFF" />
          <Text style={styles.actionText}>{tr('Clock\nout', 'Marcar\nSalida')}</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const historyCard = (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="time-outline" size={20} color={colors.text} />
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
              ref={pinInputRef}
              value={pinValue}
              onChangeText={onPinChange}
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
              style={[styles.pinInput, !!pinError && { borderColor: colors.red }]}
              onSubmitEditing={confirmPinMark}
            />
            {!!pinError && (
              <View style={styles.pinErrorBox}>
                <Ionicons name="alert-circle" size={17} color={colors.red} />
                <Text style={styles.pinErrorText}>{pinError}</Text>
              </View>
            )}
            <TouchableOpacity onPress={goToPinReset} style={styles.pinResetLink} accessibilityRole="link">
              <Text style={styles.pinResetText}>
                {pinError ? tr('Forgot your PIN? Reset PIN', '¿Olvidaste tu PIN? Restablecer PIN') : tr('Reset PIN', 'Restablecer PIN')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, siguienteTipo === 'Salida' && { backgroundColor: colors.orange }, pinValue.trim().length !== 6 && styles.actionDisabled]}
              onPress={confirmPinMark}
              disabled={pinValue.trim().length !== 6}
              activeOpacity={0.85}
            >
              <Text style={styles.modalButtonText}>{siguienteTipo === 'Entrada' ? tr('Clock in', 'Marcar entrada') : tr('Clock out', 'Marcar salida')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { Keyboard.dismiss(); setPinPromptVisible(false); }} style={styles.modalLater}>
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
    </>
  );
}
