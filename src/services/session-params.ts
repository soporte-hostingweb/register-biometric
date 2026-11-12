import { router } from 'expo-router';

// Las pantallas reciben al usuario por parámetros de ruta (así lo hace el login).
export type SessionParams = { fullName?: string; rol?: string; email?: string };

export type AppTab = 'inicio' | 'historial' | 'perfil' | 'configuracion';

const RUTAS: Record<AppTab, string> = {
  inicio: '/dashboard',
  historial: '/historial',
  perfil: '/perfil',
  configuracion: '/configuracion',
};

export const isAdminRole = (rol?: string) => ['ADMIN', 'SUPER_ADMIN'].includes(String(rol || '').toUpperCase());
export const isSuperAdminRole = (rol?: string) => String(rol || '').toUpperCase() === 'SUPER_ADMIN';

/** Cambia de pestaña sin apilar pantallas (el botón atrás no recorre pestañas). */
export function goToTab(tab: AppTab, params: SessionParams) {
  router.replace({ pathname: RUTAS[tab] as any, params: { fullName: params.fullName, rol: params.rol, email: params.email } });
}

/** Abre una pantalla secundaria (solicitudes, asistencia general) encima de la actual. */
export function openScreen(pathname: '/permisos' | '/asistencia-general' | '/mis-vacaciones', params: SessionParams) {
  router.push({ pathname: pathname as any, params: { fullName: params.fullName, rol: params.rol, email: params.email } });
}
