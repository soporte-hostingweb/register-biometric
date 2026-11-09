import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import TabScreen from '../components/TabScreen';
import { apiFetch, clearAuthSession } from '../services/api';
import { createDeviceAuthenticationCredential } from '../services/device-auth';
import { useLanguage } from '../services/language';
import { cardShadow, colors } from '../styles/theme';
import { formatShiftTime } from '../utils/time';

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
  // Solo llega si el backend la manda (contrato activo: DepartmentName).
  area?: string | null;
  departamento?: string | null;
};

export default function PerfilScreen() {
  const { language, setLanguage, tr } = useLanguage();
  const { fullName, rol, email, seccion } = useLocalSearchParams<{ fullName: string; rol: string; email: string; seccion?: string }>();
  // seccion=pin llega desde «Restablecer PIN» del dashboard: se baja a esa tarjeta.
  const scrollRef = useRef<ScrollView>(null);
  const [pinCardY, setPinCardY] = useState<number | null>(null);
  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [hasAttendancePin, setHasAttendancePin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinMessage, setPinMessage] = useState('');
  const [pinOk, setPinOk] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [passwordNoticeVisible, setPasswordNoticeVisible] = useState(false);
  const [dontShowPasswordNotice, setDontShowPasswordNotice] = useState(false);
  
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
        const response = await apiFetch(`/api/auth/profile/photo?t=${Date.now()}`);
        if (response.ok) {
          const blob = await response.blob();
          const persistentUri = Platform.OS === 'web'
            ? URL.createObjectURL(blob)
            : await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
          setImageUri(persistentUri);
          return;
        }
        const saved = await AsyncStorage.getItem(`@profile_photo_${email.trim().toLowerCase()}`);
        if (saved?.startsWith('data:image/')) {
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
    // El backend nunca devuelve el PIN, solo si existe: está cifrado.
    const loadPinStatus = async () => {
      try {
        const response = await apiFetch('/api/attendance/me/biometric-pin');
        if (!response.ok) return;
        const data = await response.json();
        setHasAttendancePin(Boolean(data?.hasAttendancePin));
      } catch {
        // Sin respuesta simplemente no se ofrece el cambio.
      }
    };
    loadPinStatus();
  }, []);

  const onlyDigits = (value: string) => value.replace(/[^0-9]/g, '').slice(0, 6);

  const handleChangePin = async () => {
    setPinMessage('');
    setPinOk(false);

    if (!/^[0-9]{6}$/.test(newPin)) {
      setPinMessage(tr('The new PIN must be exactly 6 digits', 'El nuevo PIN debe tener exactamente 6 dígitos'));
      return;
    }
    if (newPin !== confirmPin) {
      setPinMessage(tr('The PINs do not match', 'Los PIN no coinciden'));
      return;
    }
    if (newPin === currentPin) {
      setPinMessage(tr('The new PIN must be different from the current one', 'El nuevo PIN debe ser distinto del actual'));
      return;
    }

    setPinSubmitting(true);
    try {
      const response = await apiFetch('/api/attendance/me/biometric-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setPinMessage(data?.message || tr('The PIN could not be updated', 'No se pudo actualizar el PIN'));
        return;
      }

      setPinOk(true);
      setPinMessage(tr('PIN updated successfully', 'PIN actualizado correctamente'));
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch {
      setPinMessage(tr('Could not reach the server', 'No se pudo contactar con el servidor'));
    } finally {
      setPinSubmitting(false);
    }
  };

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
        quality: 0.55,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]?.base64) {
        setPhotoSaving(true);
        const asset = result.assets[0];
        const mimeType = asset.mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType)
          ? asset.mimeType : 'image/jpeg';
        const photoData = `data:${mimeType};base64,${asset.base64}`;
        const response = await apiFetch('/api/auth/profile/photo', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoData }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'No se pudo guardar la foto.');
        setImageUri(photoData);
        if (email) await AsyncStorage.setItem(`@profile_photo_${email.trim().toLowerCase()}`, photoData);
      }
    } catch (err: any) {
      alert(err?.message || 'No se pudo guardar la foto de perfil.');
    } finally {
      setPhotoSaving(false);
    }
  };

  const beginPasswordChange = async () => {
    setPasswordError('');
    if (newPassword.length < 8 || newPassword.length > 128) {
      setPasswordError('La nueva contraseña debe tener entre 8 y 128 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }

    const noticeKey = `@password_change_notice_hidden_${String(email || '').trim().toLowerCase()}`;
    const noticeHidden = await AsyncStorage.getItem(noticeKey);
    if (noticeHidden === 'true') {
      await changePasswordWithDeviceSecurity();
      return;
    }
    setDontShowPasswordNotice(false);
    setPasswordNoticeVisible(true);
  };

  const continuePasswordChange = async () => {
    if (dontShowPasswordNotice) {
      const noticeKey = `@password_change_notice_hidden_${String(email || '').trim().toLowerCase()}`;
      await AsyncStorage.setItem(noticeKey, 'true');
    }
    setPasswordNoticeVisible(false);
    await changePasswordWithDeviceSecurity();
  };

  const changePasswordWithDeviceSecurity = async () => {
    setPasswordSubmitting(true);
    setPasswordError('');
    try {
      const optionsResponse = await apiFetch('/api/auth/change-password/device/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const optionsData = await optionsResponse.json().catch(() => null);
      if (!optionsResponse.ok || !optionsData?.options || !optionsData?.deviceFlowToken) {
        throw new Error(optionsData?.message || 'No se pudo iniciar la validación del dispositivo.');
      }

      const credential = await createDeviceAuthenticationCredential(optionsData.options);
      const response = await apiFetch('/api/auth/change-password/device/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword,
          deviceFlowToken: optionsData.deviceFlowToken,
          credential,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || `No se pudo cambiar la contraseña (error ${response.status}).`);
      }

      setNewPassword('');
      setConfirmPassword('');
      await clearAuthSession();
      alert('Contraseña actualizada correctamente. Inicia sesión nuevamente.');
      router.replace('/');
    } catch (passwordChangeError: any) {
      const wasCancelled = passwordChangeError?.name === 'NotAllowedError';
      setPasswordError(wasCancelled
        ? 'La validación del dispositivo fue cancelada o expiró.'
        : passwordChangeError?.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const nombreCompleto = empleado ? `${empleado.nombre} ${empleado.apellidos}` : fullName || 'Usuario';
  const cargoMostrar = empleado?.cargo || rol || '';

  const datos = empleado
    ? [
      { icon: 'card-outline', color: '#208AEF', bg: 'rgba(32, 138, 239, 0.12)', label: 'DNI', value: empleado.dni || tr('Not registered', 'No registrado') },
      { icon: 'call-outline', color: '#66BB6A', bg: 'rgba(102, 187, 106, 0.12)', label: tr('Phone', 'Celular'), value: empleado.telefono || tr('Not specified', 'Sin definir') },
      { icon: 'briefcase-outline', color: '#AB47BC', bg: 'rgba(171, 71, 188, 0.12)', label: tr('Position', 'Cargo'), value: empleado.cargo || tr('Not specified', 'No definido') },
      ...((empleado.area || empleado.departamento) ? [{ icon: 'business-outline', color: '#1F5BD8', bg: 'rgba(31, 91, 216, 0.1)', label: tr('Area', 'Área'), value: String(empleado.area || empleado.departamento) }] : []),
      { icon: 'mail-outline', color: '#0EA5A4', bg: 'rgba(14, 165, 164, 0.1)', label: tr('Email', 'Correo'), value: empleado.corporateEmail || empleado.email || email || tr('Not specified', 'Sin definir') },
      { icon: 'log-in-outline', color: '#FFA726', bg: 'rgba(255, 167, 38, 0.12)', label: tr('Start time', 'Horario de entrada'), value: formatShiftTime(empleado.entryTime) || tr('Not specified', 'No definido') },
      { icon: 'log-out-outline', color: '#EF5350', bg: 'rgba(239, 83, 80, 0.12)', label: tr('End time', 'Horario de salida'), value: formatShiftTime(empleado.exitTime) || tr('Not specified', 'No definido') },
    ]
    : [];

  useEffect(() => {
    if (seccion !== 'pin' || pinCardY === null) return;
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(pinCardY - 12, 0), animated: true }), 150);
    return () => clearTimeout(timer);
  }, [seccion, pinCardY]);

  const renderPinSection = (desktop = false) => {
    // Sin PIN asignado no hay nada que cambiar: el alta la hace administración.
    if (!hasAttendancePin) return null;

    return (
      <View
        style={[styles.securityCard, desktop && styles.desktopSecurityCard, seccion === 'pin' && styles.securityCardFocus]}
        onLayout={(e) => setPinCardY(e.nativeEvent.layout.y)}
      >
        <View style={styles.securityHeader}>
          <View style={styles.securityIcon}>
            <Ionicons name="keypad-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.securityHeaderText}>
            <Text style={styles.securityTitle}>{tr('Change attendance PIN', 'Cambiar PIN de asistencia')}</Text>
            <Text style={styles.securitySubtitle}>
              {tr('The 6 digits you enter to clock in and out.', 'Los 6 dígitos que ingresas para marcar entrada y salida.')}
            </Text>
          </View>
        </View>

        <Text style={styles.passwordLabel}>{tr('Current PIN', 'PIN actual')}</Text>
        <View style={styles.passwordInputBox}>
          <Ionicons name="lock-closed-outline" size={19} color={colors.faint} />
          <TextInput
            value={currentPin}
            onChangeText={(text: string) => setCurrentPin(onlyDigits(text))}
            placeholder="••••••"
            placeholderTextColor={colors.faint}
            keyboardType="number-pad"
            secureTextEntry={!showPin}
            maxLength={6}
            // Sin esto el navegador trata el campo como contraseña: el Gestor de
            // Google ofrece guardarla y la contrasta con su base de filtraciones.
            // "one-time-code" le dice que es un código de un solo uso y lo ignora.
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            importantForAutofill="no"
            style={styles.passwordInput}
            editable={!pinSubmitting}
          />
          <TouchableOpacity
            onPress={() => setShowPin(current => !current)}
            accessibilityLabel={showPin ? tr('Hide PIN', 'Ocultar PIN') : tr('Show PIN', 'Mostrar PIN')}
            disabled={pinSubmitting}
            style={styles.passwordEyeButton}
          >
            <Ionicons name={showPin ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.faint} />
          </TouchableOpacity>
        </View>

        <Text style={styles.passwordLabel}>{tr('New PIN', 'Nuevo PIN')}</Text>
        <View style={styles.passwordInputBox}>
          <Ionicons name="keypad-outline" size={19} color={colors.faint} />
          <TextInput
            value={newPin}
            onChangeText={(text: string) => setNewPin(onlyDigits(text))}
            placeholder={tr('6 digits', '6 dígitos')}
            placeholderTextColor={colors.faint}
            keyboardType="number-pad"
            secureTextEntry={!showPin}
            maxLength={6}
            // Sin esto el navegador trata el campo como contraseña: el Gestor de
            // Google ofrece guardarla y la contrasta con su base de filtraciones.
            // "one-time-code" le dice que es un código de un solo uso y lo ignora.
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            importantForAutofill="no"
            style={styles.passwordInput}
            editable={!pinSubmitting}
          />
          <TouchableOpacity
            onPress={() => setShowPin(current => !current)}
            accessibilityLabel={showPin ? tr('Hide PIN', 'Ocultar PIN') : tr('Show PIN', 'Mostrar PIN')}
            disabled={pinSubmitting}
            style={styles.passwordEyeButton}
          >
            <Ionicons name={showPin ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.faint} />
          </TouchableOpacity>
        </View>

        <Text style={styles.passwordLabel}>{tr('Confirm new PIN', 'Confirmar nuevo PIN')}</Text>
        <View style={styles.passwordInputBox}>
          <Ionicons name="keypad-outline" size={19} color={colors.faint} />
          <TextInput
            value={confirmPin}
            onChangeText={(text: string) => setConfirmPin(onlyDigits(text))}
            placeholder={tr('Repeat the new PIN', 'Repite el nuevo PIN')}
            placeholderTextColor={colors.faint}
            keyboardType="number-pad"
            secureTextEntry={!showPin}
            maxLength={6}
            // Sin esto el navegador trata el campo como contraseña: el Gestor de
            // Google ofrece guardarla y la contrasta con su base de filtraciones.
            // "one-time-code" le dice que es un código de un solo uso y lo ignora.
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            importantForAutofill="no"
            style={styles.passwordInput}
            editable={!pinSubmitting}
          />
          <TouchableOpacity
            onPress={() => setShowPin(current => !current)}
            accessibilityLabel={showPin ? tr('Hide PIN', 'Ocultar PIN') : tr('Show PIN', 'Mostrar PIN')}
            disabled={pinSubmitting}
            style={styles.passwordEyeButton}
          >
            <Ionicons name={showPin ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.faint} />
          </TouchableOpacity>
        </View>

        {pinMessage ? (
          <Text style={[styles.passwordErrorText, pinOk && { color: colors.green }]}>{pinMessage}</Text>
        ) : null}

        <TouchableOpacity
          style={[styles.passwordButton, pinSubmitting && styles.passwordButtonDisabled]}
          onPress={handleChangePin}
          disabled={pinSubmitting}
          activeOpacity={0.85}
        >
          {pinSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="keypad-outline" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.passwordButtonText}>
            {pinSubmitting ? tr('Updating…', 'Actualizando…') : tr('Change PIN', 'Cambiar PIN')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderPasswordSection = (desktop = false) => (
    <View style={[styles.securityCard, desktop && styles.desktopSecurityCard]}>
      <View style={styles.securityHeader}>
        <View style={styles.securityIcon}>
          <Ionicons name="shield-checkmark-outline" size={24} color={colors.primary} />
        </View>
        <View style={styles.securityHeaderText}>
          <Text style={styles.securityTitle}>{tr('Change password', 'Cambiar contraseña')}</Text>
          <Text style={styles.securitySubtitle}>{tr('Confirm your identity using the security configured on this device.', 'Confirma tu identidad con la seguridad configurada en este dispositivo.')}</Text>
        </View>
      </View>

      <View style={[styles.faceStatus, styles.faceStatusReady]}>
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.green} />
        <Text style={[styles.faceStatusText, styles.faceStatusTextReady]}>
          {tr('Works with fingerprint, Face ID, Touch ID, PIN or passcode', 'Compatible con huella, Face ID, Touch ID, PIN o código')}
        </Text>
      </View>

      <Text style={styles.passwordLabel}>{tr('New password', 'Nueva contraseña')}</Text>
      <View style={styles.passwordInputBox}>
        <Ionicons name="lock-closed-outline" size={19} color={colors.faint} />
        <TextInput
          nativeID="profile-new-password-input"
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder={tr('At least 8 characters', 'Mínimo 8 caracteres')}
          placeholderTextColor={colors.faint}
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
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.faint} />
        </TouchableOpacity>
      </View>

      <Text style={styles.passwordLabel}>{tr('Confirm password', 'Confirmar contraseña')}</Text>
      <View style={styles.passwordInputBox}>
        <Ionicons name="lock-closed-outline" size={19} color={colors.faint} />
        <TextInput
          nativeID="profile-confirm-password-input"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder={tr('Repeat the new password', 'Repite la nueva contraseña')}
          placeholderTextColor={colors.faint}
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
          passwordSubmitting && styles.passwordButtonDisabled,
        ]}
        onPress={beginPasswordChange}
        disabled={passwordSubmitting}
      >
        {passwordSubmitting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons name="finger-print-outline" size={21} color="#FFFFFF" />
        )}
        <Text style={styles.passwordButtonText}>
          {passwordSubmitting ? tr('Verifying device…', 'Validando dispositivo…') : tr('Confirm identity and change password', 'Confirmar identidad y cambiar contraseña')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderLanguageSection = (desktop = false) => (
    <View style={[styles.languageCard, desktop && styles.desktopSecurityCard]}>
      <View style={styles.securityHeader}>
        <View style={styles.securityIcon}>
          <Ionicons name="language-outline" size={24} color={colors.primary} />
        </View>
        <View style={styles.securityHeaderText}>
          <Text style={styles.securityTitle}>{tr('Language', 'Idioma')}</Text>
          <Text style={styles.securitySubtitle}>{tr('Choose the language used throughout the application.', 'Elige el idioma que se usará en toda la aplicación.')}</Text>
        </View>
      </View>
      <View style={styles.languageOptions}>
        <TouchableOpacity
          style={[styles.languageOption, language === 'en' && styles.languageOptionActive]}
          onPress={() => setLanguage('en')}
        >
          <Text style={[styles.languageOptionText, language === 'en' && styles.languageOptionTextActive]}>English</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.languageOption, language === 'es' && styles.languageOptionActive]}
          onPress={() => setLanguage('es')}
        >
          <Text style={[styles.languageOptionText, language === 'es' && styles.languageOptionTextActive]}>Español</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <>
      <TabScreen title={tr('My profile', 'Mi perfil')} active="perfil" maxWidth={isDesktop ? 760 : undefined} scrollRef={scrollRef} fullName={fullName} rol={rol} email={email}>
        {/* Tarjeta del colaborador: foto (se cambia al tocarla), nombre, cargo y estado */}
        <View style={styles.profileCard}>
          <View style={styles.coverBanner} />
          <TouchableOpacity style={styles.avatar} onPress={handlePickImage} activeOpacity={0.8} disabled={photoSaving}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.avatarImage} />
            ) : (
              <Image source={require('../../assets/images/hwperu-icon-v5.png')} style={[styles.avatarImage, { resizeMode: 'contain' }]} />
            )}
            <View style={styles.cameraBadge}>
              {photoSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="camera" size={14} color="#FFFFFF" />}
            </View>
          </TouchableOpacity>
          <Text style={styles.name}>{nombreCompleto}</Text>
          <View style={styles.badgesRow}>
            {cargoMostrar !== '' && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{cargoMostrar}</Text>
              </View>
            )}
            <View style={styles.activeStatusBadge}>
              <View style={styles.activeStatusDot} />
              <Text style={styles.activeStatusText}>{tr('Active Account', 'Cuenta Activa')}</Text>
            </View>
          </View>
          <Text style={styles.photoHint}>{tr('Tap the photo to change it', 'Toca la foto para cambiarla')}</Text>
        </View>

        <Text style={styles.sectionLabel}>{tr('EMPLOYEE INFORMATION', 'INFORMACIÓN DEL COLABORADOR')}</Text>
        {loading && <ActivityIndicator style={{ marginTop: 12 }} color="#1F5BD8" />}
        {!loading && error !== '' && <Text style={styles.errorText}>{error}</Text>}
        {!loading && datos.length > 0 && (
          <View style={styles.detailsGrid}>
            {datos.map((item) => (
              <View key={item.label} style={[styles.infoCard, isDesktop && styles.infoCardHalf]}>
                <View style={[styles.iconCircle, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.icon as any} size={20} color={item.color} />
                </View>
                <View style={styles.infoTextGroup}>
                  <Text style={styles.infoLabel}>{item.label}</Text>
                  <Text style={styles.infoValue}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionLabel}>{tr('SECURITY AND PREFERENCES', 'SEGURIDAD Y PREFERENCIAS')}</Text>
        {renderPinSection()}
        {renderPasswordSection()}
        {renderLanguageSection()}
      </TabScreen>

      <Modal visible={passwordNoticeVisible} transparent animationType="fade" onRequestClose={() => setPasswordNoticeVisible(false)}>
        <Pressable style={styles.noticeOverlay} onPress={() => setPasswordNoticeVisible(false)}>
          <Pressable style={styles.noticeCard} onPress={() => {}}>
            <View style={styles.noticeIcon}>
              <Ionicons name="information-circle-outline" size={30} color={colors.primary} />
            </View>
            <Text style={styles.noticeTitle}>Antes de continuar</Text>
            <Text style={styles.noticeText}>
              Esta contraseña también cambiará tu acceso al gestor de planillas y finanzas, porque ambas plataformas usan la misma cuenta.
            </Text>

            <TouchableOpacity
              style={styles.noticeCheckRow}
              onPress={() => setDontShowPasswordNotice(current => !current)}
              activeOpacity={0.8}
            >
              <View style={[styles.noticeCheckbox, dontShowPasswordNotice && styles.noticeCheckboxChecked]}>
                {dontShowPasswordNotice && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
              </View>
              <Text style={styles.noticeCheckText}>No volver a mostrar este aviso</Text>
            </TouchableOpacity>

            <View style={styles.noticeActions}>
              <TouchableOpacity style={styles.noticeCancelButton} onPress={() => setPasswordNoticeVisible(false)}>
                <Text style={styles.noticeCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.noticeContinueButton} onPress={continuePasswordChange}>
                <Text style={styles.noticeContinueText}>Continuar</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  profileCard: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center', paddingBottom: 18, overflow: 'hidden', ...cardShadow },
  coverBanner: { alignSelf: 'stretch', height: 70, backgroundColor: colors.primarySoft },
  avatar: {
    width: 112, height: 112, borderRadius: 56, marginTop: -56, backgroundColor: colors.card, borderWidth: 4, borderColor: colors.card,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 56 },
  cameraBadge: {
    position: 'absolute', bottom: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.card,
  },
  name: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 10, paddingHorizontal: 16 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8 },
  roleBadge: { backgroundColor: colors.primarySoft, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  roleBadgeText: { color: colors.primaryText, fontWeight: '700', fontSize: 13 },
  activeStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.greenSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  activeStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  activeStatusText: { color: colors.green, fontSize: 12, fontWeight: '700' },
  photoHint: { color: colors.faint, fontSize: 12, marginTop: 8 },
  sectionLabel: { color: colors.faint, fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginBottom: -6, marginLeft: 4, marginTop: 4 },
  errorText: { color: colors.red, fontSize: 13, textAlign: 'center' },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoCard: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 16,
    padding: 13, borderWidth: 1, borderColor: colors.border,
  },
  infoCardHalf: { width: '48.8%' },
  iconCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  infoTextGroup: { flex: 1, minWidth: 0 },
  infoLabel: { fontSize: 12, color: colors.muted, marginBottom: 2, fontWeight: '600' },
  infoValue: { fontSize: 15, color: colors.text, fontWeight: '700' },
  securityCard: { width: '100%', backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, ...cardShadow },
  languageCard: { width: '100%', backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, ...cardShadow },
  desktopSecurityCard: {},
  securityCardFocus: { borderColor: colors.primary, borderWidth: 2 },
  languageOptions: { flexDirection: 'row', gap: 10 },
  languageOption: {
    flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.cardSoft,
  },
  languageOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  languageOptionText: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  languageOptionTextActive: { color: '#FFFFFF' },
  securityHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  securityIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  securityHeaderText: { flex: 1 },
  securityTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  securitySubtitle: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  faceStatus: { minHeight: 42, borderRadius: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  faceStatusReady: { backgroundColor: colors.greenSoft, borderWidth: 1, borderColor: colors.greenBorder },
  faceStatusText: { flex: 1, fontSize: 12.5, fontWeight: '700' },
  faceStatusTextReady: { color: colors.green },
  passwordLabel: { color: colors.text, fontSize: 12.5, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  passwordInputBox: {
    minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10, marginBottom: 12,
  },
  passwordInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 11 },
  passwordEyeButton: { padding: 5 },
  passwordErrorText: { color: colors.red, fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
  passwordButton: {
    minHeight: 48, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 9, paddingHorizontal: 15, marginTop: 4,
  },
  passwordButtonDisabled: { opacity: 0.45 },
  passwordButtonText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  noticeOverlay: { flex: 1, backgroundColor: 'rgba(10, 20, 45, 0.5)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  noticeCard: { width: '100%', maxWidth: 430, borderRadius: 20, backgroundColor: colors.card, padding: 22 },
  noticeIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  noticeTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 9 },
  noticeText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  noticeCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, paddingVertical: 7 },
  noticeCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  noticeCheckboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  noticeCheckText: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: '600' },
  noticeActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  noticeCancelButton: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  noticeCancelText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  noticeContinueButton: { flex: 1.25, minHeight: 48, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  noticeContinueText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
