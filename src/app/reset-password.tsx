import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { API_URL } from '../services/api';
import { useLanguage } from '../services/language';

export default function ResetPasswordScreen() {
  const { tr } = useLanguage();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    setMessage('');
    if (!token) return setMessage('El enlace de cambio no es válido.');
    if (newPassword.length < 8 || newPassword.length > 128) return setMessage('La contraseña debe tener entre 8 y 128 caracteres.');
    if (newPassword !== confirmPassword) return setMessage('Las contraseñas no coinciden.');

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'No se pudo cambiar la contraseña.');
      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Contraseña actualizada. Ya puedes iniciar sesión.');
    } catch (error: any) {
      setMessage(error.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <View style={styles.icon}><Ionicons name="key-outline" size={31} color="#78C4FF" /></View>
        <Text style={styles.title}>{tr('Create a new password', 'Crear nueva contraseña')}</Text>
        <Text style={styles.subtitle}>{tr('This link works once and expires after 30 minutes.', 'Este enlace funciona una sola vez y vence después de 30 minutos.')}</Text>

        {!success && <>
          <Text style={styles.label}>{tr('New password', 'Nueva contraseña')}</Text>
          <View style={styles.inputBox}>
            <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry={!showPassword} placeholder={tr('At least 8 characters', 'Mínimo 8 caracteres')} placeholderTextColor="#668199" style={styles.input} editable={!loading} />
            <TouchableOpacity onPress={() => setShowPassword(value => !value)}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color="#8EABC6" /></TouchableOpacity>
          </View>
          <Text style={styles.label}>{tr('Confirm password', 'Confirmar contraseña')}</Text>
          <View style={styles.inputBox}>
            <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPassword} placeholder={tr('Repeat the password', 'Repite la contraseña')} placeholderTextColor="#668199" style={styles.input} editable={!loading} onSubmitEditing={submit} />
          </View>
        </>}

        {message ? <Text style={[styles.message, success && styles.success]}>{message}</Text> : null}
        <TouchableOpacity style={styles.button} onPress={success ? () => router.replace('/') : submit} disabled={loading}>
          {loading ? <ActivityIndicator color="#071C35" /> : <Text style={styles.buttonText}>{success ? tr('Go to sign in', 'Ir a iniciar sesión') : tr('Save password', 'Guardar contraseña')}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles: Record<string, any> = {
  page: { flex: 1, minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#020D1F' },
  card: { width: '100%', maxWidth: 460, padding: 28, borderRadius: 22, borderWidth: 1, borderColor: '#294760', backgroundColor: '#0D1D2E' },
  icon: { width: 62, height: 62, borderRadius: 18, backgroundColor: '#17304A', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#8FA7BD', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 22 },
  label: { color: '#DCEBFA', fontSize: 13, fontWeight: '800', marginTop: 13, marginBottom: 7 },
  inputBox: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#31536F', backgroundColor: '#091725' },
  input: { flex: 1, color: '#FFFFFF', fontSize: 15, outlineStyle: 'none' },
  message: { color: '#FF9B9B', fontSize: 12.5, textAlign: 'center', marginTop: 17 },
  success: { color: '#6FE1A6' },
  button: { minHeight: 52, marginTop: 20, borderRadius: 12, backgroundColor: '#77C3FF', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#071C35', fontSize: 14, fontWeight: '900' },
};
