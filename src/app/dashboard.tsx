import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Pressable } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles/dashboard';
import { useLocalSearchParams, router } from 'expo-router';

type Marcacion = {
  tipo: 'Entrada' | 'Salida';
  hora: string;
  ubicacion: string;
};

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [marcaciones, setMarcaciones] = useState<Marcacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const { fullName, rol } = useLocalSearchParams<{ fullName: string; rol: string }>();

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const ultimoTipo = marcaciones.length > 0 ? marcaciones[marcaciones.length - 1].tipo : 'Salida';
  const siguienteTipo = ultimoTipo === 'Entrada' ? 'Salida' : 'Entrada';

  const handleMarcar = async () => {
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
        tipo: siguienteTipo,
        hora: new Date().toLocaleTimeString(),
        ubicacion,
      };

      setMarcaciones([...marcaciones, nuevaMarcacion]);
      setMessage(`${siguienteTipo} registrada correctamente`);
    } catch (error) {
      setMessage('No se pudo obtener la ubicación');
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
      params: { fullName, rol },
    });
  };

  const fecha = currentTime.toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const hora = currentTime.toLocaleTimeString();

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {fullName}</Text>
          {rol && <Text style={styles.roleTag}>{rol}</Text>}
        </View>

        <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)}>
          <Ionicons name="person-circle-outline" size={32} color="#208AEF" />
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

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.date}>{fecha}</Text>
        <Text style={styles.clock}>{hora}</Text>

        <TouchableOpacity
          style={[
            styles.markButton,
            siguienteTipo === 'Entrada' ? styles.markButtonIn : styles.markButtonOut,
          ]}
          onPress={handleMarcar}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={styles.markButtonText}>
            {loading ? 'Registrando...' : `Marcar ${siguienteTipo}`}
          </Text>
        </TouchableOpacity>

        {message !== '' && <Text style={styles.message}>{message}</Text>}

        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>Historial de hoy</Text>

          {marcaciones.length === 0 ? (
            <Text style={styles.emptyText}>Aún no hay marcaciones registradas</Text>
          ) : (
            [...marcaciones].reverse().map((m, index) => (
              <View key={index} style={styles.historyItem}>
                <View
                  style={[
                    styles.historyDot,
                    m.tipo === 'Entrada' ? styles.dotIn : styles.dotOut,
                  ]}
                />
                <View style={styles.historyInfo}>
                  <Text style={styles.historyType}>{m.tipo}</Text>
                  <Text style={styles.historyTime}>{m.hora}</Text>
                  <Text style={styles.historyLocation}>{m.ubicacion}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}