import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch } from '../services/api';
import { useLanguage } from '../services/language';

type Employee = { id: number; fullName: string; email?: string; position?: string };
type AttendanceRow = { date: string; clockIn: string; clockOut: string; totalHours: string; status?: string; observations?: string };

const dateLabel = (value: string) => {
  const raw = String(value || '').slice(0, 10);
  const [year, month, day] = raw.split('-').map(Number);
  if (!year || !month || !day) return raw;
  return new Date(year, month - 1, day, 12).toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

export default function GeneralAttendanceScreen() {
  const { tr } = useLanguage();
  const { rol } = useLocalSearchParams<{ rol?: string }>();
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(String(rol || '').toUpperCase());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    apiFetch('/api/admin/attendance-general/employees')
      .then(async response => {
        const data = await response.json().catch(() => []);
        if (!response.ok) throw new Error(data.message || 'No se pudo cargar la lista.');
        setEmployees(Array.isArray(data) ? data : []);
      })
      .catch(error => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  const loadEmployee = async (id: string) => {
    setSelectedId(id); setEmployee(null); setHistory([]); setMessage('');
    if (!id) return;
    setLoading(true);
    try {
      const response = await apiFetch(`/api/admin/attendance-general/${encodeURIComponent(id)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'No se pudo cargar la asistencia.');
      setEmployee(data.employee); setHistory(data.history || []);
    } catch (error: any) { setMessage(error.message); }
    finally { setLoading(false); }
  };

  const summary = useMemo(() => ({
    attendances: history.filter(item => Boolean(item.clockIn) && !String(item.clockIn).includes('--')).length,
    late: history.filter(item => String(item.status || '').toUpperCase().includes('TARDE')).length,
    absences: history.filter(item => ['FALTA', 'INASISTENCIA'].includes(String(item.status || '').toUpperCase())).length,
  }), [history]);

  if (!isAdmin) return <SafeAreaView style={s.page}><View style={s.denied}><Ionicons name="lock-closed" size={38} color="#FB7185"/><Text style={s.title}>{tr('Restricted access', 'Acceso restringido')}</Text><Text style={s.muted}>{tr('Only administrators can view general attendance.', 'Solo los administradores pueden ver la asistencia general.')}</Text><TouchableOpacity style={s.primary} onPress={() => router.replace('/dashboard')}><Text style={s.primaryText}>{tr('Back to dashboard', 'Volver al panel')}</Text></TouchableOpacity></View></SafeAreaView>;

  return <SafeAreaView style={s.page} edges={['top']}>
    <View style={s.header}>
      <TouchableOpacity style={s.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#7BC3FF"/></TouchableOpacity>
      <View style={{ flex: 1 }}><Text style={s.eyebrow}>{tr('ADMINISTRATION', 'ADMINISTRACIÓN')}</Text><Text style={s.title}>{tr('General attendance', 'Asistencia general')}</Text><Text style={s.muted}>{tr('Select an employee to view their records.', 'Selecciona un empleado para ver únicamente sus registros.')}</Text></View>
    </View>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.selectorCard}>
        <Text style={s.label}>{tr('Employee', 'Empleado')}</Text>
        {Platform.OS === 'web' ? <select value={selectedId} onChange={event => loadEmployee(event.currentTarget.value)} style={webSelectStyle}>
          <option value="">{tr('Select an employee', 'Selecciona un empleado')}</option>
          {employees.map(item => <option key={item.id} value={String(item.id)}>{item.fullName}{item.position ? ` — ${item.position}` : ''}</option>)}
        </select> : <View style={s.employeeList}>{employees.map(item => <TouchableOpacity key={item.id} onPress={() => loadEmployee(String(item.id))} style={[s.employeeButton, selectedId === String(item.id) && s.employeeButtonActive]}><Text style={s.employeeName}>{item.fullName}</Text><Text style={s.employeeMeta}>{item.position || item.email || ''}</Text></TouchableOpacity>)}</View>}
      </View>
      {!!message && <Text style={s.error}>{message}</Text>}
      {loading && <Text style={s.loading}>{tr('Loading...', 'Cargando...')}</Text>}
      {!loading && !selectedId && <View style={s.empty}><Ionicons name="person-search-outline" size={46} color="#65B7F5"/><Text style={s.emptyTitle}>{tr('Choose an employee', 'Elige un empleado')}</Text><Text style={s.muted}>{tr('Records are not mixed: only the selected employee will be displayed.', 'Los registros no se mezclarán: solo se mostrará el empleado seleccionado.')}</Text></View>}
      {employee && <>
        <View style={s.employeeHeader}><View style={s.personIcon}><Ionicons name="person" size={24} color="#70C1FF"/></View><View style={{ flex: 1 }}><Text style={s.employeeTitle}>{employee.fullName}</Text><Text style={s.employeeMeta}>{employee.position || tr('Employee', 'Empleado')} · {employee.email || ''}</Text></View></View>
        <View style={s.stats}><Stat label={tr('Attendances', 'Asistencias')} value={summary.attendances} color="#4ADE80"/><Stat label={tr('Late arrivals', 'Tardanzas')} value={summary.late} color="#FBBF24"/><Stat label={tr('Absences', 'Faltas')} value={summary.absences} color="#FB7185"/></View>
        <Text style={s.sectionTitle}>{tr('Attendance history', 'Historial de asistencia')}</Text>
        {!history.length ? <View style={s.empty}><Text style={s.muted}>{tr('This employee has no records.', 'Este empleado no tiene registros.')}</Text></View> : history.map((item, index) => <View key={`${item.date}-${index}`} style={s.record}>
          <View style={{ flex: 1 }}><Text style={s.recordDate}>{dateLabel(item.date)}</Text><Text style={s.recordTimes}>{tr('Entry', 'Entrada')}: {item.clockIn}  ·  {tr('Exit', 'Salida')}: {item.clockOut}</Text>{!!item.observations && <Text style={s.observation}>{item.observations}</Text>}</View>
          <View style={s.recordRight}><Text style={s.hours}>{item.totalHours}</Text><Text style={s.status}>{item.status || '-'}</Text></View>
        </View>)}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) { return <View style={s.stat}><Text style={[s.statValue, { color }]}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>; }
const webSelectStyle: any = { width: '100%', boxSizing: 'border-box', backgroundColor: '#071B2D', color: '#FFFFFF', border: '1px solid #315572', borderRadius: 12, padding: 14, fontSize: 16, colorScheme: 'dark' };
const s = StyleSheet.create({page:{flex:1,backgroundColor:'#061A2D'},header:{flexDirection:'row',gap:14,padding:20,borderBottomWidth:1,borderBottomColor:'#173A55'},back:{width:44,height:44,borderRadius:12,backgroundColor:'#102D47',alignItems:'center',justifyContent:'center'},eyebrow:{color:'#68B8F8',fontSize:12,fontWeight:'800',letterSpacing:1.5},title:{color:'#FFF',fontSize:26,fontWeight:'800'},muted:{color:'#9CB0C3',lineHeight:20},content:{padding:18,maxWidth:1000,width:'100%',alignSelf:'center',paddingBottom:60},selectorCard:{backgroundColor:'#0C263D',borderRadius:16,padding:18,borderWidth:1,borderColor:'#244966'},label:{color:'#FFF',fontWeight:'800',marginBottom:9},employeeList:{gap:8},employeeButton:{padding:13,borderRadius:11,borderWidth:1,borderColor:'#315572'},employeeButtonActive:{backgroundColor:'#145A8F',borderColor:'#70C1FF'},employeeName:{color:'#FFF',fontWeight:'800'},employeeMeta:{color:'#8FA9BD',fontSize:12,marginTop:3},loading:{color:'#7BC3FF',textAlign:'center',padding:30},error:{color:'#FB7185',textAlign:'center',padding:15},empty:{backgroundColor:'#0C263D',borderRadius:16,padding:35,marginTop:18,alignItems:'center',gap:8,borderWidth:1,borderColor:'#244966'},emptyTitle:{color:'#FFF',fontSize:19,fontWeight:'800'},denied:{flex:1,alignItems:'center',justifyContent:'center',padding:24,gap:12},primary:{backgroundColor:'#2C99F2',paddingHorizontal:20,paddingVertical:13,borderRadius:12},primaryText:{color:'#FFF',fontWeight:'800'},employeeHeader:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#0C263D',borderRadius:16,padding:18,marginTop:18,borderWidth:1,borderColor:'#244966'},personIcon:{width:48,height:48,borderRadius:14,backgroundColor:'#153A57',alignItems:'center',justifyContent:'center'},employeeTitle:{color:'#FFF',fontSize:20,fontWeight:'800'},stats:{flexDirection:'row',gap:10,marginTop:12},stat:{flex:1,backgroundColor:'#0C263D',borderRadius:14,padding:16,alignItems:'center',borderWidth:1,borderColor:'#244966'},statValue:{fontSize:24,fontWeight:'900'},statLabel:{color:'#9CB0C3',fontSize:12,textAlign:'center'},sectionTitle:{color:'#FFF',fontSize:20,fontWeight:'800',marginTop:24,marginBottom:10},record:{flexDirection:'row',gap:12,backgroundColor:'#0C263D',borderRadius:14,padding:16,marginBottom:9,borderWidth:1,borderColor:'#244966'},recordDate:{color:'#FFF',fontWeight:'800'},recordTimes:{color:'#A8BED0',marginTop:6},observation:{color:'#70C1FF',fontSize:12,marginTop:5},recordRight:{alignItems:'flex-end'},hours:{color:'#FFF',fontWeight:'800'},status:{color:'#7BC3FF',fontSize:11,fontWeight:'800',marginTop:6}});
