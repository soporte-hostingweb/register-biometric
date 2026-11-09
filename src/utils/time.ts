// Horas de asistencia, siempre en hora de Lima.
//
// Cómo llegan del backend (gestor.hwperu.com, ver docs/pendientes-backend.md):
// - /api/attendance/logs devuelve CHECKTIME como ISO con «Z», pero esa Z no
//   siempre es cierta. LogDateTime mezcla dos relojes:
//     · celular (SN «MOBILE_GPS:…») y manual (SN «MANUAL_SUPERADMIN»): UTC real;
//     · biométrico (SN = número de serie del equipo): ya es hora de Lima.
//   Si algún día el backend manda un offset explícito (p. ej. -05:00), ese manda.
// - /api/attendance/history/... ya entrega el texto en hora de Lima
//   («05:27 p. m.»): solo se uniforma, nunca se convierte.
//
// Perú no tiene horario de verano desde 1994: Lima es siempre UTC-5. Por eso el
// cálculo se hace a mano y no depende del Intl del celular (Hermes en Android).

export const LIMA_TIME_ZONE = 'America/Lima';
const LIMA_OFFSET_MS = -5 * 60 * 60 * 1000;
const SIN_HORA = '--';

const ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

const pad = (n: number) => String(n).padStart(2, '0');

const esVacio = (value: unknown) => {
  const s = String(value ?? '').trim().toLowerCase();
  return s === '' || s === '--' || s === '-' || s === '-- : --' || s === 'null' || s === 'undefined';
};

/** ¿Esta marcación se guardó en UTC real? Celular y manual sí; el biométrico no. */
export function snGuardaEnUtc(sn: unknown): boolean {
  const s = String(sn ?? '').trim().toUpperCase();
  return s.startsWith('MOBILE_GPS:') || s === 'MANUAL_SUPERADMIN';
}

function offsetEnMs(zona: string): number {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(zona);
  if (!m) return 0;
  const minutos = Number(m[2]) * 60 + Number(m[3]);
  return (m[1] === '-' ? -1 : 1) * minutos * 60 * 1000;
}

/**
 * El instante (ms desde 1970) de un CHECKTIME de /api/attendance/logs.
 * 1. Con offset explícito distinto de Z: se usa ese offset.
 * 2. Si no, por SN: celular y manual son UTC; el biométrico es hora de Lima.
 */
export function checkTimeToInstant(value: unknown, sn?: unknown): number | null {
  if (esVacio(value)) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const m = ISO.exec(String(value).trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, ms, zona] = m;
  const comoUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0), Number((ms || '0').padEnd(3, '0')));
  if (Number.isNaN(comoUtc)) return null;
  if (zona && zona.toUpperCase() !== 'Z') return comoUtc - offsetEnMs(zona);
  return snGuardaEnUtc(sn) ? comoUtc : comoUtc - LIMA_OFFSET_MS;
}

/** Las partes de la hora de Lima de un instante. */
function partesEnLima(instant: number) {
  const d = new Date(instant + LIMA_OFFSET_MS);
  return {
    fecha: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    horas: d.getUTCHours(),
    minutos: d.getUTCMinutes(),
    segundos: d.getUTCSeconds(),
  };
}

/** «hh:mm a. m.» con horas de 12 (12:05 a. m. es la medianoche y cinco). */
function formatoDoce(horas: number, minutos: number, segundos?: number): string {
  const sufijo = horas < 12 ? 'a. m.' : 'p. m.';
  const h12 = horas % 12 === 0 ? 12 : horas % 12;
  return `${pad(h12)}:${pad(minutos)}${segundos === undefined ? '' : `:${pad(segundos)}`} ${sufijo}`;
}

/** Un instante como «05:27 p. m.» en hora de Lima. */
export function formatLimaTime(instant: number | Date): string {
  const ms = instant instanceof Date ? instant.getTime() : instant;
  if (!Number.isFinite(ms)) return SIN_HORA;
  const p = partesEnLima(ms);
  return formatoDoce(p.horas, p.minutos);
}

