import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#F4F6F9' }} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}