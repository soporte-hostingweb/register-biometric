import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { styles } from '../styles/login';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
const [showPassword, setShowPassword] = useState(false);

const handleLogin = async () => {
  if (!email || !password) {
    Alert.alert('Error', 'Completa todos los campos');
    return;
  }

  setLoading(true);
  try {
    const response = await fetch('http://15.235.16.229:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

if (data.success) {
  router.push({
    pathname: '/dashboard',
    params: {
      fullName: data.user.fullName,
      email: data.user.email,
      rol: data.user.rol,
    },
  });
}else {
      Alert.alert('Error', data.message || 'Credenciales inválidas');
    }
  } catch (error) {
    Alert.alert('Error', 'No se pudo conectar al servidor');
  } finally {
    setLoading(false);
  }
};

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>A</Text>
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
    </KeyboardAvoidingView>
  );
}