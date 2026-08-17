import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_TOKEN_KEY = '@asistencia_access_token';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://gestor.hwperu.com').replace(/\/$/, '');

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
    await clearAccessToken();
    return null;
  }

  const data = await response.json();
  if (!data.token) return null;

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

  if (response.status !== 401 || path.startsWith('/api/auth/')) {
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
    await clearAccessToken();
  }
}
