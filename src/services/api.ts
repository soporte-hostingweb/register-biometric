import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_TOKEN_KEY = '@asistencia_access_token';
const SESSION_STARTED_AT_KEY = '@asistencia_session_started_at';
const SESSION_EXPIRES_AT_KEY = '@asistencia_session_expires_at';
const SESSION_USER_KEY = '@asistencia_session_user';

export const SESSION_TTL_MS = 26 * 60 * 60 * 1000;

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
  if (!session.sessionExpiresAt || session.sessionExpiresAt <= Date.now()) {
    await clearAuthSession();
    return { user: null };
  }

  if (!session.accessToken) {
    const refreshedToken = await refreshAccessToken();
    if (!refreshedToken) return { user: null };
    return { user: buildSessionUserFromToken(refreshedToken, session.user) };
  }

  if (isJwtExpired(session.accessToken)) {
    const refreshedToken = await refreshAccessToken();
    if (!refreshedToken) return { user: null };
    return { user: buildSessionUserFromToken(refreshedToken, session.user) };
  }

  return { user: buildSessionUserFromToken(session.accessToken, session.user) };
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

async function refreshAccessToken() {
  const response = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    await clearAuthSession();
    return null;
  }

  const data = await response.json();
  if (!data.token) {
    await clearAuthSession();
    return null;
  }

  await saveAccessToken(data.token);
  return data.token as string;
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

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) return response;

  headers.set('Authorization', `Bearer ${refreshedToken}`);
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
