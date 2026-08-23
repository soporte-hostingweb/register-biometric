import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import AttendanceCamera from '../components/AttendanceCamera';
import { apiFetch, clearAccessToken } from '../services/api';

type Empleado = {
  nombre: string;
  apellidos: string;
  dni: string | null;
  telefono: string | null;
  cargo: string | null;
  horarioTrabajo: string | null;
  entryTime: string | null;
  exitTime: string | null;
  email: string | null;
  corporateEmail?: string | null;
};

export default function PerfilScreen() {
  const { fullName, rol, email } = useLocalSearchParams<{ fullName: string; rol: string; email: string }>();
  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [faceEnrolled, setFaceEnrolled] = useState<boolean | null>(null);
  const [faceStatusError, setFaceStatusError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCameraVisible, setPasswordCameraVisible] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > 768;

  useEffect(() => {
    if (!email) {
      router.replace('/');
    }
  }, [email]);

  useEffect(() => {
    const loadSavedPhoto = async () => {
      if (!email) return;
      try {
        const saved = await AsyncStorage.getItem(`@profile_photo_${email.trim().toLowerCase()}`);
        if (saved) {
          setImageUri(saved);
        }
      } catch (err) {
        console.log('Error al cargar foto de perfil:', err);
      }
    };
    loadSavedPhoto();
  }, [email]);

  useEffect(() => {
    const fetchPerfil = async () => {
      try {
        const response = await apiFetch('/api/auth/profile');
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.details || data?.message || 'No se pudo cargar el perfil');
        }
        if (!data?.employee) {
          throw new Error('El servidor devolvió una respuesta de perfil inválida');
        }
        setEmpleado(data.employee as Empleado);
      } catch (err: any) {
        setError(err?.message || 'No se pudo conectar al servidor');
      } finally {
        setLoading(false);
      }
    };

    if (email) {
      fetchPerfil();
    } else {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    const fetchFaceStatus = async () => {
      setFaceStatusError('');
      try {
        const response = await apiFetch('/api/attendance/face-status');
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.message || 'No se pudo comprobar el registro facial.');
        }
        setFaceEnrolled(Boolean(data?.enrolled));
      } catch (faceError: any) {
        setFaceEnrolled(false);
        setFaceStatusError(faceError?.message || 'No se pudo comprobar el registro facial.');
      }
    };

    if (email) fetchFaceStatus();
  }, [email]);

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        alert('Se requieren permisos de acceso a la galería para cambiar tu foto de perfil.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0].uri) {
        const selectedUri = result.assets[0].uri;
        setImageUri(selectedUri);
        if (email) {
          await AsyncStorage.setItem(`@profile_photo_${email.trim().toLowerCase()}`, selectedUri);
        }
      }
    } catch (err) {
      console.log('Error seleccionando imagen:', err);
    }
  };

  const beginPasswordChange = () => {
    setPasswordError('');
    if (!faceEnrolled) {
      setPasswordError('Necesitas tener un rostro registrado para cambiar la contraseña.');
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      setPasswordError('La nueva contraseña debe tener entre 8 y 128 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }
    setPasswordCameraVisible(true);
  };

  const handlePasswordChangeWithFace = async (photoData: string, faceDescriptor: number[]) => {
    setPasswordCameraVisible(false);
    setPasswordSubmitting(true);
    setPasswordError('');
    try {
      const response = await apiFetch('/api/auth/change-password-with-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword,
          photoData,
          faceDescriptor,
          faceModel: 'human-faceres-v1',
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || 'No se pudo cambiar la contraseña.');
      }

      setNewPassword('');
      setConfirmPassword('');
      await clearAccessToken();
      alert('Contraseña actualizada correctamente. Inicia sesión nuevamente.');
      router.replace('/');
    } catch (passwordChangeError: any) {
      setPasswordError(passwordChangeError?.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const nombreCompleto = empleado ? `${empleado.nombre} ${empleado.apellidos}` : fullName || 'Usuario';
  const iniciales = nombreCompleto
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const cargoMostrar = empleado?.cargo || rol || '';

  const datos = empleado
    ? [
      { icon: 'card-outline', color: '#208AEF', bg: 'rgba(32, 138, 239, 0.12)', label: 'DNI', value: empleado.dni || 'No registrado' },
      { icon: 'call-outline', color: '#66BB6A', bg: 'rgba(102, 187, 106, 0.12)', label: 'Celular', value: empleado.telefono || 'Sin definir' },
      { icon: 'briefcase-outline', color: '#AB47BC', bg: 'rgba(171, 71, 188, 0.12)', label: 'Cargo', value: empleado.cargo || 'No definido' },
      { icon: 'log-in-outline', color: '#FFA726', bg: 'rgba(255, 167, 38, 0.12)', label: 'Horario de entrada', value: empleado.entryTime || 'No definido' },
      { icon: 'log-out-outline', color: '#EF5350', bg: 'rgba(239, 83, 80, 0.12)', label: 'Horario de salida', value: empleado.exitTime || 'No definido' },
    ]
    : [];

  const renderPasswordSection = (desktop = false) => (
    <View style={[styles.securityCard, desktop && styles.desktopSecurityCard]}>
      <View style={styles.securityHeader}>
        <View style={styles.securityIcon}>
          <Ionicons name="shield-checkmark-outline" size={24} color="#77C3FF" />
        </View>
        <View style={styles.securityHeaderText}>
          <Text style={styles.securityTitle}>Cambiar contraseña</Text>
          <Text style={styles.securitySubtitle}>La modificación solo se autoriza si tu rostro coincide con el registro biométrico.</Text>
        </View>
      </View>

      <View style={[styles.faceStatus, faceEnrolled ? styles.faceStatusReady : styles.faceStatusPending]}>
        {faceEnrolled === null ? (
          <ActivityIndicator size="small" color="#77C3FF" />
        ) : (
          <Ionicons
            name={faceEnrolled ? 'checkmark-circle-outline' : 'alert-circle-outline'}
            size={20}
            color={faceEnrolled ? '#6EDDA5' : '#F0B45A'}
          />
        )}
        <Text style={[styles.faceStatusText, faceEnrolled ? styles.faceStatusTextReady : styles.faceStatusTextPending]}>
          {faceEnrolled === null
            ? 'Comprobando registro facial…'
            : faceEnrolled
              ? 'Rostro registrado y listo para validar'
              : 'Debes registrar tu rostro desde el Dashboard'}
        </Text>
      </View>

      {faceStatusError ? <Text style={styles.passwordErrorText}>{faceStatusError}</Text> : null}

      <Text style={styles.passwordLabel}>Nueva contraseña</Text>
      <View style={styles.passwordInputBox}>
        <Ionicons name="lock-closed-outline" size={19} color="#7F9BB8" />
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Mínimo 8 caracteres"
          placeholderTextColor="#647A91"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          style={styles.passwordInput}
          editable={!passwordSubmitting}
        />
        <TouchableOpacity
          onPress={() => setShowPassword(current => !current)}
          accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          disabled={passwordSubmitting}
          style={styles.passwordEyeButton}
        >
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#8EABC6" />
        </TouchableOpacity>
      </View>

      <Text style={styles.passwordLabel}>Confirmar contraseña</Text>
      <View style={styles.passwordInputBox}>
        <Ionicons name="lock-closed-outline" size={19} color="#7F9BB8" />
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Repite la nueva contraseña"
          placeholderTextColor="#647A91"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          style={styles.passwordInput}
          editable={!passwordSubmitting}
          onSubmitEditing={beginPasswordChange}
        />
      </View>

      {passwordError ? <Text style={styles.passwordErrorText}>{passwordError}</Text> : null}

      <TouchableOpacity
        style={[
          styles.passwordButton,
          (!faceEnrolled || passwordSubmitting) && styles.passwordButtonDisabled,
        ]}
        onPress={beginPasswordChange}
        disabled={!faceEnrolled || passwordSubmitting}
      >
        {passwordSubmitting ? (
          <ActivityIndicator size="small" color="#071C35" />
        ) : (
          <Ionicons name="scan-outline" size={21} color="#071C35" />
        )}
        <Text style={styles.passwordButtonText}>
          {passwordSubmitting ? 'Actualizando contraseña…' : 'Validar rostro y cambiar contraseña'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, isDesktop ? { paddingTop: 70 } : styles.mobileContainer]}>
      {isDesktop && (
        <View style={styles.desktopNavbar}>
          <TouchableOpacity style={styles.desktopNavBack} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color="#5CADFF" />
            <Text style={styles.desktopNavBackText}>Volver al Dashboard</Text>
          </TouchableOpacity>
          <Text style={styles.desktopNavTitle}>Perfil de Colaborador</Text>
          <Image source={require('../../assets/images/icon.png')} style={styles.desktopNavLogo} />
        </View>
      )}

      {isDesktop ? (
        <View style={styles.desktopProfileCard}>
          {/* Banner de Portada */}
          <View style={styles.desktopCoverBanner} />

          {/* Foto de Perfil (Avatar Superpuesto) */}
          <View style={styles.desktopAvatarWrapper}>
            <TouchableOpacity style={styles.desktopAvatar} onPress={handlePickImage} activeOpacity={0.8}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.avatarImage} />
              ) : (
                <Image source={require('../../assets/images/icon.png')} style={[styles.avatarImage, { resizeMode: 'contain' }]} />
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Información Principal del Usuario */}
          <View style={styles.desktopInfoMain}>
            <Text style={styles.name}>{nombreCompleto}</Text>
            
            <View style={styles.desktopBadgesRow}>
              {cargoMostrar !== '' && (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{cargoMostrar}</Text>
                </View>
              )}
              <View style={styles.activeStatusBadge}>
                <View style={styles.activeStatusDot} />
                <Text style={styles.activeStatusText}>Cuenta Activa</Text>
              </View>
            </View>
          </View>

          {/* Divisor */}
          <View style={styles.desktopDivider} />

          {/* Grid de Datos del Colaborador */}
          <View style={styles.desktopDetailsSection}>
            <Text style={styles.desktopDetailsTitle}>Información del Colaborador</Text>
            <Text style={styles.desktopDetailsSubtitle}>Detalles de tu cuenta registrados en el sistema de HWPerú</Text>

            {loading && <ActivityIndicator style={{ marginTop: 20 }} color="#208AEF" />}
            {!loading && error !== '' && <Text style={styles.errorText}>{error}</Text>}

            {!loading && (
              <View style={styles.desktopDetailsGrid}>
                {datos.map((item) => (
                  <View key={item.label} style={styles.desktopGridCard}>
                    <View style={[styles.iconCircle, { backgroundColor: item.bg }]}>
                      <Ionicons name={item.icon as any} size={22} color={item.color} />
                    </View>
                    <View style={styles.infoTextGroup}>
                      <Text style={styles.infoLabel}>{item.label}</Text>
                      <Text style={styles.infoValue}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            {renderPasswordSection(true)}
          </View>
        </View>
      ) : (
        <ScrollView
          style={styles.mobileScroll}
          contentContainerStyle={styles.mobileScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Mi perfil</Text>
          </View>

          <View style={styles.avatarWrapper}>
            <TouchableOpacity style={styles.avatar} onPress={handlePickImage} activeOpacity={0.8}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.avatarImage} />
              ) : (
                <Image source={require('../../assets/images/icon.png')} style={[styles.avatarImage, { resizeMode: 'contain' }]} />
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.name}>{nombreCompleto}</Text>
            {cargoMostrar !== '' && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{cargoMostrar}</Text>
              </View>
            )}

            {loading && <ActivityIndicator style={{ marginTop: 32 }} color="#208AEF" />}

            {!loading && error !== '' && <Text style={styles.errorText}>{error}</Text>}

            {!loading &&
              datos.map((item) => (
                <View key={item.label} style={styles.infoCard}>
                  <View style={[styles.iconCircle, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon as any} size={20} color={item.color} />
                  </View>
                  <View style={styles.infoTextGroup}>
                    <Text style={styles.infoLabel}>{item.label}</Text>
                    <Text style={styles.infoValue}>{item.value}</Text>
                  </View>
                </View>
              ))}
            {renderPasswordSection()}
          </View>
        </ScrollView>
      )}

      <AttendanceCamera
        visible={passwordCameraVisible}
        mode="password-change"
        onCancel={() => setPasswordCameraVisible(false)}
        onConfirm={handlePasswordChangeWithFace}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
  },
  mobileContainer: {
    justifyContent: 'flex-start',
    minHeight: '100vh',
  },
  mobileScroll: {
    flex: 1,
    width: '100%',
  },
  mobileScrollContent: {
    flexGrow: 1,
    paddingBottom: 28,
  },
  header: {
    backgroundColor: '#1A2B4C',
    paddingTop: 55,
    paddingBottom: 70,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  desktopHeader: {
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingTop: 30,
    paddingBottom: 50,
    marginTop: 20,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 14,
  },
  avatarWrapper: {
    alignItems: 'center',
    marginTop: -50,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#121212',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: '#208AEF',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1E1E1E',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    alignItems: 'center',
    width: '100%',
  },
  desktopBody: {
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 16,
  },
  roleBadge: {
    backgroundColor: '#1E3A5F',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 10,
  },
  roleBadgeText: {
    color: '#5CADFF',
    fontWeight: '700',
    fontSize: 14,
  },
  errorText: {
    marginTop: 24,
    color: '#E53935',
    fontSize: 13,
    textAlign: 'center',
  },
  infoCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoTextGroup: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#8A8F9A',
    marginBottom: 3,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  securityCard: {
    width: '100%',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D4054',
    padding: 18,
    marginTop: 22,
  },
  desktopSecurityCard: {
    backgroundColor: '#20252B',
    maxWidth: 720,
    alignSelf: 'center',
    marginTop: 28,
  },
  securityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  securityIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(119, 195, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityHeaderText: {
    flex: 1,
  },
  securityTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  securitySubtitle: {
    color: '#91A7BC',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 3,
  },
  faceStatus: {
    minHeight: 44,
    borderRadius: 11,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 15,
  },
  faceStatusReady: {
    backgroundColor: 'rgba(49, 190, 120, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(110, 221, 165, 0.28)',
  },
  faceStatusPending: {
    backgroundColor: 'rgba(240, 180, 90, 0.09)',
    borderWidth: 1,
    borderColor: 'rgba(240, 180, 90, 0.25)',
  },
  faceStatusText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
  },
  faceStatusTextReady: {
    color: '#8BE8B8',
  },
  faceStatusTextPending: {
    color: '#F3C77E',
  },
  passwordLabel: {
    color: '#C5D4E3',
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 4,
  },
  passwordInputBox: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#344A60',
    backgroundColor: '#131C25',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    gap: 10,
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 12,
  },
  passwordEyeButton: {
    padding: 5,
  },
  passwordErrorText: {
    color: '#FF9C9C',
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 10,
  },
  passwordButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#77C3FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 15,
    marginTop: 5,
  },
  passwordButtonDisabled: {
    opacity: 0.45,
  },
  passwordButtonText: {
    color: '#071C35',
    fontSize: 13.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  // Estilos específicos para escritorio
  desktopNavbar: {
    height: 70,
    backgroundColor: '#1E1E1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D2D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
  },
  desktopNavBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  desktopNavBackText: {
    color: '#5CADFF',
    fontWeight: '700',
    fontSize: 14,
  },
  desktopNavTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  desktopNavLogo: {
    width: 38,
    height: 38,
    resizeMode: 'contain',
  },
  desktopProfileCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    width: '90%',
    maxWidth: 1050,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    marginTop: 40,
    marginBottom: 40,
  },
  desktopCoverBanner: {
    height: 160,
    backgroundColor: '#1A2B4C', // Deep blue cover color
  },
  desktopAvatarWrapper: {
    alignItems: 'center',
    marginTop: -60, // Overlaps the cover banner by half its height
    zIndex: 2,
  },
  desktopAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#1E1E1E', // Match card background to cut into the cover banner
    overflow: 'hidden',
  },
  desktopInfoMain: {
    alignItems: 'center',
    marginTop: 15,
  },
  desktopBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  activeStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  activeStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  activeStatusText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '700',
  },
  desktopDivider: {
    height: 1,
    backgroundColor: '#2D2D2D',
    marginHorizontal: 50,
    marginVertical: 25,
  },
  desktopDetailsSection: {
    paddingHorizontal: 50,
    paddingBottom: 45,
  },
  desktopDetailsTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  desktopDetailsSubtitle: {
    fontSize: 13,
    color: '#8A8F9A',
    marginBottom: 20,
  },
  desktopDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    width: '100%',
  },
  desktopGridCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: '#252525',
    borderRadius: 14,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },
});
