import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatShortDate, MarkItem } from '../services/attendance';
import { useLanguage } from '../services/language';
import { colors } from '../styles/theme';

const openInMaps = (loc: string) => {
  if (Platform.OS !== 'web') return;
  const isCoords = /^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/.test(loc.trim());
  const query = isCoords ? loc.trim() : encodeURIComponent(loc.trim());
  window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
};

/** Lista de marcaciones con línea de tiempo: verde la entrada, naranja la salida. */
export default function MarkTimeline({ marks, showLocation = false }: { marks: MarkItem[]; showLocation?: boolean }) {
  const { tr, language } = useLanguage();

  return (
    <View>
      {marks.map((m, index) => {
        const isIn = m.tipo === 'Entrada';
        const tint = isIn ? colors.green : colors.orange;
        const chip = m.status === 'tarde'
          ? { text: tr('Late', 'Tarde'), fg: colors.amber, bg: colors.amberSoft }
          : m.status === 'puntual'
            ? { text: tr('On time', 'Puntual'), fg: colors.green, bg: colors.greenSoft }
            : { text: tr('Registered', 'Registrado'), fg: tint, bg: isIn ? colors.greenSoft : colors.orangeSoft };
        const isLast = index === marks.length - 1;
        return (
          <View key={m.key} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.railDot, { backgroundColor: tint }]} />
              {!isLast && <View style={styles.railLine} />}
            </View>
            <View style={[styles.icon, { backgroundColor: tint }]}>
              <Ionicons name={isIn ? 'log-in-outline' : 'log-out-outline'} size={22} color="#FFFFFF" />
            </View>
            <View style={styles.info}>
              <Text style={[styles.type, { color: tint }]}>{isIn ? tr('Clock in', 'Entrada') : tr('Clock out', 'Salida')}</Text>
              <Text style={styles.when}>{formatShortDate(m.fecha, language)} · {m.hora}</Text>
              {showLocation && !!m.ubicacion && (
                <TouchableOpacity style={styles.location} onPress={() => openInMaps(m.ubicacion!)} activeOpacity={0.7}>
                  <Ionicons name="location-outline" size={13} color={colors.primary} />
                  <Text style={styles.locationText} numberOfLines={1}>{m.ubicacion}</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={[styles.chip, { backgroundColor: chip.bg }]}>
              <Text style={[styles.chipText, { color: chip.fg }]}>{chip.text}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rail: { width: 8, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  railDot: { width: 7, height: 7, borderRadius: 4 },
  railLine: { position: 'absolute', top: '50%', bottom: -16, width: 2, backgroundColor: colors.border },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0 },
  type: { fontSize: 16, fontWeight: '800' },
  when: { fontSize: 13.5, color: colors.muted, marginTop: 1 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  locationText: { flex: 1, fontSize: 12, color: colors.primary, textDecorationLine: 'underline' },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  chipText: { fontSize: 12, fontWeight: '700' },
});
