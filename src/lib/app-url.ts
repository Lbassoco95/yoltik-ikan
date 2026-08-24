/**
 * URL base de la app, usada para construir los `redirectTo` que Supabase Auth
 * incrusta en los correos (p. ej. el enlace de recuperación de contraseña).
 *
 * Orden de resolución:
 *  1. `VITE_APP_URL` — para forzar el dominio de producción desde Vercel.
 *  2. `window.location.origin` — funciona solo en el navegador (dev y prod).
 *  3. Dominio de producción como último recurso (SSR/tests sin `window`).
 *
 * Cualquier origen que se use aquí debe estar dado de alta en Supabase
 * (Authentication → URL Configuration → Redirect URLs), si no el enlace del
 * correo cae al Site URL por defecto.
 */
const PROD_URL = 'https://yoltik-regtech-hub.vercel.app';

export function appBaseUrl(): string {
  const configured = import.meta.env.VITE_APP_URL as string | undefined;
  if (configured) return configured.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return PROD_URL;
}

/** URL completa a la que Supabase debe regresar tras el correo de recuperación. */
export function passwordResetRedirectUrl(): string {
  return `${appBaseUrl()}/restablecer`;
}
