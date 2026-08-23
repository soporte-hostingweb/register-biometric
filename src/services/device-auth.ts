import { API_URL } from './api';

function base64urlToBytes(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = window.atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64url(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function ensureWebAuthnSupport() {
  if (typeof window === 'undefined' || !window.isSecureContext || !('PublicKeyCredential' in window)) {
    throw new Error('Esta computadora o navegador no admite la autorizaciÃ³n segura requerida.');
  }
}

async function postVerification(path: string, deviceFlowToken: string, credential: object) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ deviceFlowToken, credential }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Esta computadora no estÃ¡ autorizada.');
  return data;
}

async function registerComputer(flow: any) {
  const options = flow.options;
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...options,
    challenge: base64urlToBytes(options.challenge),
    user: { ...options.user, id: base64urlToBytes(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map((credential: any) => ({
      ...credential,
      id: base64urlToBytes(credential.id),
    })),
  };
  const result = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!result) throw new Error('No se pudo registrar esta computadora.');
  const response = result.response as AuthenticatorAttestationResponse;
  const credential = {
    id: result.id,
    rawId: bytesToBase64url(result.rawId),
    type: result.type,
    response: {
      clientDataJSON: bytesToBase64url(response.clientDataJSON),
      attestationObject: bytesToBase64url(response.attestationObject),
      transports: typeof response.getTransports === 'function' ? response.getTransports() : [],
    },
    clientExtensionResults: result.getClientExtensionResults(),
    authenticatorAttachment: result.authenticatorAttachment,
  };
  return postVerification('/api/device/register/verify', flow.deviceFlowToken, credential);
}

export async function createDeviceAuthenticationCredential(options: any) {
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...options,
    challenge: base64urlToBytes(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((credential: any) => ({
      ...credential,
      id: base64urlToBytes(credential.id),
    })),
  };
  const result = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!result) throw new Error('Esta computadora no estÃ¡ autorizada.');
  const response = result.response as AuthenticatorAssertionResponse;
  const credential = {
    id: result.id,
    rawId: bytesToBase64url(result.rawId),
    type: result.type,
    response: {
      clientDataJSON: bytesToBase64url(response.clientDataJSON),
      authenticatorData: bytesToBase64url(response.authenticatorData),
      signature: bytesToBase64url(response.signature),
      userHandle: response.userHandle ? bytesToBase64url(response.userHandle) : undefined,
    },
    clientExtensionResults: result.getClientExtensionResults(),
    authenticatorAttachment: result.authenticatorAttachment,
  };
  return credential;
}

async function authenticateComputer(flow: any) {
  const credential = await createDeviceAuthenticationCredential(flow.options);
  return postVerification('/api/device/authenticate/verify', flow.deviceFlowToken, credential);
}

export async function completeDeviceAuthorization(loginResponse: any) {
  ensureWebAuthnSupport();
  if (loginResponse.deviceRegistrationRequired) return registerComputer(loginResponse);
  if (loginResponse.deviceAuthenticationRequired) return authenticateComputer(loginResponse);
  return loginResponse;
}
