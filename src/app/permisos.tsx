import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch } from '../services/api';
import { useLanguage } from '../services/language';

const types = [
  ['EARLY_DEPARTURE', 'Salida anticipada', 'Early departure'],
  ['SINGLE_DAY_ABSENCE', 'Falta por un día', 'One-day absence'],
  ['DATE_RANGE_ABSENCE', 'Falta por varios días', 'Multiple-day absence'],
  ['HOURLY_PERMISSION', 'Permiso por horas', 'Hourly permission'],
  ['LATE_ARRIVAL', 'Ingreso tardío', 'Late arrival'],
  ['MEDICAL_APPOINTMENT', 'Cita o atención médica', 'Medical appointment'],
  ['WORK_COMMISSION', 'Comisión de trabajo', 'Work assignment'],
  ['OTHER', 'Otro permiso', 'Other permission'],
];

const typeLabel = (value: string, tr: (english: string, spanish: string) => string) => {
  const found = types.find(([id]) => id === value);
  return found ? tr(found[2], found[1]) : value;
};

const webInputStyle: any = { width:'100%', boxSizing:'border-box', backgroundColor:'#071B2D', border:'1px solid #315572', borderRadius:11, padding:13, color:'#FFFFFF', colorScheme:'dark', fontSize:16, fontFamily:'inherit' };
const todayLocal = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const isRange = (type:string) => ['DATE_RANGE_ABSENCE','WORK_COMMISSION'].includes(type);
const isSingleTime = (type:string) => ['EARLY_DEPARTURE','LATE_ARRIVAL'].includes(type);
const isTimeRange = (type:string) => ['HOURLY_PERMISSION','MEDICAL_APPOINTMENT','OTHER'].includes(type);

