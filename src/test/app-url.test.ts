import { afterEach, describe, expect, it, vi } from 'vitest';
import { appBaseUrl, passwordResetRedirectUrl } from '@/lib/app-url';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('appBaseUrl', () => {
  it('usa VITE_APP_URL cuando está definida', () => {
    vi.stubEnv('VITE_APP_URL', 'https://yoltik-regtech-hub.vercel.app');
    expect(appBaseUrl()).toBe('https://yoltik-regtech-hub.vercel.app');
  });

  it('recorta las diagonales finales de VITE_APP_URL', () => {
    vi.stubEnv('VITE_APP_URL', 'https://yoltik-regtech-hub.vercel.app/');
    expect(appBaseUrl()).toBe('https://yoltik-regtech-hub.vercel.app');
  });

  it('cae a window.location.origin sin VITE_APP_URL', () => {
    vi.stubEnv('VITE_APP_URL', '');
    expect(appBaseUrl()).toBe(window.location.origin);
  });
});

describe('passwordResetRedirectUrl', () => {
  it('apunta a /restablecer', () => {
    vi.stubEnv('VITE_APP_URL', 'https://yoltik-regtech-hub.vercel.app');
    expect(passwordResetRedirectUrl()).toBe('https://yoltik-regtech-hub.vercel.app/restablecer');
  });
});
