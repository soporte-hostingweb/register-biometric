import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [marcaciones, setMarcaciones] = useState<Marcacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [cargo, setCargo] = useState<string | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > 768;
  const { fullName, rol, email } = useLocalSearchParams<{ fullName: string; rol: string; email: string }>();

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
          await fetch('http://15.235.16.229:3000/api/users/push-token', {
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
        const response = await fetch(`http://15.235.16.229:3000/api/attendance/logs?date=${todayStr}&t=${Date.now()}`);
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
              const checkTime = log.CHECKTIME ? new Date(log.CHECKTIME) : new Date();
              const horaStr = checkTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
        const response = await fetch(`http://15.235.16.229:3000/api/attendance/history/by-email/${email}`);
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
        const response = await fetch('http://15.235.16.229:3000/api/empleados');
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

  const handleMarcar = async () => {
    if (completadoHoy) {
      setMessage('Ya registraste tu Entrada y Salida por el día de hoy');
      return;
    }

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
      const ubicacion = `${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`;

      const nuevaMarcacion: Marcacion = {
        id: Date.now().toString(),
        tipo: siguienteTipo,
        fecha: todayStr,
        hora: new Date().toLocaleTimeString(),
        ubicacion,
      };

      const nuevasMarcaciones = [...marcaciones, nuevaMarcacion];
      setMarcaciones(nuevasMarcaciones);
      const key = getStorageKey(email);
      await AsyncStorage.setItem(key, JSON.stringify(nuevasMarcaciones));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 segundos de límite

      try {
        const checkType = siguienteTipo === 'Entrada' ? 0 : 1;
        const res = await fetch('http://15.235.16.229:3000/api/attendance/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            checkType,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
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
      } catch (apiErr: any) {
        clearTimeout(timeoutId);
        console.log('Aviso: Error en el registro del servidor:', apiErr);
        if (apiErr.name === 'AbortError') {
          throw new Error('Tiempo de espera agotado. Asegúrate de estar conectado al Wi-Fi de la oficina.');
        }
        throw apiErr;
      }

      // Refrescar el historial en las estadísticas
      try {
        const historyRes = await fetch(`http://15.235.16.229:3000/api/attendance/history/by-email/${email}`);
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          setHistoryLogs(historyData);
        }
      } catch (err) {
        console.log('Error refrescando estadísticas:', err);
      }

      setMessage(`${siguienteTipo} registrada correctamente`);
    } catch (error: any) {
      setMessage(error.message || 'No se pudo registrar la asistencia');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setMenuVisible(false);
    router.replace('/');
  };

  const handlePerfil = () => {
    setMenuVisible(false);
    router.push({
      pathname: '/perfil',
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

  const downloadExcel = () => {
    if (historyLogs.length === 0) return;
    
    let excelContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
        <style>
          table { border-collapse: collapse; margin-top: 10px; }
          th { background-color: #1E3A5F; color: #FFFFFF; font-weight: bold; border: 1px solid #DDDDDD; padding: 8px; }
          td { border: 1px solid #DDDDDD; padding: 8px; text-align: left; }
        </style>
      </head>
      <body>
        <h3>Reporte de Asistencia - ${(fullName || 'Empleado')}</h3>
        <p>Generado el: ${new Date().toLocaleDateString('es-PE')}</p>
        <table>
          <tr>
            <th>Fecha</th>
            <th>Entrada</th>
            <th>Salida</th>
            <th>Horas Trabajadas</th>
            <th>Estado</th>
            <th>Observaciones</th>
          </tr>
    `;
    
    historyLogs.forEach((log: any) => {
      const dateObj = new Date(log.date);
      const dateStr = dateObj.toLocaleDateString('es-PE');
      
      const clockIn = log.clockIn || '--';
      const clockOut = log.clockOut || '--';
      const hours = log.totalHours || '0h';
      const status = log.status || 'Registrado';
      const obs = log.observations || '';
      
      excelContent += `
        <tr>
          <td>${dateStr}</td>
          <td>${clockIn}</td>
          <td>${clockOut}</td>
          <td>${hours}</td>
          <td>${status}</td>
          <td>${obs}</td>
        </tr>
      `;
    });
    
    excelContent += `
        </table>
      </body>
      </html>
    `;
    
    if (Platform.OS === 'web') {
      const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `reporte_asistencia_${(fullName || 'empleado').replace(/\s+/g, '_')}.xls`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const downloadPDF = () => {
    if (historyLogs.length === 0) return;
    
    if (Platform.OS === 'web') {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      
      let html = `
        <html>
        <head>
          <title>Reporte de Asistencia - ${fullName}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #333; }
            .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #208AEF; padding-bottom: 15px; margin-bottom: 25px; }
            .logo-text { font-size: 26px; font-weight: 800; color: #1E3A5F; letter-spacing: 1px; }
            .report-title { font-size: 20px; font-weight: 600; color: #555; }
            .meta-info { margin-bottom: 30px; line-height: 1.6; font-size: 14px; background-color: #F4F6F9; padding: 15px; borderRadius: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #E0E0E0; padding: 10px 12px; text-align: left; font-size: 12px; }
            th { background-color: #1E3A5F; color: white; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
            tr:nth-child(even) { background-color: #F9FBFD; }
            .status { font-weight: 700; padding: 3px 6px; borderRadius: 4px; font-size: 10px; text-transform: uppercase; }
            .status-Puntual { color: #4CAF50; background-color: rgba(76,175,80,0.1); }
            .status-Tardanza { color: #FF9800; background-color: rgba(255,152,0,0.1); }
            .status-Falta, .status-Inasistencia { color: #F44336; background-color: rgba(244,67,54,0.1); }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div class="logo-text">HWPerú</div>
            <div class="report-title">Reporte Mensual de Asistencia</div>
          </div>
          <div class="meta-info">
            <div><strong>Colaborador:</strong> ${fullName}</div>
            <div><strong>Correo Electrónico:</strong> ${email}</div>
            <div><strong>Cargo:</strong> ${cargo || 'Técnico'}</div>
            <div><strong>Fecha de Emisión:</strong> ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Horas Trab.</th>
                <th>Estado</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      historyLogs.forEach((log: any) => {
        const dateObj = new Date(log.date);
        const dateStr = dateObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        let statusClass = 'status-Puntual';
        if (log.status === 'Tardanza') {
          statusClass = 'status-Tardanza';
        } else if (log.status === 'Falta' || log.status === 'Inasistencia') {
          statusClass = 'status-Falta';
        }

        html += `
          <tr>
            <td><strong>${dateStr}</strong></td>
            <td>${log.clockIn || '--'}</td>
            <td>${log.clockOut || '--'}</td>
            <td>${log.totalHours || '0h'}</td>
            <td><span class="status ${statusClass}">${log.status || 'Registrado'}</span></td>
            <td>${log.observations || ''}</td>
          </tr>
        `;
      });
      
      html += `
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
        </html>
      `;
      
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const renderLocation = (loc: string) => {
    if (!loc) return null;
    const coordsReg = /^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/;
    if (coordsReg.test(loc.trim())) {
      const [lat, lng] = loc.trim().split(',');
      return (
        <TouchableOpacity
          onPress={() => {
            if (Platform.OS === 'web') {
              window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
            }
          }}
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}
          activeOpacity={0.7}
        >
          <Ionicons name="location" size={14} color="#208AEF" />
          <Text style={[styles.historyLocation, { color: '#208AEF', textDecorationLine: 'underline', marginTop: 0 }]}>
            Ver en Google Maps
          </Text>
        </TouchableOpacity>
      );
    }
    return <Text style={styles.historyLocation}>{loc}</Text>;
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

                <TouchableOpacity
                  style={[styles.markButton, (loading || completadoHoy) && styles.markButtonDisabled]}
                  onPress={handleMarcar}
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

              {/* Historial de hoy */}
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

            {/* Columna Derecha: Estadísticas del mes y Historial Reciente */}
            <View style={styles.desktopRightCol}>
              {/* PANEL DE ESTADÍSTICAS MENSUALES */}
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

              {/* HISTORIAL RECIENTE (ÚLTIMOS DÍAS DEL MES) */}
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
                            🚪 Ent: {log.clockIn || '--'} | 🚪 Sal: {log.clockOut || '--'}
                          </Text>
                          <Text style={styles.recentHours}>{log.totalHours || '0h'}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        ) : (
          <>
            {/* PANEL DE ESTADÍSTICAS MENSUALES MÓVIL */}
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

              <TouchableOpacity
                style={[styles.markButton, (loading || completadoHoy) && styles.markButtonDisabled]}
                onPress={handleMarcar}
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

            {/* HISTORIAL DE HOY MÓVIL */}
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

            {/* HISTORIAL RECIENTE MÓVIL */}
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
                          🚪 Ent: {log.clockIn || '--'} | 🚪 Sal: {log.clockOut || '--'}
                        </Text>
                        <Text style={styles.recentHours}>{log.totalHours || '0h'}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}