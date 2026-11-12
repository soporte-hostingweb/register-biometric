import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch } from '../services/api';
import { useLanguage } from '../services/language';

/*
 * "Mis vacaciones" (issue #42, Fase 2): la misma ficha por año que ve
 * administracion en el gestor, en solo lectura y solo del propio trabajador.
 */

const COLOR_DEL_CUADRO: Record<string, string> = {
  GOZADO: '#22C55E', PERMISO: '#A855F7', PROGRAMADO: '#3B82F6', PENDIENTE: '#FBBF24', VENCIDO: '#EF4444',
  ACUMULADO: '#6EE7B7', POR_GANAR: 'transparent', SIN_DERECHO: '#64748B'
};

const fechaCorta = (dia?: string | null) => dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}` : '';

export default function MisVacacionesScreen() {
  const { tr } = useLanguage();
  const [ficha, setFicha] = useState<any>(null), [error, setError] = useState(''), [cargando, setCargando] = useState(true);

  useEffect(() => {
    apiFetch('/api/mis-vacaciones')
      .then(async res => { const data = await res.json(); if (res.ok) setFicha(data); else setError(data.error || 'No se pudo cargar tu ficha.'); })
      .catch(() => setError('No se pudo cargar tu ficha.'))
      .finally(() => setCargando(false));
  }, []);

  const verFut = async (futId: number) => {
    if (Platform.OS !== 'web') { setError(tr('Download the FUT from the web version.', 'Descarga el FUT desde la versión web.')); return; }
    const res = await apiFetch(`/api/mis-vacaciones/futs/${futId}/pdf`);
    if (!res.ok) { setError(tr('Could not open the FUT.', 'No se pudo abrir el FUT.')); return; }
    const url = URL.createObjectURL(await res.blob());
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const c = ficha?.cabecera;
  return <SafeAreaView style={s.page}>
    <View style={s.header}>
      <TouchableOpacity onPress={() => router.back()} style={s.back}><Ionicons name="arrow-back" size={24} color="#7BC3FF" /></TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.eyebrow}>{tr('ATTENDANCE', 'ASISTENCIA')}</Text>
        <Text style={s.title}>{tr('My vacations', 'Mis vacaciones')}</Text>
        <Text style={s.subtitle}>{ficha?.empleado?.nombre || ''}</Text>
      </View>
    </View>
    <ScrollView contentContainerStyle={s.content}>
      {cargando && <Text style={s.empty}>{tr('Loading...', 'Cargando...')}</Text>}
      {!!error && <Text style={s.error}>{error}</Text>}

      {c && <View style={s.card}>
        <View style={s.fila}><Text style={s.etiqueta}>{tr('Payroll start', 'Alta en planilla')}</Text><Text style={s.valor}>{fechaCorta(c.altaEnPlanilla)}</Text></View>
        <View style={s.fila}><Text style={s.etiqueta}>{tr('Seniority', 'Antigüedad')}</Text><Text style={s.valor}>{c.antiguedad?.texto}</Text></View>
        <View style={s.fila}><Text style={s.etiqueta}>{tr('Days in your favor', 'Días a tu favor')}</Text><Text style={[s.valor, s.grande]}>{c.diasAFavor}</Text></View>
        {!!c.proximoPlazo && <Text style={s.nota}>{tr('Take them before', 'Gózalos antes del')} {fechaCorta(c.proximoPlazo)}</Text>}
      </View>}

      {(ficha?.anios || []).map((a: any) => <View key={a.numero} style={s.card}>
        <View style={s.fila}>
          <Text style={s.anio}>{tr('Year', 'Año')} {a.numero}</Text>
          <Text style={s.estado}>{a.etiqueta}</Text>
        </View>
        <Text style={s.nota}>{fechaCorta(a.inicio)} – {fechaCorta(a.fin)}</Text>

        <View style={s.cuadros}>
          {a.cuadros.map((estado: string, i: number) => <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[s.cuadro, { backgroundColor: COLOR_DEL_CUADRO[estado] || 'transparent' }]} />
            {a.corte && i === a.corte - 1 && <View style={s.corte} />}
          </View>)}
        </View>

        {a.completo
          ? <Text style={s.nota}><Text style={s.valor}>{a.diasAFavor}</Text> {tr('day(s) in your favor', 'día(s) a tu favor')}{a.diasAFavor > 0 ? ` · ${tr('until', 'hasta el')} ${fechaCorta(a.limite)}` : ''}</Text>
          : <Text style={s.nota}>{tr('Accrued so far', 'Acumulado a la fecha')}: {Number(a.enCurso?.acumulado ?? 0).toFixed(2)} ({a.enCurso?.tiempo?.texto}) · {tr('7 days can be advanced from', 'los 7 días se pueden adelantar desde el')} {fechaCorta(a.enCurso?.adelantoDesde)} · {tr('the other 8 from', 'los 8 restantes desde el')} {fechaCorta(a.enCurso?.restoDesde)}</Text>}
        {!!a.record && <Text style={s.nota}>{a.record.texto}</Text>}

        {a.descansos.map((d: any) => <View key={d.id} style={s.descanso}>
          <Text style={s.descansoTexto}>{fechaCorta(d.desde)} – {fechaCorta(d.hasta)} · {d.dias} {tr('day(s)', 'día(s)')}{d.parte ? ` · ${d.parte}` : ''}</Text>
          {d.documento?.futId
            ? <TouchableOpacity onPress={() => verFut(d.documento.futId)}><Text style={s.enlace}>{d.documento.etiqueta}</Text></TouchableOpacity>
            : <Text style={s.nota}>{d.documento?.etiqueta}</Text>}
        </View>)}
        {(a.aclaraciones || []).map((t: string) => <Text key={t} style={s.nota}>{t}</Text>)}
      </View>)}

      <TouchableOpacity onPress={() => router.push('/permisos' as any)} style={s.boton}>
        <Text style={s.botonTexto}>{tr('Request vacation', 'Solicitar vacaciones')}</Text>
      </TouchableOpacity>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#061A2D' },
  header: { flexDirection: 'row', gap: 14, padding: 20, borderBottomWidth: 1, borderBottomColor: '#173A55' },
  back: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#102D47', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#68B8F8', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#FFF', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#9CB0C3', fontSize: 13 },
  content: { padding: 18, maxWidth: 760, width: '100%', alignSelf: 'center', paddingBottom: 50, gap: 12 },
  card: { backgroundColor: '#0C263D', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#244966' },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  etiqueta: { color: '#AAC0D3', fontSize: 13 },
  valor: { color: '#FFF', fontWeight: '800' },
  grande: { fontSize: 22 },
  anio: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  estado: { color: '#7BC3FF', fontWeight: '700', fontSize: 12 },
  nota: { color: '#8FA8BE', fontSize: 12, marginTop: 6, lineHeight: 17 },
  cuadros: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 },
  cuadro: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: '#315572' },
  corte: { width: 2, height: 22, backgroundColor: '#8FA8BE', marginLeft: 5, marginRight: 1 },
  descanso: { borderTopWidth: 1, borderTopColor: '#173A55', marginTop: 8, paddingTop: 8 },
  descansoTexto: { color: '#DCEAF5', fontSize: 13 },
  enlace: { color: '#7BC3FF', fontWeight: '700', marginTop: 4 },
  empty: { color: '#8299AD', textAlign: 'center', padding: 24 },
  error: { color: '#FB7185', textAlign: 'center', padding: 12 },
  boton: { backgroundColor: '#2C99F2', padding: 15, borderRadius: 12, alignItems: 'center' },
  botonTexto: { fontWeight: '800', color: '#FFF' }
});
