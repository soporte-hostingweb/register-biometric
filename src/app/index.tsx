import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { API_URL, saveAccessToken } from '../services/api';
import { completeDeviceAuthorization } from '../services/device-auth';
import { styles } from '../styles/login';

type PwaInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type PwaWindow = Window & {
  __pwaInstallPrompt?: PwaInstallPromptEvent | null;
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [focusedInput, setFocusedInput] = useState<'email' | 'password' | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

    if (isStandalone) return;

    const updateInstallAvailability = () => {
      const pwaWindow = window as PwaWindow;
      setShowInstallButton(Boolean(pwaWindow.__pwaInstallPrompt));
    };

    const handleInstalled = () => setShowInstallButton(false);
    updateInstallAvailability();
    window.addEventListener('pwa-install-ready', updateInstallAvailability);
    window.addEventListener('pwa-app-installed', handleInstalled);

    return () => {
      window.removeEventListener('pwa-install-ready', updateInstallAvailability);
      window.removeEventListener('pwa-app-installed', handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const pwaWindow = window as PwaWindow;
    const installPrompt = pwaWindow.__pwaInstallPrompt;

    if (!installPrompt) {
      window.alert(
        'El instalador todavía no está disponible. Actualiza esta página y vuelve a pulsar el botón. Si continúa igual, elimina el acceso directo anterior y borra los datos de developer.hwperu.com en Brave.',
      );
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    pwaWindow.__pwaInstallPrompt = null;

    if (choice.outcome === 'accepted') {
      setShowInstallButton(false);
    }
  };

  const handleLogin = async () => {
    const showAlert = (title: string, message: string) => {
      if (Platform.OS === 'web') {
        alert(`${title}: ${message}`);
      } else {
        Alert.alert(title, message);
      }
    };

    if (!email || !password) {
      showAlert('Error', 'Please complete all fields');
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, app: 'asistencia' }),
        signal: controller.signal,
        credentials: 'include',
      });

      clearTimeout(timeoutId);

      if (response.status === 403) {
        const errData = await response.json().catch(() => ({}));
        showAlert(
          'Access denied',
          errData.message || 'Your IP is not authorized. Connect from office Wi-Fi.',
        );
        setLoading(false);
        return;
      }

      let data = await response.json();

      if (data.success) {
        if (data.deviceRegistrationRequired || data.deviceAuthenticationRequired) {
          data = await completeDeviceAuthorization(data);
        }

        if (!data.user?.token) {
          showAlert('Error', 'Server did not return access token');
          setLoading(false);
          return;
        }

        await saveAccessToken(data.user.token);
        router.push({
          pathname: '/dashboard',
          params: {
            fullName: data.user.fullName,
            email: data.user.email,
            rol: data.user.rol,
          },
        });
      } else {
        showAlert('Error', data.message || 'Invalid credentials');
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        showAlert(
          'Request timeout',
          'Unable to connect to the server. Check your office Wi-Fi or data signal.',
        );
      } else {
        showAlert('Error', 'Could not connect to the server. Verify internet connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/images/ChatGPT Image 18 ago 2026, 12_13_50.png')}
      style={styles.wrapper}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        style={styles.contentOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.hero}>
              <View style={styles.heroImageWrap}>
                <Image source={require('../../assets/images/icon.png')} style={styles.heroImage} />
              </View>
            </View>

            <Text style={styles.title}>Welcome to HWPerú</Text>
            <Text style={styles.subtitle}>Digital Assistance Platform</Text>

            <View style={styles.divider} />

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email address</Text>
              <View
                nativeID="login-email-field"
                style={[
                  styles.fieldWrapper,
                  focusedInput === 'email' && styles.fieldWrapperFocus,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={focusedInput === 'email' ? '#7EC3FF' : '#C6D8F5'}
                  style={styles.fieldIcon}
                />
                <TextInput
                  nativeID="login-email-input"
                  style={styles.input}
                  placeholder="you@company.com"
                  placeholderTextColor="#D1DBEF"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  onFocus={() => setFocusedInput('email')}
                  onBlur={() => setFocusedInput((current) => (current === 'email' ? null : current))}
                  selectionColor="#005FF7"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View
                nativeID="login-password-field"
                style={[
                  styles.passwordWrapper,
                  focusedInput === 'password' && styles.fieldWrapperFocus,
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={focusedInput === 'password' ? '#7EC3FF' : '#C6D8F5'}
                  style={styles.fieldIcon}
                />
                <TextInput
                  nativeID="login-password-input"
                  style={styles.passwordInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#D1DBEF"
                  autoComplete="current-password"
                  value={password}
                  onChangeText={setPassword}
                  textContentType="password"
                  secureTextEntry={!showPassword}
                  onFocus={() => setFocusedInput('password')}
                  onBlur={() =>
                    setFocusedInput((current) => (current === 'password' ? null : current))
                  }
                  selectionColor="#005FF7"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={focusedInput === 'password' ? '#7EC3FF' : '#C6D8F5'}
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
              <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
            </TouchableOpacity>

            {showInstallButton && (
              <TouchableOpacity
                style={styles.installButton}
                onPress={handleInstall}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Instalar aplicación HWPerú"
              >
                <Ionicons name="download-outline" size={19} color="#D9ECFF" />
                <Text style={styles.installButtonText}>Instalar aplicación</Text>
              </TouchableOpacity>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}
