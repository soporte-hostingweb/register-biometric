import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { styles } from '../styles/login';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [focusedInput, setFocusedInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const validateEmail = () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      return 'Please enter your email address.';
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return 'Please enter a valid email address.';
    }

    return '';
  };

  const handleSendCode = () => {
    const validation = validateEmail();
    if (validation) {
      showAlert('Error', validation);
      return;
    }

    setIsLoading(true);

    // TODO: Connect password recovery API
    // - handle validEmail / emailNotFound / requestError states
    // - navigate to OTP verification flow
    setTimeout(() => {
      setIsLoading(false);
    }, 500);
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
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

            <Text style={styles.title}>Forgot your password?</Text>
            <Text style={styles.subtitle}>
              Enter your email address and we'll send you a verification code.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email address</Text>
              <View
                style={[
                  styles.fieldWrapper,
                  focusedInput && styles.fieldWrapperFocus,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={focusedInput ? '#7EC3FF' : '#C6D8F5'}
                  style={styles.fieldIcon}
                />
                <TextInput
                  nativeID="forgot-password-email-input"
                  style={styles.input}
                  placeholder="you@company.com"
                  placeholderTextColor="#D1DBEF"
                  autoComplete="email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedInput(true)}
                  onBlur={() => setFocusedInput(false)}
                  selectionColor="#005FF7"
                />
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.button, isLoading && styles.buttonDisabled, pressed && styles.buttonPressed]}
              onPress={handleSendCode}
              disabled={isLoading}
            >
              <Text style={styles.buttonText}>{isLoading ? 'Sending...' : 'Send verification code'}</Text>
            </Pressable>

            <View style={[styles.footer, { marginTop: 18 }]}>
              <Pressable
                onPress={handleGoBack}
                accessibilityRole="link"
                style={({ pressed }) => [styles.backLink, pressed && styles.backLinkPressed]}
              >
                <Text style={styles.footerAction}>{'\u2190'} Back to Sign In</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}
