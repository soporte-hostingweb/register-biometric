import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useLanguage } from '../services/language';

type Destination = '/dashboard' | '/perfil' | '/permisos' | '/configuracion';

export default function DesktopAppNavigation() {
  const pathname = usePathname();
  const params = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const { tr } = useLanguage();

  const fullName = String(params.fullName || '');
  const email = String(params.email || '');
  const rol = String(params.rol || params.role || '');
  const visibleRoutes = ['/dashboard', '/perfil', '/permisos', '/configuracion'];

  if (width < 900 || !visibleRoutes.includes(pathname)) return null;

  const open = (destination: Destination) => {
    router.push({ pathname: destination as any, params: { fullName, email, rol } });
  };

  const item = (destination: Destination, icon: keyof typeof Ionicons.glyphMap, english: string, spanish: string) => {
    const active = pathname === destination;
    return (
      <TouchableOpacity
        key={destination}
        onPress={() => open(destination)}
        style={[styles.item, active && styles.itemActive]}
      >
        <Ionicons name={icon} size={18} color={active ? '#06192B' : '#B9CDE0'} />
        <Text style={[styles.itemText, active && styles.itemTextActive]}>{tr(english, spanish)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.bar}>
      <View style={styles.inner}>
        <TouchableOpacity style={styles.brand} onPress={() => open('/dashboard')}>
          <Image source={require('../../assets/images/hwperu-official-icon.png')} style={styles.logo} />
          <View>
            <Text style={styles.brandName}>HWPERÚ</Text>
            <Text style={styles.brandCaption}>{tr('Attendance', 'Asistencia')}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.links}>
          {item('/dashboard', 'grid-outline', 'Dashboard', 'Panel principal')}
          {item('/permisos', 'calendar-outline', 'Permissions', 'Permisos')}
          {rol === 'SUPER_ADMIN' && item('/configuracion', 'settings-outline', 'Settings', 'Configuración')}
        </View>

        <TouchableOpacity style={[styles.profile, pathname === '/perfil' && styles.profileActive]} onPress={() => open('/perfil')}>
          <View style={styles.profileIcon}><Ionicons name="person-outline" size={19} color="#72C1FF" /></View>
          <View style={styles.profileText}>
            <Text numberOfLines={1} style={styles.profileName}>{fullName || tr('My profile', 'Mi perfil')}</Text>
            <Text style={styles.profileLink}>{tr('View profile', 'Ver perfil')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color="#7895AD" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { width: '100%', backgroundColor: '#081B2E', borderBottomWidth: 1, borderBottomColor: '#1D3D58', zIndex: 50 },
  inner: { width: '100%', maxWidth: 1380, height: 76, paddingHorizontal: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 28 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 11, minWidth: 190 },
  logo: { width: 42, height: 42, borderRadius: 10, resizeMode: 'contain', backgroundColor: '#FFFFFF' },
  brandName: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.8 },
  brandCaption: { color: '#72C1FF', fontSize: 11, fontWeight: '700', marginTop: 1 },
  links: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  item: { minHeight: 42, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemActive: { backgroundColor: '#72C1FF' },
  itemText: { color: '#B9CDE0', fontSize: 14, fontWeight: '800' },
  itemTextActive: { color: '#06192B' },
  profile: { width: 235, padding: 8, borderWidth: 1, borderColor: '#254964', borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#0D263B' },
  profileActive: { borderColor: '#72C1FF', backgroundColor: '#12314B' },
  profileIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#163A58', alignItems: 'center', justifyContent: 'center' },
  profileText: { flex: 1, minWidth: 0 },
  profileName: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  profileLink: { color: '#72C1FF', fontSize: 11, marginTop: 2 },
});
