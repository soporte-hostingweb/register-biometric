import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import TabScreen from '../components/TabScreen';
import { apiFetch } from '../services/api';
import {
  canExportReports, dateParts, downloadExcel, downloadPDF, fetchHistory, formatShortDate, hasClockIn,
  HistoryLog, logsOfMonth, MESES, monthStats, statusKind, statusLabel,
} from '../services/attendance';
import { useLanguage } from '../services/language';
import { cardShadow, colors } from '../styles/theme';
import { formatHistoryTime, limaDateStr, serverNow } from '../utils/time';

type Filter = 'todos' | 'tarde' | 'falta';

/**
 * Pestaña Historial: el mes elegido día por día, con su resumen (horas,
 * asistencias, tardanzas y faltas) y la descarga en Excel o PDF (web).
 * Todo sale de /api/attendance/history/by-email/:email, el mismo endpoint que
 * usaba el dashboard anterior: el mes se elige en la app.
 */
export default function HistorialScreen() {
  const { tr, language } = useLanguage();
  const { fullName, rol, email } = useLocalSearchParams<{ fullName: string; rol: string; email: string }>();
  const session = { fullName, rol, email };

  const today = dateParts(limaDateStr(serverNow()))!;
  const [year, setYear] = useState(today.y);
  const [month, setMonth] = useState(today.m);
  const [logs, setLogs] = useState<HistoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [cargo, setCargo] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  useEffect(() => {
    if (!email) router.replace('/');
  }, [email]);

  const load = useCallback(async () => {
    if (!email) return;
    const data = await fetchHistory(email);
    if (data) {
      setLogs(data);
      setError('');
    } else {
      setError(tr('Could not load your history. Pull down to retry.', 'No se pudo cargar tu historial. Desliza hacia abajo para reintentar.'));
    }
    setLoading(false);
  }, [email, tr]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!email) return;
    apiFetch('/api/auth/profile')
      .then(async (response) => { if (response.ok) setCargo((await response.json())?.employee?.cargo || null); })
      .catch(() => undefined);
  }, [email]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const monthLogs = useMemo(
    () => logsOfMonth(logs, year, month).sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [logs, year, month],
  );
  const stats = monthStats(monthLogs);
  const visibleLogs = monthLogs.filter((log) => {
    if (filter === 'tarde') return hasClockIn(log) && statusKind(log.status) === 'tarde';
    if (filter === 'falta') return !hasClockIn(log);
    return true;
  });

  const isCurrentMonth = year === today.y && month === today.m;
  const moveMonth = (delta: number) => {
    const next = new Date(Date.UTC(year, month + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth());
    setFilter('todos');
  };

  const exportReport = async (kind: 'excel' | 'pdf') => {
    setExporting(kind);
    try {
      const info = { logs: [...monthLogs].reverse(), fullName, email, cargo, year, month };
      if (kind === 'excel') await downloadExcel(info);
      else await downloadPDF(info);
    } catch (err) {
      console.error('Error al generar el reporte:', err);
      setError(tr('The report could not be generated.', 'No se pudo generar el reporte.'));
    } finally {
      setExporting(null);
    }
  };

  const statCards = [
    { key: 'h', value: `${stats.totalHours}h`, label: tr('Hours', 'Horas'), icon: 'time-outline' as const, fg: colors.primary, bg: colors.primarySoft },
    { key: 'a', value: String(stats.asistencias), label: tr('Attendances', 'Asistencias'), icon: 'checkmark-circle-outline' as const, fg: colors.green, bg: colors.greenSoft },
    { key: 't', value: String(stats.tardanzas), label: tr('Late', 'Tardanzas'), icon: 'alert-circle-outline' as const, fg: colors.amber, bg: colors.amberSoft },
    { key: 'f', value: String(stats.faltas), label: tr('Absences', 'Faltas'), icon: 'close-circle-outline' as const, fg: colors.red, bg: colors.redSoft },
  ];

  const filters: { id: Filter; label: string }[] = [
    { id: 'todos', label: tr('All', 'Todos') },
    { id: 'tarde', label: tr('Late', 'Tardanzas') },
    { id: 'falta', label: tr('Absences', 'Faltas') },
  ];

  return (
    <TabScreen title={tr('Attendance history', 'Historial')} active="historial" refreshing={refreshing} onRefresh={onRefresh} {...session}>
      {/* Mes */}
      <View style={[styles.card, styles.monthRow]}>
        <TouchableOpacity style={styles.monthButton} onPress={() => moveMonth(-1)} accessibilityLabel={tr('Previous month', 'Mes anterior')}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.monthTitle}>{MESES[language][month]} {year}</Text>
          <Text style={styles.monthHint}>{tr('Business days', 'Días hábiles')}</Text>
        </View>
        <TouchableOpacity
          style={[styles.monthButton, isCurrentMonth && { opacity: 0.35 }]}
          onPress={() => moveMonth(1)}
          disabled={isCurrentMonth}
          accessibilityLabel={tr('Next month', 'Mes siguiente')}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Resumen */}
      <View style={styles.statsGrid}>
        {statCards.map((s) => (
          <View key={s.key} style={[styles.card, styles.statCard]}>
            <View style={[styles.statIcon, { backgroundColor: s.bg }]}>
              <Ionicons name={s.icon} size={18} color={s.fg} />
            </View>
            <Text style={[styles.statValue, { color: s.key === 'h' ? colors.text : s.fg }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {canExportReports() && monthLogs.length > 0 && (
        <View style={styles.exportRow}>
          <TouchableOpacity style={[styles.exportButton, { borderColor: colors.greenBorder, backgroundColor: colors.greenSoft }]} onPress={() => exportReport('excel')} disabled={exporting !== null}>
            {exporting === 'excel' ? <ActivityIndicator size="small" color={colors.green} /> : <Ionicons name="document-text-outline" size={17} color={colors.green} />}
            <Text style={[styles.exportText, { color: colors.green }]}>{tr('Download Excel', 'Descargar Excel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportButton, { borderColor: '#F7C9CB', backgroundColor: colors.redSoft }]} onPress={() => exportReport('pdf')} disabled={exporting !== null}>
            {exporting === 'pdf' ? <ActivityIndicator size="small" color={colors.red} /> : <Ionicons name="document-outline" size={17} color={colors.red} />}
            <Text style={[styles.exportText, { color: colors.red }]}>{tr('Download PDF', 'Descargar PDF')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filtros */}
      <View style={styles.filters}>
        {filters.map((f) => (
          <TouchableOpacity key={f.id} style={[styles.filter, filter === f.id && styles.filterActive]} onPress={() => setFilter(f.id)}>
            <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ paddingVertical: 40 }} />
      ) : visibleLogs.length === 0 ? (
        <View style={[styles.card, styles.empty]}>
          <Ionicons name="calendar-clear-outline" size={32} color={colors.faint} />
          <Text style={styles.emptyText}>{tr('No records for this month', 'No hay registros en este mes')}</Text>
        </View>
      ) : (
        visibleLogs.map((log) => {
          const kind = statusKind(log.status);
          const chip = kind === 'puntual'
            ? { fg: colors.green, bg: colors.greenSoft }
            : kind === 'tarde' ? { fg: colors.amber, bg: colors.amberSoft }
              : kind === 'falta' ? { fg: colors.red, bg: colors.redSoft } : { fg: colors.primaryText, bg: colors.primarySoft };
          const entered = hasClockIn(log);
          return (
            <View key={String(log.date)} style={[styles.card, styles.day]}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayDate}>{formatShortDate(log.date, language)}</Text>
                <View style={[styles.chip, { backgroundColor: chip.bg }]}>
                  <Text style={[styles.chipText, { color: chip.fg }]}>{statusLabel(log.status, tr)}</Text>
                </View>
              </View>
              {entered ? (
                <View style={styles.dayTimes}>
                  <View style={styles.dayTime}>
                    <View style={[styles.dot, { backgroundColor: colors.green }]}><Ionicons name="log-in-outline" size={14} color="#FFF" /></View>
                    <View>
                      <Text style={styles.dayTimeLabel}>{tr('In', 'Entrada')}</Text>
                      <Text style={styles.dayTimeValue}>{formatHistoryTime(log.clockIn)}</Text>
                    </View>
                  </View>
                  <View style={styles.dayTime}>
                    <View style={[styles.dot, { backgroundColor: colors.orange }]}><Ionicons name="log-out-outline" size={14} color="#FFF" /></View>
                    <View>
                      <Text style={styles.dayTimeLabel}>{tr('Out', 'Salida')}</Text>
                      <Text style={styles.dayTimeValue}>{formatHistoryTime(log.clockOut)}</Text>
                    </View>
                  </View>
                  <View style={styles.hours}>
                    <Text style={styles.hoursValue}>{log.totalHours || '0h'}</Text>
                    <Text style={styles.dayTimeLabel}>{tr('worked', 'trabajadas')}</Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.noMarks}>{tr('No attendance records this day', 'Sin marcaciones este día')}</Text>
              )}
              {!!log.observations && (
                <View style={styles.observation}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.muted} />
                  <Text style={styles.observationText}>{log.observations}</Text>
                </View>
              )}
            </View>
          );
        })
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, ...cardShadow },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  monthHint: { color: colors.faint, fontSize: 12, marginTop: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { flexGrow: 1, flexBasis: '46%', alignItems: 'flex-start', gap: 4 },
  statIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 26, fontWeight: '900', color: colors.text },
  statLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  exportRow: { flexDirection: 'row', gap: 10 },
  exportButton: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  exportText: { fontSize: 13.5, fontWeight: '800' },
  filters: { flexDirection: 'row', gap: 8, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 4 },
  filter: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  filterActive: { backgroundColor: colors.primary },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: '#FFFFFF' },
  error: { color: colors.red, backgroundColor: colors.redSoft, borderRadius: 12, padding: 12, fontSize: 13 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 34 },
  emptyText: { color: colors.muted, fontSize: 14 },
  day: { gap: 10 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayDate: { color: colors.text, fontSize: 15.5, fontWeight: '800' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  chipText: { fontSize: 12, fontWeight: '800' },
  dayTimes: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayTime: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayTimeLabel: { color: colors.faint, fontSize: 11.5, fontWeight: '600' },
  dayTimeValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  hours: { alignItems: 'flex-end' },
  hoursValue: { color: colors.primaryText, fontSize: 16, fontWeight: '900' },
  noMarks: { color: colors.muted, fontSize: 13 },
  observation: { flexDirection: 'row', gap: 6, backgroundColor: colors.cardSoft, borderRadius: 10, padding: 9 },
  observationText: { flex: 1, color: colors.muted, fontSize: 12.5, lineHeight: 17 },
});
