import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox, Platform, View } from 'react-native';

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
  'Android Push notifications (remote notifications)',
]);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  // En web no bloqueamos toda la interfaz mientras se descarga la fuente de
  // Ionicons. El navegador puede pintar el formulario inmediatamente y los
  // iconos aparecen en cuanto termina de cargar la fuente. Mantener el mismo
  // árbol durante SSR e hidratación también evita el error React #418.
  if (!fontsLoaded && Platform.OS !== 'web') {
    return <View style={{ flex: 1, backgroundColor: '#051C33' }} />;
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
