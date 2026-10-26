# Pendientes del backend (gestor.hwperu.com)

La app de marcación no tiene backend propio: todo lo de abajo se corrige en el
repositorio **gestor.hwperu.com** (`backend/server.js`). Las referencias de línea
son del commit `50a1f6b` y pueden moverse.

Revisado el 26-10-2026 con una marcación real: AttendanceLogID 82755, EmployeeID 1,
desde el celular, a las 17:27:11 de Lima. SQL Server corre en UTC
(`GETDATE() = SYSUTCDATETIME()`, `SYSDATETIMEOFFSET()` con `+00:00`).

---

## Prioridad alta

### 1. `LogDateTime` mezcla UTC y hora de Lima

`attendance.AttendanceLogs.LogDateTime` se guarda con relojes distintos según de
dónde viene la marcación:

| `SN` | Origen | Cómo se inserta | Queda en |
|---|---|---|---|
| `MOBILE_GPS:…` | App del celular (`POST /api/attendance/register`) | `GETDATE()` en un SQL Server en UTC | **UTC** |
| `MANUAL_SUPERADMIN` | Marcación manual (server.js ~3190) | `DATEADD(HOUR, 5, fecha + hora)` | **UTC** |
| N.º de serie del equipo | Biométrico (`POST /iclock/cdata`) | `CHECKTIME` que manda el equipo, en hora local; Node lo lee como UTC (el contenedor no tiene `TZ`) | **Lima** |

Cada lector tiene que adivinar. Hoy:

- `/api/attendance/logs` devuelve `toISOString()` con una «Z» que solo es cierta
  para el celular y la manual. La app lo resuelve por `SN` (`src/utils/time.ts`).
- El reporte diario (`updateDailyReport`, ~17877) y los historiales (~18495,
  ~20580, ~20647) restan 5 h **solo** a `MOBILE_GPS:%`. **La manual
  (`MANUAL_SUPERADMIN`) también está en UTC y no se corrige**: su tardanza sale
  con unas 5 h de más (≈300 minutos). Verificarlo con una marcación manual.
- El historial decide «es del celular» si **algún** log del día lo es. Un día con
  una marcación del biométrico y otra del celular se formatea mal.
- El historial ya entrega la hora como texto en hora de Lima («05:27 p. m.»). La
  app vieja la volvía a tomar como UTC y le restaba 5 h; la nueva solo la
  uniforma.

### 2. `CAST(LogDateTime AS DATE)` corta el día a las 19:00 de Lima

En las marcaciones del celular (UTC), todo lo que pasa después de las 19:00 de
Lima cae en la fecha UTC del día siguiente. Una salida a las 19:30 del 26 queda
con fecha 27. Afecta:

- `/api/attendance/logs?date=` (la app ahora pide hoy y mañana y filtra por la
  fecha de Lima, como parche);
- el reporte diario y la tardanza (`updateDailyReport`);
- las faltas (`auditAndMarkFaltas`, `syncMonthlyFaltas`, `diasQueNoSonFalta`);
- el historial, las ausencias por evaluar y, por todo eso, la **planilla**.

### 3. Propuesta: todo en hora de Lima y la API con offset `-05:00`

1. **Insertar en hora de Lima** las del celular: en vez de `GETDATE()`,
   `CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time' AS DATETIME)`.
2. **Quitar el `+5 h`** de la manual: guardar `fecha + hora` tal cual.
3. **Quitar las correcciones por SN** (`CASE WHEN l.SN LIKE 'MOBILE_GPS:%' THEN DATEADD(HOUR, -5, …)`)
   del reporte diario y de los historiales, y el `timeZone: isMobile ? 'America/Lima' : 'UTC'`
   de `formatTime` (todo pasa a formatearse sin conversión).
4. **Migrar las filas existentes** `MOBILE_GPS:%` y `MANUAL_SUPERADMIN` restando
   5 h (script abajo), con respaldo y prueba previa en una copia de la base.
5. **Recalcular el reporte diario** de los días afectados (las horas de
   `AttendanceDailyReports` se copian de los logs).
6. **Devolver las horas en ISO 8601 con zona**: `2026-10-26T17:27:11-05:00`. La
   app ya lo entiende: con offset explícito, ignora la regla por `SN`.
7. **Exponer el header `Date`** en CORS (`exposedHeaders: ['Date']`). La app web
   corre en otro origen y sin eso no puede leerlo; el reloj de la app en web
   usa entonces la hora de la PC en vez de la del servidor.

**Orden del despliegue.** Los pasos 1 a 5 van juntos, en una ventana sin
marcaciones (de noche): parar el backend, correr la migración, desplegar el
código nuevo, recalcular. Si se despliega el código sin migrar (o al revés),
durante ese rato las filas nuevas y las viejas quedan con relojes distintos.

#### Script de migración propuesto (NO ejecutado)

Probarlo antes en una copia de `ERP_HWPERU`. Se niega a correr dos veces: si ya
existe la tabla de respaldo, se detiene.