/** El reloj grande: «05:27:11 p. m.» en hora de Lima. */
export function formatLimaClock(instant: number | Date): string {
  const ms = instant instanceof Date ? instant.getTime() : instant;
  if (!Number.isFinite(ms)) return SIN_HORA;
  const p = partesEnLima(ms);
  return formatoDoce(p.horas, p.minutos, p.segundos);
}

/** La fecha «AAAA-MM-DD» de Lima de un instante. */
export function limaDateStr(instant: number | Date): string {
  return partesEnLima(instant instanceof Date ? instant.getTime() : instant).fecha;
}

/** «AAAA-MM-DD» más (o menos) unos días, sin depender de la zona del celular. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Un CHECKTIME de /api/attendance/logs listo para mostrar. */
export function formatCheckTime(value: unknown, sn?: unknown): string {
  const instant = checkTimeToInstant(value, sn);
  return instant === null ? SIN_HORA : formatLimaTime(instant);
}

/**
 * Una hora del historial («05:27 p. m.», «01:25 PM», «13:25:00»), que el
 * backend ya da en hora de Lima: se uniforma a «hh:mm a. m.» sin convertir.
 * Si llega un ISO con offset (arreglo futuro del backend), se respeta.
 */
export function formatHistoryTime(value: unknown): string {
  if (esVacio(value)) return SIN_HORA;
  const str = String(value).trim();
  const iso = ISO.exec(str);
  if (iso) {
    // Con offset explícito o Z se respeta; sin zona es hora de Lima.
    const instant = checkTimeToInstant(str, iso[8] ? 'MOBILE_GPS:' : '');
    return instant === null ? SIN_HORA : formatLimaTime(instant);
  }
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(.*)$/.exec(str);
  if (!m) return str;
  let horas = Number(m[1]);
  const minutos = Number(m[2]);
  const marca = m[3].toLowerCase().replace(/[\s.]/g, '');
  if (marca === 'pm' && horas < 12) horas += 12;
  else if (marca === 'am' && horas === 12) horas = 0;
  if (horas > 23 || minutos > 59) return str;
  return formatoDoce(horas, minutos);
}

/**
 * Las columnas TIME de SQL Server (EntryTime, ExitTime) llegan como fecha de
 * 1970 en UTC: la hora es la parte horaria en UTC, sin convertir. «08:00».
 */
export function formatShiftTime(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const iso = ISO.exec(value.trim());
    if (iso) return `${pad(Number(iso[4]))}:${iso[5]}`;
    const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
    return match ? `${pad(Number(match[1]))}:${match[2]}` : null;
  }
  const asDate = new Date(value as any);
  if (Number.isNaN(asDate.getTime())) return null;
  return asDate.toISOString().slice(11, 16);
}

/* ---------------------------------------------------------------------------
   Reloj del servidor: la hora del celular puede estar mal. Cada respuesta de
   la API trae el header Date; con él se guarda el desfase y serverNow() da la
   hora del servidor. Sin header (p. ej. web en otro origen sin
   Access-Control-Expose-Headers: Date), se queda con la del celular.
   --------------------------------------------------------------------------- */

let desfaseDelServidor = 0;

/** Anota el header Date de una respuesta. `enviado` y `recibido` en ms del celular. */
export function noteServerDate(dateHeader: string | null | undefined, enviado: number, recibido: number): void {
  if (!dateHeader) return;
  const servidor = Date.parse(dateHeader);
  if (!Number.isFinite(servidor)) return;
  // Una respuesta lenta no sirve para medir: el error sería mayor que el desfase.
  if (recibido - enviado > 10_000) return;
  // El header tiene resolución de 1 s: se toma la mitad del viaje y medio segundo.
  desfaseDelServidor = servidor + 500 - (enviado + recibido) / 2;
}

/** La hora actual del servidor (o la del celular si aún no se conoce el desfase). */
export function serverNow(): number {
  return Date.now() + desfaseDelServidor;
}
