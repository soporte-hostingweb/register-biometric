import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { styles } from '../styles/login';
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    const showAlert = (title: string, message: string) => {
      if (Platform.OS === 'web') {
        alert(`${title}: ${message}`);
      } else {
        Alert.alert(title, message);
      }
    };

    if (!email || !password) {
      showAlert('Error', 'Completa todos los campos');
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 segundos de límite

    try {
      const response = await fetch('http://15.235.16.229:3000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, app: 'asistencia' }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 403) {
        const errData = await response.json().catch(() => ({}));
        showAlert(
          'Acceso Denegado',
          errData.message || 'Tu dirección IP no está autorizada. Asegúrate de estar conectado al Wi-Fi de la oficina.'
        );
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (data.success) {
        const userEmail = data.user.email ? data.user.email.toLowerCase().trim() : '';

        router.push({
          pathname: '/dashboard',
          params: {
            fullName: data.user.fullName,
            email: data.user.email,
            rol: data.user.rol,
          },
        });
      } else {
        showAlert('Error', data.message || 'Credenciales inválidas');
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        showAlert(
          'Tiempo de Espera Agotado',
          'No se pudo conectar al servidor. Asegúrate de estar en el rango de cobertura y conectado al Wi-Fi de la oficina.'
        );
      } else {
        showAlert('Error', 'No se pudo conectar al servidor. Verifica tu conexión a internet.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
            <Image 
              source={require('../../assets/images/icon.png')} 
              style={{ width: 96, height: 96, resizeMode: 'cover' }} 
            />
          </View>

          <Text style={styles.title}>HWPerú</Text>
          <Text style={styles.subtitle}>Digital Assistance</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="tucorreo@empresa.com"
              placeholderTextColor="#A0A5B1"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder="••••••••"
                placeholderTextColor="#A0A5B1"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#8A8F9A"
                />
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>{loading ? 'Ingresando...' : 'Login in →'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}