export default function PermissionsScreen() {
  const { tr } = useLanguage();
  const params = useLocalSearchParams();
  const [items,setItems]=useState<any[]>([]), [type,setType]=useState(''), [date,setDate]=useState(''), [endDate,setEndDate]=useState('');
  const [startTime,setStartTime]=useState(''), [endTime,setEndTime]=useState(''), [reason,setReason]=useState('');
  const [attachment,setAttachment]=useState<any>(null), [message,setMessage]=useState(''), [saving,setSaving]=useState(false);

  const load=async()=>{const res=await apiFetch('/api/attendance/permissions/me');if(res.ok)setItems(await res.json());};
  useEffect(()=>{load();},[]);
  const resetFields=(nextType:string)=>{setType(nextType);setDate('');setEndDate('');setStartTime('');setEndTime('');setReason('');setMessage('');};
  const pickFile=()=>{if(Platform.OS!=='web')return;const input=document.createElement('input');input.type='file';input.accept='application/pdf,image/jpeg,image/png';input.onchange=()=>{const file=input.files?.[0];if(!file)return;if(file.size>450*1024){setMessage('El sustento no puede superar 450 KB.');return;}const reader=new FileReader();reader.onload=()=>setAttachment({name:file.name,data:reader.result});reader.readAsDataURL(file);};input.click();};

  const submit=async()=>{
    if(!type){setMessage('Selecciona el tipo de permiso.');return;}
    if(!date){setMessage('Selecciona la fecha del permiso.');return;}
    if(isRange(type)&&(!endDate||endDate<date)){setMessage('Selecciona una fecha final válida.');return;}
    if(isSingleTime(type)&&!startTime){setMessage('Selecciona la hora autorizada.');return;}
    if(isTimeRange(type)&&(!startTime||!endTime||endTime<=startTime)){setMessage('Selecciona una hora de inicio y fin válida.');return;}
    if(reason.trim().length<5){setMessage('Escribe el motivo del permiso.');return;}
    setSaving(true);setMessage('');
    try{const res=await apiFetch('/api/attendance/permissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({permissionType:type,permissionDate:date,permissionEndDate:endDate||date,startTime:startTime||null,endTime:endTime||null,authorizedExitTime:startTime||'00:00',reason:reason.trim(),attachment})});const data=await res.json();setMessage(data.message||(res.ok?'Solicitud enviada.':'No se pudo enviar.'));if(res.ok){resetFields('');setAttachment(null);await load();}}finally{setSaving(false);}
  };
  const cancel=async(id:number)=>{const res=await apiFetch(`/api/attendance/permissions/${id}/cancel`,{method:'POST'});if(res.ok)await load();};
  const statusLabel:any={PENDING:'Pendiente',APPROVED:'Aprobado',REJECTED:'Rechazado',CANCELLED:'Cancelado'};
  const DateField=({value,onChange,min}:{value:string,onChange:(value:string)=>void,min?:string})=>Platform.OS==='web'?<input type="date" value={value} min={min} onChange={e=>onChange(e.currentTarget.value)} style={webInputStyle}/>:<TextInput value={value} onChangeText={onChange} placeholder="AAAA-MM-DD" placeholderTextColor="#6E8297" style={s.input}/>;
  const TimeField=({value,onChange}:{value:string,onChange:(value:string)=>void})=>Platform.OS==='web'?<input type="time" value={value} onChange={e=>onChange(e.currentTarget.value)} style={webInputStyle}/>:<TextInput value={value} onChangeText={onChange} placeholder="HH:mm" placeholderTextColor="#6E8297" style={s.input}/>;

  return <SafeAreaView style={s.page}>
    <View style={s.header}><TouchableOpacity onPress={()=>router.back()} style={s.back}><Ionicons name="arrow-back" size={24} color="#7BC3FF"/></TouchableOpacity><View style={{flex:1}}><Text style={s.eyebrow}>{tr('ATTENDANCE','ASISTENCIA')}</Text><Text style={s.title}>{tr('Permissions and absences','Permisos y ausencias')}</Text><Text style={s.subtitle}>{String(params.fullName||'')}</Text></View></View>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text style={s.cardTitle}>{tr('Request permission','Solicitar permiso')}</Text>
        <Text style={s.help}>{tr('First select the permission type. Only the required fields will be displayed.','Primero selecciona el tipo de permiso. Solo se mostrarán los campos necesarios.')}</Text>
        <Text style={s.label}>{tr('Permission type','Tipo de permiso')}</Text>
        {Platform.OS==='web'?<select value={type} onChange={e=>resetFields(e.currentTarget.value)} style={webInputStyle}><option value="">Selecciona un tipo de permiso</option>{types.map(([id,es,en])=><option key={id} value={id}>{tr(en,es)}</option>)}</select>:<View style={s.types}>{types.map(([id,es,en])=><TouchableOpacity key={id} onPress={()=>resetFields(id)} style={[s.typeBtn,type===id&&s.typeActive]}><Text style={[s.typeText,type===id&&s.typeTextActive]}>{tr(en,es)}</Text></TouchableOpacity>)}</View>}
        {!!type&&<>
          <Text style={s.label}>{isRange(type)?tr('Start date','Fecha de inicio'):tr('Date','Fecha')}</Text><DateField value={date} onChange={setDate} min={todayLocal()}/>
          {isRange(type)&&<><Text style={s.label}>{tr('End date','Fecha final')}</Text><DateField value={endDate} onChange={setEndDate} min={date||todayLocal()}/></>}
          {isSingleTime(type)&&<><Text style={s.label}>{type==='EARLY_DEPARTURE'?tr('Authorized departure time','Hora autorizada de salida'):tr('Authorized arrival time','Hora autorizada de ingreso')}</Text><TimeField value={startTime} onChange={setStartTime}/></>}
          {isTimeRange(type)&&<><Text style={s.label}>{tr('Start time','Hora de inicio')}</Text><TimeField value={startTime} onChange={setStartTime}/><Text style={s.label}>{tr('End time','Hora final')}</Text><TimeField value={endTime} onChange={setEndTime}/></>}
          <Text style={s.label}>{tr('Reason or details','Motivo o detalle')}</Text><TextInput value={reason} onChangeText={setReason} multiline placeholder={tr('Briefly explain the reason','Explica brevemente el motivo')} placeholderTextColor="#6E8297" style={[s.input,s.area]}/>
          <TouchableOpacity onPress={pickFile} style={s.file}><Ionicons name="attach" size={20} color="#7BC3FF"/><Text style={s.fileText}>{attachment?.name||tr('Attach proof (optional, maximum 450 KB)','Adjuntar sustento (opcional, máximo 450 KB)')}</Text></TouchableOpacity>
          {!!message&&<Text style={s.message}>{message}</Text>}
          <TouchableOpacity disabled={saving} onPress={submit} style={[s.submit,saving&&{opacity:.6}]}><Text style={s.submitText}>{saving?tr('Sending...','Enviando...'):tr('Send to administration','Enviar a administración')}</Text></TouchableOpacity>
        </>}
      </View>
      <Text style={s.section}>{tr('My requests','Mis solicitudes')}</Text>
      {items.map(item=><View key={item.id} style={s.item}><View style={s.itemTop}><View style={{flex:1}}><Text style={s.itemDate}>{typeLabel(item.permissionType,tr)}</Text><Text style={s.itemMeta}>{item.permissionDate}{item.permissionEndDate&&item.permissionEndDate!==item.permissionDate?` → ${item.permissionEndDate}`:''}{item.startTime?` · ${item.startTime}${item.endTime?`–${item.endTime}`:''}`:''}</Text></View><Text style={[s.badge,{color:item.status==='APPROVED'?'#4ADE80':item.status==='REJECTED'?'#FB7185':'#FBBF24'}]}>{statusLabel[item.status]||item.status}</Text></View><Text style={s.itemReason}>{item.reason}</Text>{item.reviewComment&&<Text style={s.review}>Administración: {item.reviewComment}</Text>}{item.status==='PENDING'&&<TouchableOpacity onPress={()=>cancel(item.id)}><Text style={s.cancel}>Cancelar solicitud</Text></TouchableOpacity>}</View>)}
      {!items.length&&<Text style={s.empty}>{tr("You don't have any requests yet.",'Aún no tienes solicitudes.')}</Text>}
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({page:{flex:1,backgroundColor:'#061A2D'},header:{flexDirection:'row',gap:14,padding:20,borderBottomWidth:1,borderBottomColor:'#173A55'},back:{width:44,height:44,borderRadius:12,backgroundColor:'#102D47',alignItems:'center',justifyContent:'center'},eyebrow:{color:'#68B8F8',fontSize:12,fontWeight:'800',letterSpacing:1.5},title:{color:'#FFF',fontSize:25,fontWeight:'800'},subtitle:{color:'#9CB0C3',fontSize:13},content:{padding:18,maxWidth:760,width:'100%',alignSelf:'center',paddingBottom:50},card:{backgroundColor:'#0C263D',borderRadius:18,padding:20,borderWidth:1,borderColor:'#244966'},cardTitle:{color:'#FFF',fontSize:20,fontWeight:'800'},help:{color:'#AAC0D3',lineHeight:20,marginTop:7,marginBottom:15},label:{color:'#DCEAF5',fontWeight:'700',marginTop:12,marginBottom:6},input:{backgroundColor:'#071B2D',borderWidth:1,borderColor:'#315572',borderRadius:11,padding:13,color:'#FFF'},area:{height:90,textAlignVertical:'top'},types:{flexDirection:'row',flexWrap:'wrap',gap:8},typeBtn:{borderWidth:1,borderColor:'#315572',borderRadius:20,paddingHorizontal:12,paddingVertical:8},typeActive:{backgroundColor:'#208AEF',borderColor:'#208AEF'},typeText:{color:'#B7CADB',fontSize:12},typeTextActive:{color:'#FFF',fontWeight:'800'},file:{flexDirection:'row',alignItems:'center',gap:8,padding:13,borderWidth:1,borderStyle:'dashed',borderColor:'#4C7899',borderRadius:11,marginTop:15},fileText:{color:'#9EC6E5',flex:1},message:{color:'#FBBF24',marginTop:12},submit:{backgroundColor:'#2C99F2',padding:15,borderRadius:12,alignItems:'center',marginTop:16},submitText:{fontWeight:'800',color:'#FFF'},section:{color:'#FFF',fontSize:19,fontWeight:'800',marginTop:25,marginBottom:10},item:{backgroundColor:'#0C263D',borderRadius:14,padding:16,marginBottom:10,borderWidth:1,borderColor:'#244966'},itemTop:{flexDirection:'row',justifyContent:'space-between',gap:10},itemDate:{color:'#FFF',fontWeight:'800'},itemMeta:{color:'#88A9C2',marginTop:4,fontSize:12},badge:{fontWeight:'800',fontSize:12,textTransform:'uppercase'},itemReason:{color:'#B7CADB',marginTop:8},review:{color:'#7BC3FF',marginTop:7},cancel:{color:'#FB7185',fontWeight:'700',marginTop:12},empty:{color:'#8299AD',textAlign:'center',padding:24}});
