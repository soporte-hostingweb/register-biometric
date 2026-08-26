import { Platform } from 'react-native';
import { API_URL, apiFetch } from './api';

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function supportsWebPush() {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getWebPushPermission() {
  if (!supportsWebPush()) return 'unsupported';
  return Notification.permission;
}

export async function subscribeToWebPush() {
  if (!supportsWebPush()) {
    throw new Error('Este navegador no admite Web Push o el sitio no usa HTTPS.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Debes permitir las notificaciones en el navegador.');
  }

  const registration = await navigator.serviceWorker.register('/push-sw.js');
  await navigator.serviceWorker.ready;

  const keyResponse = await fetch(`${API_URL}/api/push/public-key`, { credentials: 'include' });
  if (!keyResponse.ok) throw new Error('No se pudo obtener la clave de notificaciones.');
  const { publicKey } = await keyResponse.json();

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const response = await apiFetch('/api/push/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      appScope: 'ATTENDANCE',
    }),
  });

  if (!response.ok) throw new Error('El servidor no pudo registrar este navegador.');
}
