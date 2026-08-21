import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, logoutFromApi } from '../services/api';
import AttendanceCamera from '../components/AttendanceCamera';
import { styles } from '../styles/dashboard';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type Marcacion = {
  id?: string;
  tipo: 'Entrada' | 'Salida';
  fecha: string;
  hora: string;
  ubicacion: string;
};

type Empleado = {
  cargo: string | null;
  email: string | null;
};

const getTodayDateStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStorageKey = (userEmail?: string | null) => {
  const cleanEmail = (userEmail || 'guest').trim().toLowerCase();
  return `@asistencia_marcaciones_${cleanEmail}`;
};

const formatLocalTimeFromUTC = (timeStr?: string | null, dateStr?: string | null): string => {
  if (!timeStr || timeStr === '--' || timeStr === '-' || timeStr === 'null') {
    return '--';
  }

  const str = String(timeStr).trim();

  if (str.includes('-') && (str.includes('T') || str.includes(' '))) {
    const formattedStr = str.replace(' ', 'T');
    const utcStr = (formattedStr.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(formattedStr))
      ? formattedStr
      : formattedStr + 'Z';
    const d = new Date(utcStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
  }

  // Extraer fecha base (YYYY-MM-DD)
  let dateBase = getTodayDateStr();
  if (dateStr) {
    const cleanDateStr = String(dateStr).trim();
    if (cleanDateStr.length >= 10) {
      dateBase = cleanDateStr.substring(0, 10);
    }
  }

  // Parsear hora (ej: "01:25 PM", "13:25:00", "8:25 a. m.")
  const lowerStr = str.toLowerCase();
  const isPM = lowerStr.includes('pm') || lowerStr.includes('p. m.') || lowerStr.includes('p.m.');
  const isAM = lowerStr.includes('am') || lowerStr.includes('a. m.') || lowerStr.includes('a.m.');

  const numbers = str.match(/\d+/g);
  if (!numbers || numbers.length === 0) {
    return timeStr;
  }

  let hours = parseInt(numbers[0], 10);
  const minutes = numbers.length > 1 ? parseInt(numbers[1], 10) : 0;
  const seconds = numbers.length > 2 ? parseInt(numbers[2], 10) : 0;

  if (isPM && hours < 12) {
    hours += 12;
  } else if (isAM && hours === 12) {
    hours = 0;
  }

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  const isoUtcStr = `${dateBase}T${hh}:${mm}:${ss}Z`;
  const dateObj = new Date(isoUtcStr);

  if (isNaN(dateObj.getTime())) {
    return timeStr;
  }

  return dateObj.toLocaleTimeString('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [marcaciones, setMarcaciones] = useState<Marcacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [cargo, setCargo] = useState<string | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [cameraPurpose, setCameraPurpose] = useState<'attendance' | 'enrollment'>('attendance');
  const [faceEnrolled, setFaceEnrolled] = useState<boolean | null>(null);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > 768;
  const { fullName, rol, email } = useLocalSearchParams<{ fullName: string; rol: string; email: string }>();

  useEffect(() => {
    const fetchFaceStatus = async () => {
      if (!email) return;
      try {
        const response = await apiFetch('/api/attendance/face-status');
        const data = await response.json().catch(() => ({}));
        if (response.ok) setFaceEnrolled(Boolean(data.enrolled));
      } catch (err) {
        console.log('No se pudo consultar el registro facial:', err);
      }
    };
    fetchFaceStatus();
  }, [email]);

  useEffect(() => {
    if (!email) {
      router.replace('/');
    }
  }, [email]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const registerPushToken = async () => {
      if (!email) return;
      try {
        if (!Device.isDevice) return;

        // Solicitar permisos de notificación
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') return;

        // Intentar obtener el token push de Expo (capturando la limitación de Expo Go SDK 53+)
        let pushToken: string | undefined;
        try {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          pushToken = tokenData.data;
        } catch (tokenError) {
          console.log('Aviso (Expo Go): Notificaciones push remotas deshabilitadas en modo Expo Go SDK 53+. Funcionará normalmente en el APK generado.');
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

  useEffect(() => {
    const syncMarcacionesWithServer = async () => {
      if (!email) return;
      try {
        const todayStr = getTodayDateStr();
        const response = await apiFetch(`/api/attendance/logs?date=${todayStr}&t=${Date.now()}`);
        if (response.ok) {
          const logs = await response.json();
          const userLogs = logs.filter((log: any) => {
            return (
              (log.email && log.email.toLowerCase() === email.toLowerCase()) ||
              (log.EMP_NOMBRE && fullName && log.EMP_NOMBRE.toLowerCase().includes(fullName.split(' ')[0].toLowerCase())) ||
              (log.NOMBRE && fullName && log.NOMBRE.toLowerCase().includes(fullName.split(' ')[0].toLowerCase()))
            );
          });

          if (userLogs.length > 0) {
            const serverMarcaciones: Marcacion[] = userLogs.map((log: any) => {
              const horaStr = log.CHECKTIME
                ? formatLocalTimeFromUTC(String(log.CHECKTIME), todayStr)
                : new Date().toLocaleTimeString('es-PE', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  timeZone: 'America/Lima',
                });
              const tipo: 'Entrada' | 'Salida' = (log.CHECKTYPE === 0 || log.CHECKTYPE === '0' || log.CHECKTYPE === 'I' || log.CHECKTYPE === 'Entrada') ? 'Entrada' : 'Salida';
              const ubicacion = log.SN ? log.SN.replace('MOBILE_GPS:', '') : 'Servidor Central';
              return {
                id: log.AttendanceLogID ? log.AttendanceLogID.toString() : Date.now().toString(),
                tipo,
                fecha: todayStr,
                hora: horaStr,
                ubicacion,
              };
            });

            serverMarcaciones.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
            setMarcaciones(serverMarcaciones);

            const key = getStorageKey(email);
            await AsyncStorage.setItem(key, JSON.stringify(serverMarcaciones));
            return;
          } else {
            // Si en el servidor no hay registros hoy (ej. borrados en SQL Server DB), reiniciar la app localmente
            setMarcaciones([]);
            const key = getStorageKey(email);
            await AsyncStorage.removeItem(key);
            return;
          }
        }
      } catch (err) {
        console.log('Servidor no disponible para sincronizar:', err);
      }

      // Fallback a almacenamiento local si no se pudo conectar al servidor
      try {
        const key = getStorageKey(email);
        const storedData = await AsyncStorage.getItem(key);
        if (storedData) {
          const parsed = JSON.parse(storedData);
          if (Array.isArray(parsed)) {
            setMarcaciones(parsed);
          }
        }
      } catch (err) {
        console.error('Error al cargar marcaciones:', err);
      }
    };

    const fetchHistory = async () => {
      if (!email) return;
      try {
        const response = await apiFetch(`/api/attendance/history/by-email/${encodeURIComponent(email)}`);
        if (response.ok) {
          const data = await response.json();
          setHistoryLogs(data);
        }
      } catch (err) {
        console.log('Error al cargar historial del servidor:', err);
      }
    };

    syncMarcacionesWithServer();
    fetchHistory();
  }, [email, fullName]);

  useEffect(() => {
    const fetchCargo = async () => {
      try {
        const response = await apiFetch('/api/empleados');
        const data = await response.json();
        const encontrado = data.find(
          (emp: Empleado) => emp.email?.toLowerCase() === email?.toLowerCase()
        );
        if (encontrado) {
          setCargo(encontrado.cargo);
        }
      } catch (err) {
        // Si falla, simplemente no se muestra el cargo
      }
    };

    if (email) {
      fetchCargo();
    }
  }, [email]);

  const todayStr = getTodayDateStr();
  const hoyMarcaciones = marcaciones.filter((m) => m.fecha === todayStr);

  const tieneEntradaHoy = hoyMarcaciones.some((m) => m.tipo === 'Entrada');
  const tieneSalidaHoy = hoyMarcaciones.some((m) => m.tipo === 'Salida');
  const completadoHoy = tieneEntradaHoy && tieneSalidaHoy;

  const siguienteTipo: 'Entrada' | 'Salida' = tieneEntradaHoy ? 'Salida' : 'Entrada';

  const openCameraFlow = () => {
    if (completadoHoy) {
      setMessage('Ya registraste tu Entrada y Salida por el día de hoy');
      return;
    }

    setCameraPurpose('attendance');
    setMessage('');
    setCameraVisible(true);
  };

  const openEnrollmentFlow = () => {
    setCameraPurpose('enrollment');
    setMessage('');
    setCameraVisible(true);
  };

  const handleEnrollFace = async (_photoDataUrl: string, faceDescriptor: number[]) => {
    setCameraVisible(false);
    setLoading(true);
    setMessage('Registrando tu rostro…');
    try {
      const response = await apiFetch('/api/attendance/face-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faceDescriptor, faceModel: 'human-faceres-v1' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'No se pudo registrar el rostro');
      setFaceEnrolled(true);
      setMessage(data.message || 'Rostro registrado correctamente');
    } catch (error: any) {
      setMessage(error.message || 'No se pudo registrar el rostro');
    } finally {
      setLoading(false);
    }
  };

  const handleMarcar = async (photoDataUrl: string, faceDescriptor: number[]) => {
    if (!photoDataUrl || !Array.isArray(faceDescriptor) || faceDescriptor.length < 64) {
      setMessage('Debes tomar una fotografía facial para registrar la asistencia');
      return;
    }

    setCameraVisible(false);
    setLoading(true);
    setMessage('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setMessage('Permiso de ubicación denegado');
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const coords = `${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`;

      let direccion = coords;
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.coords.latitude}&lon=${location.coords.longitude}&zoom=17`, {
          headers: {
            'User-Agent': 'AverageBiometricRegistrationApp'
          }
        });
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData && geoData.display_name) {
            const parts = geoData.display_name.split(',');
            direccion = parts.slice(0, 4).join(',').trim();
          }
        }
      } catch (geoErr) {
        console.log('Error al obtener dirección:', geoErr);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let registrationMessage = '';

      try {
        const checkType = siguienteTipo === 'Entrada' ? 0 : 1;
        const res = await apiFetch('/api/attendance/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            checkType,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            photoData: photoDataUrl,
            faceDescriptor,
            faceModel: 'human-faceres-v1',
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
          throw new Error(errData.message || `Error del servidor (${res.status})`);
        }
        const registerData = await res.json().catch(() => ({}));
        registrationMessage = registerData.message || '';
        if (registerData.faceEnrolled || registerData.faceVerified) setFaceEnrolled(true);
      } catch (apiErr: any) {
        clearTimeout(timeoutId);
        console.log('Aviso: Error en el registro del servidor:', apiErr);
        if (apiErr.name === 'AbortError') {
          throw new Error('Tiempo de espera agotado. Asegúrate de estar conectado al Wi-Fi de la oficina.');
        }
        throw apiErr;
      }

      const nuevaMarcacion: Marcacion = {
        id: Date.now().toString(),
        tipo: siguienteTipo,
        fecha: todayStr,
        hora: new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima' }),
        ubicacion: direccion,
      };

      const nuevasMarcaciones = [...marcaciones, nuevaMarcacion];
      setMarcaciones(nuevasMarcaciones);
      const key = getStorageKey(email);
      await AsyncStorage.setItem(key, JSON.stringify(nuevasMarcaciones));

      // Refrescar el historial en las estadísticas
      try {
        const historyRes = await apiFetch(`/api/attendance/history/by-email/${encodeURIComponent(email)}`);
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          setHistoryLogs(historyData);
        }
      } catch (err) {
        console.log('Error refrescando estadísticas:', err);
      }

      setMessage(registrationMessage || `${siguienteTipo} registrada correctamente`);
    } catch (error: any) {
      setMessage(error.message || 'No se pudo registrar la asistencia');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setMenuVisible(false);
    await logoutFromApi();
    router.replace('/');
  };

  const handlePerfil = () => {
    setMenuVisible(false);
    router.push({
      pathname: '/perfil',
      params: { fullName, rol, email },
    });
  };

  const handleConfiguracion = () => {
    setMenuVisible(false);
    router.push({
      pathname: '/configuracion' as any,
      params: { fullName, rol, email },
    });
  };

  const fecha = currentTime.toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const hora = currentTime.toLocaleTimeString();

  // Calcular estadísticas del mes actual
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const thisMonthLogs = historyLogs.filter((log: any) => {
    if (!log.date) return false;
    const logDate = new Date(log.date);
    return logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear;
  });

  const totalHours = thisMonthLogs.reduce((acc: number, curr: any) => {
    const hrs = parseFloat(curr.totalHours || '0');
    return acc + (isNaN(hrs) ? 0 : hrs);
  }, 0).toFixed(1);

  const tardanzas = thisMonthLogs.filter((log: any) => log.status === 'Tardanza').length;
  const asistencias = thisMonthLogs.filter((log: any) => log.status !== 'Falta' && log.status !== 'Inasistencia').length;

  const loadExcelJS = () => {
    return new Promise<any>((resolve, reject) => {
      if ((window as any).ExcelJS) {
        resolve((window as any).ExcelJS);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
      script.onload = () => resolve((window as any).ExcelJS);
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
  };

  const downloadExcel = async () => {
    if (thisMonthLogs.length === 0) return;

    if (Platform.OS === 'web') {
      try {
        const ExcelJS = await loadExcelJS();
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reporte de Asistencia');

        // Mostrar líneas de cuadrícula
        worksheet.views = [{ showGridLines: true }];

        // Título del Reporte
        const titleRow = worksheet.getRow(2);
        titleRow.getCell(2).value = 'REPORTE DE ASISTENCIA MENSUAL';
        titleRow.getCell(2).font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF1E3A5F' } };

        // Información del Colaborador
        const infoRow1 = worksheet.getRow(4);
        infoRow1.getCell(2).value = 'Colaborador:';
        infoRow1.getCell(2).font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF555555' } };
        infoRow1.getCell(3).value = fullName;
        infoRow1.getCell(3).font = { name: 'Segoe UI', size: 11 };

        infoRow1.getCell(5).value = 'Periodo:';
        infoRow1.getCell(5).font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF555555' } };

        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const mesNombre = meses[new Date().getMonth()];
        const anio = new Date().getFullYear();
        infoRow1.getCell(6).value = `${mesNombre} ${anio}`;
        infoRow1.getCell(6).font = { name: 'Segoe UI', size: 11 };

        const infoRow2 = worksheet.getRow(5);
        infoRow2.getCell(2).value = 'Correo:';
        infoRow2.getCell(2).font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF555555' } };
        infoRow2.getCell(3).value = email;
        infoRow2.getCell(3).font = { name: 'Segoe UI', size: 11 };

        infoRow2.getCell(5).value = 'Cargo:';
        infoRow2.getCell(5).font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF555555' } };
        infoRow2.getCell(6).value = cargo || 'Técnico';
        infoRow2.getCell(6).font = { name: 'Segoe UI', size: 11 };

        // Cabeceras de la Tabla
        const startRow = 7;
        const startCol = 2; // Inicia en columna B (2)

        const headerRow = worksheet.getRow(startRow);
        headerRow.height = 26;

        const columns = [
          { header: 'Fecha', width: 15 },
          { header: 'Entrada', width: 14 },
          { header: 'Salida', width: 14 },
          { header: 'Horas Trabajadas', width: 20 },
          { header: 'Estado', width: 16 },
          { header: 'Observaciones', width: 35 }
        ];

        columns.forEach((col, i) => {
          const cell = headerRow.getCell(startCol + i);
          cell.value = col.header;
          worksheet.getColumn(startCol + i).width = col.width;

          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1E3A5F' }
          };
          cell.font = {
            name: 'Segoe UI',
            size: 11,
            bold: true,
            color: { argb: 'FFFFFFFF' }
          };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
            left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
            bottom: { style: 'medium', color: { argb: 'FF1E3A5F' } },
            right: { style: 'thin', color: { argb: 'FFDDDDDD' } }
          };
        });

        // Filas de datos
        thisMonthLogs.forEach((log: any, index: number) => {
          const rowIndex = startRow + 1 + index;
          const dataRow = worksheet.getRow(rowIndex);
          dataRow.height = 22;

          const dateObj = new Date(log.date);
          const dateStr = dateObj.toLocaleDateString('es-PE');
          const clockIn = formatLocalTimeFromUTC(log.clockIn, log.date);
          const clockOut = formatLocalTimeFromUTC(log.clockOut, log.date);
          const hours = log.totalHours || '0h';
          const status = log.status || 'Registrado';
          const obs = log.observations || '';

          const values = [dateStr, clockIn, clockOut, hours, status, obs];

          values.forEach((val, i) => {
            const cell = dataRow.getCell(startCol + i);
            cell.value = val;
            cell.font = { name: 'Segoe UI', size: 10 };
            cell.alignment = { vertical: 'middle' };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFEAEAEA' } },
              left: { style: 'thin', color: { argb: 'FFEAEAEA' } },
              bottom: { style: 'thin', color: { argb: 'FFEAEAEA' } },
              right: { style: 'thin', color: { argb: 'FFEAEAEA' } }
            };

            // Alineaciones
            if ([0, 1, 2, 3].includes(i)) {
              cell.alignment.horizontal = 'center';
            }

            // Estilos del Estado con colores específicos
            if (i === 4) {
              cell.alignment.horizontal = 'center';
              cell.font = { name: 'Segoe UI', size: 10, bold: true };
              if (status === 'Puntual') {
                cell.font.color = { argb: 'FF2E7D32' }; // Verde
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
              } else if (status === 'Tardanza') {
                cell.font.color = { argb: 'FFE65100' }; // Naranja
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
              } else if (status === 'Falta' || status === 'Inasistencia') {
                cell.font.color = { argb: 'FFC62828' }; // Rojo
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } };
              }
            }
          });
        });

        // Escribir el buffer y descargar como .xlsx
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `reporte_asistencia_${(fullName || 'empleado').replace(/\s+/g, '_')}.xlsx`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

      } catch (error) {
        console.error('Error al generar Excel con ExcelJS:', error);
      }
    }
  };

  const loadHtml2Pdf = () => {
    return new Promise<any>((resolve, reject) => {
      if ((window as any).html2pdf) {
        resolve((window as any).html2pdf);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = () => resolve((window as any).html2pdf);
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
  };

  const downloadPDF = async () => {
    if (thisMonthLogs.length === 0) return;

    if (Platform.OS === 'web') {
      try {
        const html2pdf = await loadHtml2Pdf();

        const element = document.createElement('div');
        element.style.padding = '30px';
        element.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
        element.style.color = '#333';
        element.style.backgroundColor = '#ffffff';

        let tableRows = '';
        thisMonthLogs.forEach((log: any) => {
          const dateObj = new Date(log.date);
          const dateStr = dateObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

          let statusColor = '#4CAF50';
          let statusBg = 'rgba(76,175,80,0.1)';
          if (log.status === 'Tardanza') {
            statusColor = '#FF9800';
            statusBg = 'rgba(255,152,0,0.1)';
          } else if (log.status === 'Falta' || log.status === 'Inasistencia') {
            statusColor = '#F44336';
            statusBg = 'rgba(244,67,54,0.1)';
          }

          tableRows += `
            <tr style="border-bottom: 1px solid #E0E0E0;">
              <td style="padding: 10px 12px; font-size: 12px;"><strong>${dateStr}</strong></td>
              <td style="padding: 10px 12px; font-size: 12px;">${formatLocalTimeFromUTC(log.clockIn, log.date)}</td>
              <td style="padding: 10px 12px; font-size: 12px;">${formatLocalTimeFromUTC(log.clockOut, log.date)}</td>
              <td style="padding: 10px 12px; font-size: 12px;">${log.totalHours || '0h'}</td>
              <td style="padding: 10px 12px; font-size: 12px;">
                <span style="font-weight: 700; padding: 3px 6px; border-radius: 4px; font-size: 10px; text-transform: uppercase; color: ${statusColor}; background-color: ${statusBg};">
                  ${log.status || 'Registrado'}
                </span>
              </td>
              <td style="padding: 10px 12px; font-size: 12px;">${log.observations || ''}</td>
            </tr>
          `;
        });

        element.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #208AEF; padding-bottom: 15px; margin-bottom: 25px;">
            <div style="font-size: 26px; font-weight: 800; color: #1E3A5F; letter-spacing: 1px; font-family: sans-serif;">HWPerú</div>
            <div style="font-size: 20px; font-weight: 600; color: #555; font-family: sans-serif;">Reporte Mensual de Asistencia</div>
          </div>
          <div style="margin-bottom: 30px; line-height: 1.6; font-size: 14px; background-color: #F4F6F9; padding: 15px; border-radius: 8px;">
            <div><strong>Colaborador:</strong> ${fullName}</div>
            <div><strong>Correo Electrónico:</strong> ${email}</div>
            <div><strong>Cargo:</strong> ${cargo || 'Técnico'}</div>
            <div><strong>Fecha de Emisión:</strong> ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <thead>
              <tr style="background-color: #1E3A5F; color: white;">
                <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; border: 1px solid #1E3A5F;">Fecha</th>
                <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; border: 1px solid #1E3A5F;">Entrada</th>
                <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; border: 1px solid #1E3A5F;">Salida</th>
                <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; border: 1px solid #1E3A5F;">Horas Trab.</th>
                <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; border: 1px solid #1E3A5F;">Estado</th>
                <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; border: 1px solid #1E3A5F;">Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        `;

        const opt = {
          margin: 10,
          filename: `reporte_asistencia_${(fullName || 'empleado').replace(/\s+/g, '_')}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().from(element).set(opt).save();
      } catch (error) {
        console.error('Error al generar PDF:', error);
      }
    }
  };

  const renderLocation = (loc: string) => {
    if (!loc) return null;
    const coordsReg = /^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/;
    const isCoords = coordsReg.test(loc.trim());

    return (
      <TouchableOpacity
        onPress={() => {
          if (Platform.OS === 'web') {
            const query = isCoords ? loc.trim() : encodeURIComponent(loc.trim());
            window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
          }
        }}
        style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}
        activeOpacity={0.7}
      >
        <Ionicons name="location" size={14} color="#208AEF" />
        <Text style={[styles.historyLocation, { color: '#208AEF', textDecorationLine: 'underline', marginTop: 0 }]}>
          {loc}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.wrapper} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {fullName}</Text>
          {cargo && <Text style={styles.roleTag}>Cargo: {cargo}</Text>}
        </View>

        <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)}>
          <View style={styles.avatarButton}>
            <Ionicons name="person-outline" size={18} color="#208AEF" />
          </View>
        </TouchableOpacity>
      </View>

      <Modal visible={menuVisible} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.dropdown}>
            <TouchableOpacity style={styles.dropdownItem} onPress={handlePerfil}>
              <Ionicons name="person-outline" size={18} color="#1A1D29" />
              <Text style={styles.dropdownText}>Mi perfil</Text>
            </TouchableOpacity>

            {rol === 'SUPER_ADMIN' && (
              <>
                <View style={styles.dropdownDivider} />
                <TouchableOpacity style={styles.dropdownItem} onPress={handleConfiguracion}>
                  <Ionicons name="settings-outline" size={18} color="#1A1D29" />
                  <Text style={styles.dropdownText}>Configuración</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.dropdownDivider} />

            <TouchableOpacity style={styles.dropdownItem} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color="#E53935" />
              <Text style={[styles.dropdownText, styles.logoutText]}>Cerrar sesión</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={[styles.content, isDesktop && styles.desktopContent]}>
        {isDesktop ? (
          <View style={styles.desktopContainer}>
            {/* Columna Izquierda: Reloj y Botón de Marcación, Historial de hoy */}
            <View style={styles.desktopLeftCol}>
              <View style={[styles.clockCard, { marginTop: 0, maxWidth: '100%' }]}>
                <Text style={styles.date}>{fecha}</Text>
                <Text style={styles.clock}>{hora}</Text>

                {faceEnrolled === false && (
                  <TouchableOpacity
                    style={[styles.markButton, { backgroundColor: '#173A5E', marginBottom: 10 }, loading && styles.markButtonDisabled]}
                    onPress={openEnrollmentFlow}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.markButtonText}>Registrar mi rostro</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.markButton, (loading || completadoHoy) && styles.markButtonDisabled]}
                  onPress={openCameraFlow}
                  disabled={loading || completadoHoy}
                  activeOpacity={0.85}
                >
                  <Text style={styles.markButtonText}>
                    {loading
                      ? 'Registrando...'
                      : completadoHoy
                        ? 'Marcación completada hoy'
                        : `Marcar ${siguienteTipo}`}
                  </Text>
                </TouchableOpacity>

                {message !== '' && <Text style={styles.message}>{message}</Text>}
              </View>

              <View style={[styles.historySection, { maxWidth: '100%', marginTop: 24 }]}>
                <Text style={styles.historyTitle}>Historial de hoy</Text>

                {hoyMarcaciones.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Ionicons name="time-outline" size={22} color="#A0A5B1" />
                    <Text style={styles.emptyText}>Aún no hay marcaciones registradas hoy</Text>
                  </View>
                ) : (
                  [...hoyMarcaciones].reverse().map((m, index) => (
                    <View key={m.id || index} style={styles.historyItem}>
                      <View
                        style={[
                          styles.historyDot,
                          m.tipo === 'Entrada' ? styles.dotIn : styles.dotOut,
                        ]}
                      />
                      <View style={styles.historyInfo}>
                        <Text style={styles.historyType}>{m.tipo}</Text>
                        <Text style={styles.historyTime}>{m.hora}</Text>
                        {renderLocation(m.ubicacion)}
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>

            <View style={styles.desktopRightCol}>
              <View style={[styles.statsSection, { marginTop: 0, maxWidth: '100%' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={[styles.historyTitle, { marginBottom: 0 }]}>Resumen del Mes</Text>
                  {Platform.OS === 'web' && historyLogs.length > 0 && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={downloadExcel}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: '#1B5E20',
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          gap: 6,
                        }}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="document-text-outline" size={14} color="#A5D6A7" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#A5D6A7' }}>Excel</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={downloadPDF}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: '#B71C1C',
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          gap: 6,
                        }}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="document-outline" size={14} color="#EF9A9A" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF9A9A' }}>PDF</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statCard}>
                    <Ionicons name="time-outline" size={16} color="#208AEF" />
                    <Text style={styles.statLabel}>Horas del Mes</Text>
                    <Text style={styles.statValue}>{totalHours}h</Text>
                  </View>

                  <View style={styles.statCard}>
                    <Ionicons name="calendar-outline" size={16} color="#66BB6A" />
                    <Text style={styles.statLabel}>Asistencias</Text>
                    <Text style={[styles.statValue, styles.statValueGood]}>{asistencias}</Text>
                  </View>

                  <View style={styles.statCard}>
                    <Ionicons name="warning-outline" size={16} color="#FFA726" />
                    <Text style={styles.statLabel}>Tardanzas</Text>
                    <Text style={[styles.statValue, tardanzas > 0 && styles.statValueWarn]}>{tardanzas}</Text>
                  </View>
                </View>
              </View>

              {historyLogs.length > 0 && (
                <View style={[styles.historySection, { marginTop: 24, maxWidth: '100%' }]}>
                  <Text style={styles.historyTitle}>Historial Reciente (Últimos días)</Text>

                  {historyLogs.slice(0, 5).map((log: any, idx: number) => {
                    const dateObj = new Date(log.date);
                    const formattedDate = dateObj.toLocaleDateString('es-PE', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    });

                    let badgeStyle = styles.badgePuntual;
                    let textStyle = styles.textPuntual;
                    if (log.status === 'Tardanza') {
                      badgeStyle = styles.badgeTardanza;
                      textStyle = styles.textTardanza;
                    } else if (log.status === 'Falta' || log.status === 'Inasistencia') {
                      badgeStyle = styles.badgeFalta;
                      textStyle = styles.textFalta;
                    }

                    return (
                      <View key={idx} style={styles.recentItem}>
                        <View style={styles.recentItemHeader}>
                          <Text style={styles.recentDate}>{formattedDate}</Text>
                          <View style={[styles.statusBadge, badgeStyle]}>
                            <Text style={[styles.badgeText, textStyle]}>{log.status || 'Registrado'}</Text>
                          </View>
                        </View>
                        <View style={styles.recentItemDetails}>
                          <Text style={styles.recentTimeText}>
                            🚪 Ent: {formatLocalTimeFromUTC(log.clockIn, log.date)} | 🚪 Sal: {formatLocalTimeFromUTC(log.clockOut, log.date)}
                          </Text>
                          <Text style={styles.recentHours}>{log.totalHours || '0h'}</Text>
                        </View>
                      </View>
                    );
                  })}

                  {historyLogs.length > 5 && (
                    <TouchableOpacity
                      style={styles.viewFullHistoryBtn}
                      onPress={() => setShowFullHistory(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="calendar-outline" size={16} color="#208AEF" />
                      <Text style={styles.viewFullHistoryText}>Ver historial completo ({historyLogs.length} registros)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>
        ) : (
          <>
            <View style={styles.statsSection}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={[styles.historyTitle, { marginBottom: 0 }]}>Resumen del Mes</Text>
                {Platform.OS === 'web' && historyLogs.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      onPress={downloadExcel}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#1B5E20',
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 6,
                        gap: 4,
                      }}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="document-text-outline" size={12} color="#A5D6A7" />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#A5D6A7' }}>Excel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={downloadPDF}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#B71C1C',
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 6,
                        gap: 4,
                      }}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="document-outline" size={12} color="#EF9A9A" />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#EF9A9A' }}>PDF</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Ionicons name="time-outline" size={16} color="#208AEF" />
                  <Text style={styles.statLabel}>Horas del Mes</Text>
                  <Text style={styles.statValue}>{totalHours}h</Text>
                </View>

                <View style={styles.statCard}>
                  <Ionicons name="calendar-outline" size={16} color="#66BB6A" />
                  <Text style={styles.statLabel}>Asistencias</Text>
                  <Text style={[styles.statValue, styles.statValueGood]}>{asistencias}</Text>
                </View>

                <View style={styles.statCard}>
                  <Ionicons name="warning-outline" size={16} color="#FFA726" />
                  <Text style={styles.statLabel}>Tardanzas</Text>
                  <Text style={[styles.statValue, tardanzas > 0 && styles.statValueWarn]}>{tardanzas}</Text>
                </View>
              </View>
            </View>

            <View style={styles.clockCard}>
              <Text style={styles.date}>{fecha}</Text>
              <Text style={styles.clock}>{hora}</Text>

              {faceEnrolled === false && (
                <TouchableOpacity
                  style={[styles.markButton, { backgroundColor: '#173A5E', marginBottom: 10 }, loading && styles.markButtonDisabled]}
                  onPress={openEnrollmentFlow}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.markButtonText}>Registrar mi rostro</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.markButton, (loading || completadoHoy) && styles.markButtonDisabled]}
                onPress={openCameraFlow}
                disabled={loading || completadoHoy}
                activeOpacity={0.85}
              >
                <Text style={styles.markButtonText}>
                  {loading
                    ? 'Registrando...'
                    : completadoHoy
                      ? 'Marcación completada hoy'
                      : `Marcar ${siguienteTipo}`}
                </Text>
              </TouchableOpacity>

              {message !== '' && <Text style={styles.message}>{message}</Text>}
            </View>

            <View style={styles.historySection}>
              <Text style={styles.historyTitle}>Historial de hoy</Text>

              {hoyMarcaciones.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="time-outline" size={22} color="#A0A5B1" />
                  <Text style={styles.emptyText}>Aún no hay marcaciones registradas hoy</Text>
                </View>
              ) : (
                [...hoyMarcaciones].reverse().map((m, index) => (
                  <View key={m.id || index} style={styles.historyItem}>
                    <View
                      style={[
                        styles.historyDot,
                        m.tipo === 'Entrada' ? styles.dotIn : styles.dotOut,
                      ]}
                    />
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyType}>{m.tipo}</Text>
                      <Text style={styles.historyTime}>{m.hora}</Text>
                      {renderLocation(m.ubicacion)}
                    </View>
                  </View>
                ))
              )}
            </View>

            {historyLogs.length > 0 && (
              <View style={[styles.historySection, { marginTop: 24, marginBottom: 20 }]}>
                <Text style={styles.historyTitle}>Historial Reciente (Últimos días)</Text>

                {historyLogs.slice(0, 5).map((log: any, idx: number) => {
                  const dateObj = new Date(log.date);
                  const formattedDate = dateObj.toLocaleDateString('es-PE', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

                  let badgeStyle = styles.badgePuntual;
                  let textStyle = styles.textPuntual;
                  if (log.status === 'Tardanza') {
                    badgeStyle = styles.badgeTardanza;
                    textStyle = styles.textTardanza;
                  } else if (log.status === 'Falta' || log.status === 'Inasistencia') {
                    badgeStyle = styles.badgeFalta;
                    textStyle = styles.textFalta;
                  }

                  return (
                    <View key={idx} style={styles.recentItem}>
                      <View style={styles.recentItemHeader}>
                        <Text style={styles.recentDate}>{formattedDate}</Text>
                        <View style={[styles.statusBadge, badgeStyle]}>
                          <Text style={[styles.badgeText, textStyle]}>{log.status || 'Registrado'}</Text>
                        </View>
                      </View>
                      <View style={styles.recentItemDetails}>
                        <Text style={styles.recentTimeText}>
                          🚪 Ent: {formatLocalTimeFromUTC(log.clockIn, log.date)} | 🚪 Sal: {formatLocalTimeFromUTC(log.clockOut, log.date)}
                        </Text>
                        <Text style={styles.recentHours}>{log.totalHours || '0h'}</Text>
                      </View>
                    </View>
                  );
                })}

                {historyLogs.length > 5 && (
                  <TouchableOpacity
                    style={styles.viewFullHistoryBtn}
                    onPress={() => setShowFullHistory(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="calendar-outline" size={16} color="#208AEF" />
                    <Text style={styles.viewFullHistoryText}>Ver historial completo ({historyLogs.length} registros)</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={showFullHistory} transparent animationType="slide">
        <View style={styles.fullHistoryOverlay}>
          <View style={styles.fullHistoryContainer}>
            <View style={styles.fullHistoryHeader}>
              <Text style={styles.fullHistoryTitle}>Historial Completo del Mes</Text>
              <TouchableOpacity
                onPress={() => setShowFullHistory(false)}
                style={styles.fullHistoryCloseBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.fullHistorySummary}>
              <View style={styles.fullHistorySummaryItem}>
                <Ionicons name="time-outline" size={14} color="#208AEF" />
                <Text style={styles.fullHistorySummaryText}>{totalHours}h trabajadas</Text>
              </View>
              <View style={styles.fullHistorySummaryItem}>
                <Ionicons name="checkmark-circle-outline" size={14} color="#66BB6A" />
                <Text style={styles.fullHistorySummaryText}>{asistencias} asistencias</Text>
              </View>
              <View style={styles.fullHistorySummaryItem}>
                <Ionicons name="warning-outline" size={14} color="#FFA726" />
                <Text style={styles.fullHistorySummaryText}>{tardanzas} tardanzas</Text>
              </View>
            </View>

            <ScrollView style={styles.fullHistoryScroll} showsVerticalScrollIndicator={false}>
              {thisMonthLogs.map((log: any, idx: number) => {
                const dateObj = new Date(log.date);
                const formattedDate = dateObj.toLocaleDateString('es-PE', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });

                let badgeStyle = styles.badgePuntual;
                let textStyle = styles.textPuntual;
                if (log.status === 'Tardanza') {
                  badgeStyle = styles.badgeTardanza;
                  textStyle = styles.textTardanza;
                } else if (log.status === 'Falta' || log.status === 'Inasistencia') {
                  badgeStyle = styles.badgeFalta;
                  textStyle = styles.textFalta;
                }

                return (
                  <View key={idx} style={styles.recentItem}>
                    <View style={styles.recentItemHeader}>
                      <Text style={styles.recentDate}>{formattedDate}</Text>
                      <View style={[styles.statusBadge, badgeStyle]}>
                        <Text style={[styles.badgeText, textStyle]}>{log.status || 'Registrado'}</Text>
                      </View>
                    </View>
                    <View style={styles.recentItemDetails}>
                      <Text style={styles.recentTimeText}>
                        🚪 Ent: {formatLocalTimeFromUTC(log.clockIn, log.date)} | 🚪 Sal: {formatLocalTimeFromUTC(log.clockOut, log.date)}
                      </Text>
                      <Text style={styles.recentHours}>{log.totalHours || '0h'}</Text>
                    </View>
                  </View>
                );
              })}
              {thisMonthLogs.length === 0 && (
                <View style={styles.emptyCard}>
                  <Ionicons name="calendar-outline" size={28} color="#A0A5B1" />
                  <Text style={styles.emptyText}>No hay registros este mes</Text>
                </View>
              )}
            </ScrollView>
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
    </SafeAreaView>
  );
}
