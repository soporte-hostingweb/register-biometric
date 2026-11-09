import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../services/language';
import { AppTab, goToTab, SessionParams } from '../services/session-params';
import { colors } from '../styles/theme';

type Props = SessionParams & { active: AppTab };

const TABS: { id: AppTab; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap; en: string; es: string }[] = [
  { id: 'inicio', icon: 'home-outline', iconActive: 'home', en: 'Home', es: 'Inicio' },
  { id: 'historial', icon: 'calendar-outline', iconActive: 'calendar', en: 'History', es: 'Historial' },
  { id: 'perfil', icon: 'person-outline', iconActive: 'person', en: 'Profile', es: 'Perfil' },
  { id: 'configuracion', icon: 'settings-outline', iconActive: 'settings', en: 'Settings', es: 'Configuración' },
];

/**
 * La barra inferior de la app. Las cuatro pestañas las ve cualquier rol: lo que
 * cambia según el rol es el contenido de Configuración (ver configuracion.tsx).
 */
export default function BottomTabs({ active, fullName, rol, email }: Props) {
  const { tr } = useLanguage();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.inner}>
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tab}
              onPress={() => { if (!isActive) goToTab(tab.id, { fullName, rol, email }); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              activeOpacity={0.7}
            >
              <Ionicons name={isActive ? tab.iconActive : tab.icon} size={22} color={isActive ? colors.primary : colors.faint} />
              <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>{tr(tab.en, tab.es)}</Text>
              <View style={[styles.indicator, isActive && styles.indicatorActive]} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 8,
  },
  inner: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  label: { fontSize: 11.5, fontWeight: '600', color: colors.faint },
  labelActive: { color: colors.primary, fontWeight: '800' },
  indicator: { marginTop: 4, height: 3, width: 46, borderRadius: 2, backgroundColor: 'transparent' },
  indicatorActive: { backgroundColor: colors.primary },
});
