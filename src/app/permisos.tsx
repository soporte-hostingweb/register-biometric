import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch } from '../services/api';

const types = [
  ['MEDICAL', 'Cita o atención médica'], ['PERSONAL', 'Asunto personal'],
  ['EMERGENCY', 'Emergencia'], ['WORK_COMMISSION', 'Comisión de trabajo'], ['OTHER', 'Otro motivo'],
];

const webInputStyle: any = {
  width: '100%', boxSizing: 'border-box', backgroundColor: '#071B2D',
  border: '1px solid #315572', borderRadius: 11, padding: 13,
  color: '#FFFFFF', colorScheme: 'dark', fontSize: 16, fontFamily: 'inherit',
};

const todayLocal = () => {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

export default function PermissionsScreen() {
  const params = useLocalSearchParams();
  const [items, setItems] = useState<any[]>([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState('MEDICAL');
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await apiFetch('/api/attendance/permissions/me');
    if (res.ok) setItems(await res.json());
  };
  useEffect(() => { load(); }, []);

  const pickFile = () => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/pdf,image/jpeg,image/png';
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return;
      if (file.size > 450 * 1024) { setMessage('El sustento no puede superar 450 KB.'); return; }
      const reader = new FileReader();
      reader.onload = () => setAttachment({ name: file.name, data: reader.result });
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const submit = async () => {
    const selectedTypeLabel = types.find(([value]) => value === type)?.[1] || 'Permiso de salida';
    const requestReason = type === 'OTHER' ? reason.trim() : selectedTypeLabel;
    if (!date || !time) { setMessage('Selecciona la fecha y la hora autorizada de salida.'); return; }
    if (type === 'OTHER' && requestReason.length < 5) { setMessage('Escribe el motivo del permiso.'); return; }
    setSaving(true); setMessage('');
    try {
      const res = await apiFetch('/api/attendance/permissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissionDate: date, authorizedExitTime: time, permissionType: type, reason: requestReason, attachment }) });
      const data = await res.json(); setMessage(data.message || (res.ok ? 'Solicitud enviada.' : 'No se pudo enviar.'));
      if (res.ok) { setDate(''); setTime(''); setReason(''); setAttachment(null); await load(); }
    } finally { setSaving(false); }
  };

  const cancel = async (id: number) => { const res = await apiFetch(`/api/attendance/permissions/${id}/cancel`, { method: 'POST' }); if (res.ok) await load(); };
  const statusLabel: any = { PENDING: 'Pendiente', APPROVED: 'Aprobado', REJECTED: 'Rechazado', CANCELLED: 'Cancelado' };

  return <SafeAreaView style={s.page}>
    <View style={s.header}><TouchableOpacity onPress={() => router.back()} style={s.back}><Ionicons name="arrow-back" size={24} color="#7BC3FF" /></TouchableOpacity><View><Text style={s.eyebrow}>ASISTENCIA</Text><Text style={s.title}>Permisos de salida</Text><Text style={s.subtitle}>{String(params.fullName || '')}</Text></View></View>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text style={s.cardTitle}>Solicitar salida anticipada</Text>
        <Text style={s.help}>Tu horario regular ya se toma en cuenta. Usa este formulario solo para citas médicas, emergencias u otros permisos excepcionales.</Text>
        <Text style={s.label}>Fecha</Text>
        {Platform.OS === 'web' ? <input type="date" value={date} min={todayLocal()} onChange={(event) => setDate(event.currentTarget.value)} style={webInputStyle} /> : <TextInput value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" placeholderTextColor="#6E8297" style={s.input} />}
        <Text style={s.label}>Hora autorizada de salida</Text>
        {Platform.OS === 'web' ? <input type="time" value={time} onChange={(event) => setTime(event.currentTarget.value)} style={webInputStyle} /> : <TextInput value={time} onChangeText={setTime} placeholder="HH:mm" placeholderTextColor="#6E8297" style={s.input} />}
        <Text style={s.label}>Tipo de permiso</Text><View style={s.types}>{types.map(([value,label]) => <TouchableOpacity key={value} onPress={() => { setType(value); setReason(''); setMessage(''); }} style={[s.typeBtn,type===value&&s.typeActive]}><Text style={[s.typeText,type===value&&s.typeTextActive]}>{label}</Text></TouchableOpacity>)}</View>
        {type === 'OTHER' && <><Text style={s.label}>Especifica el motivo</Text><TextInput value={reason} onChangeText={setReason} multiline placeholder="Explica brevemente el motivo" placeholderTextColor="#6E8297" style={[s.input,s.area]} /></>}
        <TouchableOpacity onPress={pickFile} style={s.file}><Ionicons name="attach" size={20} color="#7BC3FF" /><Text style={s.fileText}>{attachment?.name || 'Adjuntar sustento (opcional, máximo 450 KB)'}</Text></TouchableOpacity>
        {!!message && <Text style={s.message}>{message}</Text>}
        <TouchableOpacity disabled={saving} onPress={submit} style={[s.submit,saving&&{opacity:.6}]}><Text style={s.submitText}>{saving?'Enviando...':'Enviar a administración'}</Text></TouchableOpacity>
      </View>
      <Text style={s.section}>Mis solicitudes</Text>
      {items.map(item => <View key={item.id} style={s.item}><View style={s.itemTop}><Text style={s.itemDate}>{item.permissionDate} · {item.authorizedExitTime}</Text><Text style={[s.badge,{color:item.status==='APPROVED'?'#4ADE80':item.status==='REJECTED'?'#FB7185':'#FBBF24'}]}>{statusLabel[item.status]||item.status}</Text></View><Text style={s.itemReason}>{item.reason}</Text>{item.reviewComment&&<Text style={s.review}>Administración: {item.reviewComment}</Text>}{item.status==='PENDING'&&<TouchableOpacity onPress={()=>cancel(item.id)}><Text style={s.cancel}>Cancelar solicitud</Text></TouchableOpacity>}</View>)}
      {!items.length&&<Text style={s.empty}>Aún no tienes solicitudes.</Text>}
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({page:{flex:1,backgroundColor:'#061A2D'},header:{flexDirection:'row',gap:14,padding:20,borderBottomWidth:1,borderBottomColor:'#173A55'},back:{width:44,height:44,borderRadius:12,backgroundColor:'#102D47',alignItems:'center',justifyContent:'center'},eyebrow:{color:'#68B8F8',fontSize:12,fontWeight:'800',letterSpacing:1.5},title:{color:'#FFF',fontSize:25,fontWeight:'800'},subtitle:{color:'#9CB0C3',fontSize:13},content:{padding:18,maxWidth:760,width:'100%',alignSelf:'center',paddingBottom:50},card:{backgroundColor:'#0C263D',borderRadius:18,padding:20,borderWidth:1,borderColor:'#244966'},cardTitle:{color:'#FFF',fontSize:20,fontWeight:'800'},help:{color:'#AAC0D3',lineHeight:20,marginTop:7,marginBottom:15},label:{color:'#DCEAF5',fontWeight:'700',marginTop:12,marginBottom:6},input:{backgroundColor:'#071B2D',borderWidth:1,borderColor:'#315572',borderRadius:11,padding:13,color:'#FFF'},area:{height:90,textAlignVertical:'top'},types:{flexDirection:'row',flexWrap:'wrap',gap:8},typeBtn:{borderWidth:1,borderColor:'#315572',borderRadius:20,paddingHorizontal:12,paddingVertical:8},typeActive:{backgroundColor:'#208AEF',borderColor:'#208AEF'},typeText:{color:'#B7CADB',fontSize:12},typeTextActive:{color:'#FFF',fontWeight:'800'},file:{flexDirection:'row',alignItems:'center',gap:8,padding:13,borderWidth:1,borderStyle:'dashed',borderColor:'#4C7899',borderRadius:11,marginTop:15},fileText:{color:'#9EC6E5',flex:1},message:{color:'#FBBF24',marginTop:12},submit:{backgroundColor:'#2C99F2',padding:15,borderRadius:12,alignItems:'center',marginTop:16},submitText:{fontWeight:'800',color:'#FFF'},section:{color:'#FFF',fontSize:19,fontWeight:'800',marginTop:25,marginBottom:10},item:{backgroundColor:'#0C263D',borderRadius:14,padding:16,marginBottom:10,borderWidth:1,borderColor:'#244966'},itemTop:{flexDirection:'row',justifyContent:'space-between',gap:10},itemDate:{color:'#FFF',fontWeight:'800'},badge:{fontWeight:'800',fontSize:12,textTransform:'uppercase'},itemReason:{color:'#B7CADB',marginTop:8},review:{color:'#7BC3FF',marginTop:7},cancel:{color:'#FB7185',fontWeight:'700',marginTop:12},empty:{color:'#8299AD',textAlign:'center',padding:24}});
