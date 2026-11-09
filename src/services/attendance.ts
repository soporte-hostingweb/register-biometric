import { Platform } from 'react-native';
import { apiFetch } from './api';
import { formatHistoryTime, formatLimaTime, limaDateStr, serverNow } from '../utils/time';

// Un día de /api/attendance/history/by-email/:email (attendance.AttendanceDailyReports).
export type HistoryLog = {
  date: string;
  clockIn?: string;
  clockOut?: string;
  totalHours?: string;
  status?: string;
  observations?: string;
};

// Una marcación suelta para las listas tipo línea de tiempo.
export type MarkItem = {
  key: string;
  tipo: 'Entrada' | 'Salida';
  fecha: string; // AAAA-MM-DD en Lima
  hora: string;
  status?: StatusKind;
  ubicacion?: string;
};

export type StatusKind = 'puntual' | 'tarde' | 'falta' | 'otro';

const DIAS = { es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const MESES_CORTOS = { es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
export const MESES = {
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** «2026-10-29» (o un ISO) → { y, m (0-11), d, weekday }. Sin depender de la zona del celular. */
export function dateParts(value: unknown) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const weekday = new Date(Date.UTC(y, mo, d)).getUTCDay();
  return { y, m: mo, d, weekday, iso: `${m[1]}-${m[2]}-${m[3]}` };
}

/** «Mié, 29 Oct. 2026». */
export function formatShortDate(value: unknown, language: 'es' | 'en' = 'es') {
  const p = dateParts(value);
  if (!p) return String(value || '');
  return `${DIAS[language][p.weekday]}, ${p.d} ${MESES_CORTOS[language][p.m]}. ${p.y}`;
}

/** «Mié, 29 de Oct. de 2026» para la tarjeta del reloj. */
export function formatClockDate(instant: number, language: 'es' | 'en' = 'es') {
  const p = dateParts(limaDateStr(instant));
  if (!p) return '';
  return language === 'es'
    ? `${DIAS.es[p.weekday]}, ${p.d} de ${MESES_CORTOS.es[p.m]}. de ${p.y}`
    : `${DIAS.en[p.weekday]}, ${MESES_CORTOS.en[p.m]} ${p.d}, ${p.y}`;
}

export const hasClockIn = (log: HistoryLog) => {
  const value = String(log?.clockIn || '').trim().toLowerCase();
  return value !== '' && value !== '--' && value !== '-- : --' && value !== '-' && value !== 'null';
};

const hasClockOut = (log: HistoryLog) => {
  const value = String(log?.clockOut || '').trim().toLowerCase();
  return value !== '' && value !== '--' && value !== '-- : --' && value !== '-' && value !== 'null';
};

/**
 * El backend devuelve «Puntual» o «Tarde» cuando hubo entrada, y el estado del
 * reporte diario («FALTA», «PERMISO»…) cuando no. Se aceptan las dos grafías de
 * tardanza porque las versiones viejas del backend usaban «Tardanza».
 */
export function statusKind(status: unknown): StatusKind {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'puntual') return 'puntual';
  if (s === 'tarde' || s === 'tardanza') return 'tarde';
  if (s === 'falta' || s === 'inasistencia') return 'falta';
  return 'otro';
}

export function statusLabel(status: unknown, tr: (en: string, es: string) => string) {
  const kind = statusKind(status);
  if (kind === 'puntual') return tr('On time', 'Puntual');
  if (kind === 'tarde') return tr('Late', 'Tarde');
  if (kind === 'falta') return tr('Absence', 'Falta');
  const raw = String(status || '').trim();
  if (!raw) return tr('Registered', 'Registrado');
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export const isWorkday = (log: HistoryLog) => {
  const p = dateParts(log.date);
  return Boolean(p && p.weekday >= 1 && p.weekday <= 5);
};

export const logsOfMonth = (logs: HistoryLog[], year: number, month: number) =>
  logs.filter((log) => {
    const p = dateParts(log.date);
    return Boolean(p && p.y === year && p.m === month && p.weekday >= 1 && p.weekday <= 5);
  });

/** Las mismas cuentas que el dashboard anterior: días hábiles del mes. */
export function monthStats(monthLogs: HistoryLog[]) {
  const totalHours = monthLogs.reduce((acc, log) => {
    const hrs = parseFloat(String(log.totalHours || '0'));
    return acc + (Number.isFinite(hrs) ? hrs : 0);
  }, 0);
  return {
    totalHours: totalHours.toFixed(1),
    asistencias: monthLogs.filter(hasClockIn).length,
    tardanzas: monthLogs.filter((log) => hasClockIn(log) && statusKind(log.status) === 'tarde').length,
    faltas: monthLogs.filter((log) => !hasClockIn(log)).length,
  };
}

export async function fetchHistory(email: string): Promise<HistoryLog[] | null> {
  try {
    const response = await apiFetch(`/api/attendance/history/by-email/${encodeURIComponent(email)}`);
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return null;
  }
}

/**
 * Cada día del historial se parte en su Entrada y su Salida, de la más nueva a
 * la más vieja. Las de hoy se toman de /api/attendance/logs (`today`), que trae
 * la hora exacta y la ubicación de cada marcación.
 */
export function buildMarks(logs: HistoryLog[], today: MarkItem[], todayStr: string): MarkItem[] {
  const todayStatus = statusKind(logs.find((log) => dateParts(log.date)?.iso === todayStr)?.status);
  const marks: MarkItem[] = [...today]
    .reverse()
    .map((m) => (m.tipo === 'Entrada' && todayStatus !== 'otro' ? { ...m, status: todayStatus } : m));

  const days = logs
    .filter((log) => {
      const p = dateParts(log.date);
      return p && p.iso < todayStr && hasClockIn(log);
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  for (const log of days) {
    const iso = dateParts(log.date)!.iso;
    const entrada = formatHistoryTime(log.clockIn);
    const salida = formatHistoryTime(log.clockOut);
    if (hasClockOut(log) && salida !== entrada) {
      marks.push({ key: `${iso}-out`, tipo: 'Salida', fecha: iso, hora: salida });
    }
    const kind = statusKind(log.status);
    marks.push({ key: `${iso}-in`, tipo: 'Entrada', fecha: iso, hora: entrada, status: kind === 'otro' ? undefined : kind });
  }
  return marks;
}

/* ---------------------------------------------------------------------------
   Exportar el mes a Excel y PDF (solo web). Las librerías se cargan del CDN con
   integridad SRI: si el CDN sirviera otro archivo, el navegador no lo ejecuta.
   --------------------------------------------------------------------------- */

type ReportInfo = { logs: HistoryLog[]; fullName?: string; email?: string; cargo?: string | null; year: number; month: number };

const escaparHtml = (valor: unknown) => String(valor ?? '')
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

const loadScript = (globalName: string, src: string, integrity: string) => new Promise<any>((resolve, reject) => {
  if ((window as any)[globalName]) {
    resolve((window as any)[globalName]);
    return;
  }
  const script = document.createElement('script');
  script.src = src;
  script.integrity = integrity;
  script.crossOrigin = 'anonymous';
  script.onload = () => resolve((window as any)[globalName]);
  script.onerror = (err) => reject(err);
  document.head.appendChild(script);
});

const fileName = (fullName: string | undefined, ext: string) => `reporte_asistencia_${(fullName || 'empleado').replace(/\s+/g, '_')}.${ext}`;
const ddmmyyyy = (date: string) => {
  const p = dateParts(date);
  return p ? `${String(p.d).padStart(2, '0')}/${String(p.m + 1).padStart(2, '0')}/${p.y}` : date;
};

export const canExportReports = () => Platform.OS === 'web';

export async function downloadExcel({ logs, fullName, email, cargo, year, month }: ReportInfo) {
  if (!canExportReports() || logs.length === 0) return;
  const ExcelJS = await loadScript(
    'ExcelJS',
    'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js',
    'sha512-UnrKxsCMN9hFk7M56t4I4ckB4N/2HHi0w/7+B/1JsXIX3DmyBcsGpT3/BsuZMZf+6mAr0vP81syWtfynHJ69JA==',
  );
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Reporte de Asistencia');
  worksheet.views = [{ showGridLines: true }];

  const titleRow = worksheet.getRow(2);
  titleRow.getCell(2).value = 'REPORTE DE ASISTENCIA MENSUAL';
  titleRow.getCell(2).font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF1E3A5F' } };

  const labelFont = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF555555' } };
  const valueFont = { name: 'Segoe UI', size: 11 };
  const info: [number, number, string, string][] = [
    [4, 2, 'Colaborador:', fullName || ''],
    [4, 5, 'Periodo:', `${MESES.es[month]} ${year}`],
    [5, 2, 'Correo:', email || ''],
    [5, 5, 'Cargo:', cargo || 'Técnico'],
  ];
  info.forEach(([row, col, label, value]) => {
    const r = worksheet.getRow(row);
    r.getCell(col).value = label;
    r.getCell(col).font = labelFont;
    r.getCell(col + 1).value = value;
    r.getCell(col + 1).font = valueFont;
  });

  const startRow = 7;
  const startCol = 2;
  const headerRow = worksheet.getRow(startRow);
  headerRow.height = 26;
  const columns = [
    { header: 'Fecha', width: 15 },
    { header: 'Entrada', width: 14 },
    { header: 'Salida', width: 14 },
    { header: 'Horas Trabajadas', width: 20 },
    { header: 'Estado', width: 16 },
    { header: 'Observaciones', width: 35 },
  ];
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(startCol + i);
    cell.value = col.header;
    worksheet.getColumn(startCol + i).width = col.width;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
      left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
      bottom: { style: 'medium', color: { argb: 'FF1E3A5F' } },
      right: { style: 'thin', color: { argb: 'FFDDDDDD' } },
    };
  });

  logs.forEach((log, index) => {
    const dataRow = worksheet.getRow(startRow + 1 + index);
    dataRow.height = 22;
    const kind = statusKind(log.status);
    const status = log.status || 'Registrado';
    const values = [ddmmyyyy(log.date), formatHistoryTime(log.clockIn), formatHistoryTime(log.clockOut), log.totalHours || '0h', status, log.observations || ''];
    values.forEach((val, i) => {
      const cell = dataRow.getCell(startCol + i);
      cell.value = val;
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: i <= 4 ? 'center' : undefined };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFEAEAEA' } },
        left: { style: 'thin', color: { argb: 'FFEAEAEA' } },
        bottom: { style: 'thin', color: { argb: 'FFEAEAEA' } },
        right: { style: 'thin', color: { argb: 'FFEAEAEA' } },
      };
      if (i === 4) {
        const palette = kind === 'puntual' ? ['FF2E7D32', 'FFE8F5E9'] : kind === 'tarde' ? ['FFE65100', 'FFFFF3E0'] : kind === 'falta' ? ['FFC62828', 'FFFFEBEE'] : null;
        cell.font = { name: 'Segoe UI', size: 10, bold: true, ...(palette ? { color: { argb: palette[0] } } : {}) };
        if (palette) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette[1] } };
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName(fullName, 'xlsx'));
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadPDF({ logs, fullName, email, cargo, year, month }: ReportInfo) {
  if (!canExportReports() || logs.length === 0) return;
  const html2pdf = await loadScript(
    'html2pdf',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg==',
  );

  // Observaciones, estado y nombre vienen del servidor: escapados antes de ir a innerHTML.
  const e = escaparHtml;
  const element = document.createElement('div');
  element.style.padding = '30px';
  element.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  element.style.color = '#333';
  element.style.backgroundColor = '#ffffff';

  const rows = logs.map((log) => {
    const kind = statusKind(log.status);
    const [statusColor, statusBg] = kind === 'tarde'
      ? ['#FF9800', 'rgba(255,152,0,0.1)']
      : kind === 'falta' ? ['#F44336', 'rgba(244,67,54,0.1)'] : ['#4CAF50', 'rgba(76,175,80,0.1)'];
    return `
      <tr style="border-bottom: 1px solid #E0E0E0;">
        <td style="padding: 10px 12px; font-size: 12px;"><strong>${e(ddmmyyyy(log.date))}</strong></td>
        <td style="padding: 10px 12px; font-size: 12px;">${e(formatHistoryTime(log.clockIn))}</td>
        <td style="padding: 10px 12px; font-size: 12px;">${e(formatHistoryTime(log.clockOut))}</td>
        <td style="padding: 10px 12px; font-size: 12px;">${e(log.totalHours || '0h')}</td>
        <td style="padding: 10px 12px; font-size: 12px;">
          <span style="font-weight: 700; padding: 3px 6px; border-radius: 4px; font-size: 10px; text-transform: uppercase; color: ${statusColor}; background-color: ${statusBg};">${e(log.status || 'Registrado')}</span>
        </td>
        <td style="padding: 10px 12px; font-size: 12px;">${e(log.observations || '')}</td>
      </tr>`;
  }).join('');

  const th = 'padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; border: 1px solid #1E3A5F;';
  element.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1F5BD8; padding-bottom: 15px; margin-bottom: 25px;">
      <div style="font-size: 26px; font-weight: 800; color: #1E3A5F; letter-spacing: 1px; font-family: sans-serif;">HWPerú</div>
      <div style="font-size: 20px; font-weight: 600; color: #555; font-family: sans-serif;">Reporte Mensual de Asistencia</div>
    </div>
    <div style="margin-bottom: 30px; line-height: 1.6; font-size: 14px; background-color: #F4F6F9; padding: 15px; border-radius: 8px;">
      <div><strong>Colaborador:</strong> ${e(fullName)}</div>
      <div><strong>Correo Electrónico:</strong> ${e(email)}</div>
      <div><strong>Cargo:</strong> ${e(cargo || 'Técnico')}</div>
      <div><strong>Periodo:</strong> ${e(`${MESES.es[month]} ${year}`)}</div>
      <div><strong>Fecha de Emisión:</strong> ${limaDateStr(serverNow()).split('-').reverse().join('/')} ${formatLimaTime(serverNow())}</div>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
      <thead>
        <tr style="background-color: #1E3A5F; color: white;">
          <th style="${th}">Fecha</th><th style="${th}">Entrada</th><th style="${th}">Salida</th>
          <th style="${th}">Horas Trab.</th><th style="${th}">Estado</th><th style="${th}">Observaciones</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  html2pdf().from(element).set({
    margin: 10,
    filename: fileName(fullName, 'pdf'),
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }).save();
}
