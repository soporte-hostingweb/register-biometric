import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_TOKEN_KEY = '@asistencia_access_token';
const SESSION_STARTED_AT_KEY = '@asistencia_session_started_at';
const SESSION_EXPIRES_AT_KEY = '@asistencia_session_expires_at';
const SESSION_USER_KEY = '@asistencia_session_user';

// Debe coincidir con SESSION_TTL_MS de backend/utils/authTokens.js. El refresh token
// y su cookie caducan 25 horas despues del login y la renovacion NO los extiende, asi
// que si la app creyera que duran mas, esa ultima hora daria un cierre por sorpresa.
export const SESSION_TTL_MS = 25 * 60 * 60 * 1000;

export type AuthSessionUser = {
  email: string;
  fullName: string;
  rol: string;
};

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://gestor.hwperu.com').replace(/\/$/, '');

type StoredSession = {
  accessToken: string | null;
  sessionStartedAt: number | null;
  sessionExpiresAt: number | null;
  user: AuthSessionUser | null;
};

function parseStoredNumber(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStoredSessionUser(raw: string | null): AuthSessionUser | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.email === 'string' &&
      typeof parsed.fullName === 'string' &&
      typeof parsed.rol === 'string'
    ) {
      return {
        email: parsed.email,
        fullName: parsed.fullName,
        rol: parsed.rol,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function decodeJwtPayload(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadBase64 = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    return JSON.parse(atob(payloadBase64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildSessionUserFromToken(token: string, fallback: AuthSessionUser | null): AuthSessionUser | null {
  const parsed = decodeJwtPayload(token);
  const email = (fallback?.email || (typeof parsed?.email === 'string' ? parsed.email : '')).trim();
  const fullName = (fallback?.fullName || '').trim();
  const rol = (fallback?.rol || (typeof parsed?.role === 'string' ? parsed.role : '')).trim();
  if (!email || !rol) return null;
  return { email, fullName, rol };
}

function isJwtExpired(token: string) {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== 'number') {
    return true;
  }
  return exp * 1000 <= Date.now();
}

export async function getStoredSession(): Promise<StoredSession> {
  const entries = await AsyncStorage.multiGet([
    ACCESS_TOKEN_KEY,
    SESSION_STARTED_AT_KEY,
    SESSION_EXPIRES_AT_KEY,
    SESSION_USER_KEY,
  ]);

  const asMap = Object.fromEntries(entries.map(([key, value]) => [key, value])) as Record<string, string | null>;
  const user = parseStoredSessionUser(asMap[SESSION_USER_KEY]);

  return {
    accessToken: asMap[ACCESS_TOKEN_KEY],
    sessionStartedAt: parseStoredNumber(asMap[SESSION_STARTED_AT_KEY]),
    sessionExpiresAt: parseStoredNumber(asMap[SESSION_EXPIRES_AT_KEY]),
    user,
  };
}

export async function saveLoginSession(user: AuthSessionUser, token: string) {
  const sessionStartedAt = Date.now();
  const sessionExpiresAt = sessionStartedAt + SESSION_TTL_MS;
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, token],
    [SESSION_STARTED_AT_KEY, String(sessionStartedAt)],
    [SESSION_EXPIRES_AT_KEY, String(sessionExpiresAt)],
    [SESSION_USER_KEY, JSON.stringify(user)],
  ]);
}

export async function clearAuthSession() {
  await AsyncStorage.multiRemove([
    ACCESS_TOKEN_KEY,
    SESSION_STARTED_AT_KEY,
    SESSION_EXPIRES_AT_KEY,
    SESSION_USER_KEY,
  ]);
}

export async function restoreSession(): Promise<{ user: AuthSessionUser | null }> {
  const session = await getStoredSession();

  // Las 25 horas son absolutas y se miden en el dispositivo. Pasado ese plazo toca
  // teclear correo y contrasena otra vez, sin preguntarle nada al servidor.
  if (!session.sessionExpiresAt || session.sessionExpiresAt <= Date.now()) {
    await clearAuthSession();
    return { user: null };
  }

  if (session.accessToken && !isJwtExpired(session.accessToken)) {
    return { user: buildSessionUserFromToken(session.accessToken, session.user) };
  }

  const refreshed = await refreshAccessToken();
  if (refreshed.status === 'ok') {
    return { user: buildSessionUserFromToken(refreshed.token, session.user) };
  }
  if (refreshed.status === 'rejected') return { user: null };

  // Sin respuesta y dentro de las 25 horas se entra con los datos guardados. apiFetch
  // reintentara la renovacion en cuanto vuelva la senal, y si la sesion hubiera muerto
  // de verdad cada pantalla lo dira con su propio mensaje de error.
  return { user: session.user };
}

export async function saveAccessToken(token: string) {
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export async function clearAccessToken() {
  await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
}

async function getAccessToken() {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

// Renovar falla por dos motivos que exigen reacciones opuestas: que el servidor rechace
// la sesion (hay que volver a entrar) o que no haya respuesta (la sesion sigue viva, y
// borrarla obligaria a teclear la contrasena solo por un corte de red).
type RefreshOutcome =
  | { status: 'ok'; token: string }
  | { status: 'rejected' }
  | { status: 'unavailable' };

async function refreshAccessToken(): Promise<RefreshOutcome> {
  const currentToken = await getAccessToken();
  const headers = new Headers();
  // El backend reemite a partir del access token vencido, de modo que la renovacion no
  // dependa en exclusiva de que la cookie hwperu_refresh haya sobrevivido.
  if (currentToken) headers.set('Authorization', `Bearer ${currentToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers,
    });
  } catch {
    return { status: 'unavailable' };
  }

  // Solo un rechazo explicito invalida la sesion guardada: contrasena cambiada, usuario
  // desactivado o sesion revocada. Un 500 o un 502 del backend no significan eso.
  if (response.status === 401 || response.status === 403) {
    await clearAuthSession();
    return { status: 'rejected' };
  }

  if (!response.ok) return { status: 'unavailable' };

  const data = await response.json().catch(() => null);
  if (!data?.token) return { status: 'unavailable' };

  await saveAccessToken(data.token);
  return { status: 'ok', token: data.token as string };
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  // Solo la propia renovación debe evitar otro intento para no crear un bucle.
  // Otras rutas bajo /api/auth, como /api/auth/profile, sí necesitan renovar
  // automáticamente cuando el access token haya vencido.
  if (response.status !== 401 || path === '/api/auth/refresh') {
    return response;
  }

  const refreshed = await refreshAccessToken();
  if (refreshed.status !== 'ok') return response;

  headers.set('Authorization', `Bearer ${refreshed.token}`);
  response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  return response;
}

export async function logoutFromApi() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    await clearAuthSession();
  }
}
