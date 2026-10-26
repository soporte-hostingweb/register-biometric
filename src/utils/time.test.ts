// node --test src/utils/time.test.ts  (npm test)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays, checkTimeToInstant, formatCheckTime, formatHistoryTime, formatLimaClock, formatLimaTime,
  formatShiftTime, limaDateStr, noteServerDate, serverNow,
} from './time.ts';

const CELULAR = 'MOBILE_GPS:-12.04318,-77.02824';
const BIOMETRICO = 'CQZ7224460001';

test('celular: la Z es real, se pasa a Lima (marcación 82755, 17:27:11 de Lima)', () => {
  assert.equal(formatCheckTime('2026-10-26T22:27:11.000Z', CELULAR), '05:27 p. m.');
});

test('manual del superadmin: también UTC real', () => {
  assert.equal(formatCheckTime('2026-10-26T13:00:00.000Z', 'MANUAL_SUPERADMIN'), '08:00 a. m.');
});

test('biométrico: hora local de Lima, la Z se ignora', () => {
  assert.equal(formatCheckTime('2026-10-26T08:52:00.000Z', BIOMETRICO), '08:52 a. m.');
  assert.equal(formatCheckTime('2026-10-26 08:52:00', BIOMETRICO), '08:52 a. m.');
});

test('offset explícito -05:00: manda sobre el SN', () => {
  assert.equal(formatCheckTime('2026-10-26T17:27:11-05:00', CELULAR), '05:27 p. m.');
  assert.equal(formatCheckTime('2026-10-26T17:27:11-05:00', BIOMETRICO), '05:27 p. m.');
  assert.equal(formatCheckTime('2026-10-26T17:27:11-0500', BIOMETRICO), '05:27 p. m.');
  assert.equal(formatCheckTime('2026-10-26T22:27:11+00:00', BIOMETRICO), '05:27 p. m.');
});

test('historial: textos ya en Lima, solo se uniforman', () => {
  assert.equal(formatHistoryTime('05:27 p. m.'), '05:27 p. m.');
  assert.equal(formatHistoryTime('01:25 PM'), '01:25 p. m.');
  assert.equal(formatHistoryTime('13:25:00'), '01:25 p. m.');
  assert.equal(formatHistoryTime('8:25 a. m.'), '08:25 a. m.');
  assert.equal(formatHistoryTime('12:10 AM'), '12:10 a. m.');
  assert.equal(formatHistoryTime('12:10 p.m.'), '12:10 p. m.');
  assert.equal(formatHistoryTime('-- : --'), '--');
  assert.equal(formatHistoryTime(null), '--');
});

test('historial: un ISO con offset (arreglo futuro del backend) se respeta', () => {
  assert.equal(formatHistoryTime('2026-10-26T17:27:11-05:00'), '05:27 p. m.');
});

test('medianoche', () => {
  assert.equal(formatCheckTime('2026-10-27T05:00:00.000Z', CELULAR), '12:00 a. m.');
  assert.equal(formatCheckTime('2026-10-27T00:00:00.000Z', BIOMETRICO), '12:00 a. m.');
  assert.equal(formatHistoryTime('00:05'), '12:05 a. m.');
  assert.equal(formatLimaClock(Date.UTC(2026, 9, 27, 5, 0, 9)), '12:00:09 a. m.');
});

test('cambio de día: después de las 19:00 de Lima el UTC ya es mañana', () => {
  // 19:30 de Lima del 26 = 00:30 UTC del 27.
  const instant = checkTimeToInstant('2026-10-27T00:30:00.000Z', CELULAR);
  assert.equal(limaDateStr(instant!), '2026-10-26');
  assert.equal(formatLimaTime(instant!), '07:30 p. m.');
  // 23:59 de Lima del 26 y 00:00 del 27.
  assert.equal(limaDateStr(Date.UTC(2026, 9, 27, 4, 59)), '2026-10-26');
  assert.equal(limaDateStr(Date.UTC(2026, 9, 27, 5, 0)), '2026-10-27');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('valores vacíos o raros', () => {
  assert.equal(formatCheckTime(null, CELULAR), '--');
  assert.equal(formatCheckTime('--', CELULAR), '--');
  assert.equal(formatCheckTime('basura', CELULAR), '--');
  assert.equal(checkTimeToInstant('', BIOMETRICO), null);
});

test('turno: columnas TIME de SQL Server', () => {
  assert.equal(formatShiftTime('1970-01-01T08:00:00.000Z'), '08:00');
  assert.equal(formatShiftTime('08:00:00'), '08:00');
  assert.equal(formatShiftTime(new Date('1970-01-01T18:30:00.000Z')), '18:30');
  assert.equal(formatShiftTime(null), null);
});

test('reloj del servidor: el header Date corrige un celular adelantado', () => {
  const ahora = Date.now();
  // El celular va 3 minutos adelantado respecto al servidor.
  noteServerDate(new Date(ahora - 180_000).toUTCString(), ahora - 100, ahora);
  const diferencia = serverNow() - (Date.now() - 180_000);
  assert.ok(Math.abs(diferencia) < 1_500, `desfase mal medido: ${diferencia} ms`);
});