```sql
-- Unifica LogDateTime en hora de Lima: resta 5 h a las filas del celular y manuales.
-- Respaldo en attendance.AttendanceLogs_RespaldoHora_20261026.
SET XACT_ABORT ON;

IF OBJECT_ID('attendance.AttendanceLogs_RespaldoHora_20261026') IS NOT NULL
BEGIN
    RAISERROR('La migración ya se corrió: existe el respaldo. No se hace nada.', 16, 1);
    RETURN;
END;

BEGIN TRANSACTION;

SELECT AttendanceLogID, EmployeeID, SN, CheckType, LogDateTime
INTO attendance.AttendanceLogs_RespaldoHora_20261026
FROM attendance.AttendanceLogs
WHERE SN LIKE 'MOBILE[_]GPS:%' OR SN = 'MANUAL_SUPERADMIN';

UPDATE l
SET l.LogDateTime = DATEADD(HOUR, -5, b.LogDateTime)
FROM attendance.AttendanceLogs l
INNER JOIN attendance.AttendanceLogs_RespaldoHora_20261026 b
    ON b.AttendanceLogID = l.AttendanceLogID;

-- Control: las dos cifras deben coincidir.
SELECT
    (SELECT COUNT(*) FROM attendance.AttendanceLogs_RespaldoHora_20261026) AS filas_respaldadas,
    (SELECT COUNT(*) FROM attendance.AttendanceLogs l
       INNER JOIN attendance.AttendanceLogs_RespaldoHora_20261026 b ON b.AttendanceLogID = l.AttendanceLogID
      WHERE l.LogDateTime = DATEADD(HOUR, -5, b.LogDateTime)) AS filas_migradas;

-- Revisar el control y, si cuadra, COMMIT; si no, ROLLBACK.
-- COMMIT TRANSACTION;
-- ROLLBACK TRANSACTION;
```

Días que hay que recalcular en `AttendanceDailyReports` (los de antes y los de
después de migrar, porque una marcación puede cambiar de día):

```sql
SELECT DISTINCT EmployeeID, CAST(LogDateTime AS DATE) AS Dia
FROM attendance.AttendanceLogs_RespaldoHora_20261026
UNION
SELECT DISTINCT EmployeeID, CAST(DATEADD(HOUR, -5, LogDateTime) AS DATE)
FROM attendance.AttendanceLogs_RespaldoHora_20261026;
```

#### Script de reversión (NO ejecutado)

Solo si hay que volver atrás **y** se vuelve también al código anterior.

```sql
SET XACT_ABORT ON;

IF OBJECT_ID('attendance.AttendanceLogs_RespaldoHora_20261026') IS NULL
BEGIN
    RAISERROR('No existe el respaldo: no hay nada que revertir.', 16, 1);
    RETURN;
END;

BEGIN TRANSACTION;

UPDATE l
SET l.LogDateTime = b.LogDateTime
FROM attendance.AttendanceLogs l
INNER JOIN attendance.AttendanceLogs_RespaldoHora_20261026 b
    ON b.AttendanceLogID = l.AttendanceLogID;

SELECT @@ROWCOUNT AS filas_revertidas,
       (SELECT COUNT(*) FROM attendance.AttendanceLogs_RespaldoHora_20261026) AS filas_respaldadas;

-- Si cuadra: COMMIT; luego recalcular los mismos días y, cuando ya no haga
-- falta, borrar el respaldo (DROP TABLE attendance.AttendanceLogs_RespaldoHora_20261026).
-- COMMIT TRANSACTION;
-- ROLLBACK TRANSACTION;
```

---

## Seguridad

### 4. `/api/attendance/logs` no permite saber de quién es cada marcación

Devuelve **todas** las marcaciones del día, de todos los empleados, y no trae
`email`. La app filtraba por coincidencia del primer nombre: dos personas con el
mismo nombre veían las marcaciones de la otra. El identificador fiable es
`USERID` (EmployeeID), pero la app no conoce su propio EmployeeID.

- Que un empleado solo reciba **sus** marcaciones: un endpoint `GET /api/attendance/me/logs?date=`
  que use el usuario del JWT, o que `/logs` filtre por el usuario si no es administrador.
- Mientras tanto, devolver el `EmployeeID` del propio usuario en `/api/auth/profile`
  para que la app filtre por `USERID`.

### 5. `/api/attendance/history/by-email/{email}` deja consultar a cualquiera

Toma el email de la URL y devuelve el historial de esa persona. Debe permitir
solo el **propio** email (el del JWT) o a un administrador.

### 6. Marcación rápida sin verificar

`POST /api/attendance/register` acepta una marcación sin rostro ni PIN (sin
credencial). Definir quién puede hacerla, si es que alguien puede, y rechazarla
para los demás. La app ya no la ofrece: siempre pide rostro o PIN.

### 7. Validar en el servidor la foto, el embedding y la prueba de vida

Hoy el navegador calcula el `faceDescriptor` y el servidor compara contra lo
enrolado. Un cliente modificado puede mandar un descriptor copiado. El servidor
debe recalcular el descriptor desde la foto y hacer la prueba de vida (o al
menos comprobar que la foto y el descriptor corresponden) en vez de confiar en
lo que manda el navegador.

### 8. La ubicación del celular es solo un dato de apoyo

Las coordenadas las manda el dispositivo y se pueden falsear. El control fuerte
es la **IP de la oficina** (ya existe: 403 fuera de la red). La ubicación debe
guardarse como evidencia, no decidir si la marcación vale.

- Si se quiere mostrar una dirección, que la resuelva el backend y la devuelva
  en la respuesta de `register`. La app dejará de llamar a
  nominatim.openstreetmap.org con la ubicación del empleado (Fase 2) y, sin
  dirección del backend, mostrará «Ubicación registrada».

### 9. `register` no devuelve la hora de la marcación

La respuesta trae `attendanceLogId` pero no la hora. La app recarga las
marcaciones del día para mostrar la del servidor; sería más simple que devuelva
`logDateTime` en ISO con offset.
