# Recuperación de contraseña — flujo y configuración

Flujo estándar de Supabase Auth, en dos pantallas públicas (sin `<ProtectedRoute>`).

## Rutas

| Ruta            | Página                                        | Qué hace |
|-----------------|-----------------------------------------------|----------|
| `/login`        | `src/pages/auth/Login.tsx`                    | Link "¿Olvidaste tu contraseña?" → `/recuperar` |
| `/recuperar`    | `src/pages/auth/RecuperarPassword.tsx`        | Pide el correo y llama `supabase.auth.resetPasswordForEmail(email, { redirectTo })` |
| `/restablecer`  | `src/pages/auth/RestablecerPassword.tsx`      | Destino del correo. Canjea el token, pide TOTP si hace falta, y llama `supabase.auth.updateUser({ password })` |

El `redirectTo` se arma en `src/lib/app-url.ts`:
`VITE_APP_URL` → si no está, `window.location.origin` → si no hay `window`,
`https://yoltik-regtech-hub.vercel.app`.

## Detalles del comportamiento

- **No hay enumeración de usuarios.** `/recuperar` muestra siempre el mismo acuse
  ("si el correo corresponde a una cuenta activa…"); solo se muestra error si
  falla el transporte o la configuración.
- **Segundo factor.** Ikán exige TOTP. Si la sesión de recuperación queda en
  `aal1` y el usuario ya tiene factor inscrito
  (`mfa.getAuthenticatorAssuranceLevel()` devuelve `nextLevel: 'aal2'`),
  `/restablecer` pide el código antes de permitir el cambio.
- **Enlace caducado o abierto en frío.** `/restablecer` lee `error_description`
  del hash/query y, si no hay sesión, ofrece solicitar un enlace nuevo.
- **Cierre de sesión al terminar.** Tras `updateUser` se hace `signOut()`: el
  reingreso pasa por credenciales + TOTP como cualquier otro acceso.
- **Largo mínimo de contraseña**: 8 caracteres del lado del cliente
  (`LARGO_MINIMO`). La política real la aplica Supabase; ver el `TODO[Sprint D-2]`
  en `RestablecerPassword.tsx` si se endurece.

## Configuración requerida en el dashboard de Supabase

Proyecto `cibpguwwggwzdhhpdomz` → **Authentication → URL Configuration**:

- **Site URL**: `https://yoltik-regtech-hub.vercel.app`
- **Redirect URLs** (deben incluir el destino exacto, si no el enlace del correo
  cae al Site URL y el token no llega a la pantalla):
  - `https://yoltik-regtech-hub.vercel.app/restablecer`
  - `http://localhost:8080/restablecer`
  - opcional para previews de Vercel: `https://*-yoltik.vercel.app/restablecer`

**Authentication → Emails → Reset Password**: plantilla activa. Para el demo
sirve la plantilla por defecto de Supabase; su cuerpo usa
`{{ .ConfirmationURL }}`, que ya resuelve al `redirectTo` que manda el front.

Los mismos valores están espejados en `supabase/config.toml`
(`[auth] additional_redirect_urls`) para `supabase start` local.

## Prueba de punta a punta

1. `/login` → "¿Olvidaste tu contraseña?".
2. Capturar el correo de una cuenta real de FIATCOIN → "Enviar enlace".
3. Abrir el enlace del correo → debe caer en `/restablecer` del dominio correcto.
4. Si pide TOTP, capturar el código de la app de autenticación.
5. Definir la contraseña nueva → acuse → `/login` → entrar con la nueva
   contraseña + TOTP.
