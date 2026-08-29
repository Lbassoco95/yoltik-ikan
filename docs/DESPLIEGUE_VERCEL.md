# Despliegue: dos proyectos de Vercel, un repositorio

## Por qué dos proyectos

Ikán son dos aplicaciones con públicos distintos:

| | Quién entra | Qué es |
|---|---|---|
| **App de clientes** | Notarías, exchanges, cualquier sujeto obligado | Captura de comparecientes, actos, bandeja del OC |
| **Consola de plataforma** | Sólo Kawiil | Listas restrictivas, parámetros regulatorios |

Separarlas da tres cosas concretas: despliegues independientes (un error en la
consola no tumba la app de clientes), dominios distintos (un notario nunca se
topa con URLs internas) y accesos separados en Vercel.

**Lo que NO da: seguridad.** La frontera real es la RLS más `platform_admin`
(migration 0008), y ésa ya existe. Un dominio distinto no protege datos; las
políticas sí. Si alguien apuntara la app de clientes contra las tablas de la
consola, la base se lo negaría igual. La separación es operativa, no defensiva.

## Cómo funciona

Un solo repositorio y un solo código. La variable **`VITE_APP_TARGET`**, fijada
en tiempo de **build**, decide qué aplicación se compila:

```
VITE_APP_TARGET=app     →  src/App.tsx       (o sin definir)
VITE_APP_TARGET=admin   →  src/AdminApp.tsx
```

`src/main.tsx` monta una u otra con un `import()` dinámico. Como Vite sustituye
la variable por un literal al compilar, la condición se resuelve estáticamente y
Rollup **descarta la rama que no aplica**.

Verificado sobre los artefactos reales, no por diseño:

| Build | Chunk de aplicación | Contiene código del otro |
|---|---|---|
| `VITE_APP_TARGET=app` | `App-*.js` · 1,108 KB | No |
| `VITE_APP_TARGET=admin` | `AdminApp-*.js` · 493 KB | No |

La consola pesa menos de la mitad, y ninguno de los dos bundles lleva las
cadenas del otro.

## Configurar el proyecto de la consola

En Vercel → **Add New → Project** → importar **el mismo repositorio**
`Lbassoco95/yoltik-ikan`.

- **Project Name**: `ikan-admin` (o el que prefieras).
- **Framework Preset**: Vite. **Root Directory**: `./` — igual que el otro.
- **Build Command** y **Output Directory**: los de siempre (`npm run build`,
  `dist`). No hay que cambiarlos.

### Variables de entorno

Márcalas para **Production y Preview**. Es el error más común: si sólo van en
Production, el preview levanta pero no conecta a Supabase, y parece que la app
está rota cuando lo que falta es la variable.

| Variable | Proyecto de la consola | Proyecto de clientes |
|---|---|---|
| `VITE_APP_TARGET` | `admin` | `app` |
| `VITE_SUPABASE_URL` | igual en ambos | igual en ambos |
| `VITE_SUPABASE_ANON_KEY` | igual en ambos | igual en ambos |
| `VITE_APP_URL` | el dominio de la consola | el dominio de clientes |

`VITE_APP_TARGET` es la única que cambia el comportamiento. Conviene ponerla
**explícita en los dos** proyectos: sin definir toma el valor de la app de
clientes, pero dejarlo implícito hace que el día que alguien revise la
configuración no sepa si fue decisión u olvido.

### Dominio

Vercel → Settings → Domains. Por ejemplo `admin.yoltik.mx` para la consola,
dejando el dominio actual para la app de clientes.

## Dar de alta el dominio en Supabase

**Sin este paso la recuperación de contraseña de la consola se rompe.**

`VITE_APP_URL` construye el `redirectTo` que Supabase incrusta en el correo de
recuperación (`src/lib/app-url.ts`). Si el origen no está registrado, el enlace
cae al Site URL por defecto y manda al usuario a la app equivocada.

Supabase → **Authentication → URL Configuration → Redirect URLs**, agregar:

```
https://<dominio-de-la-consola>/restablecer
https://<dominio-de-la-consola>/**
```

## Quién puede entrar

La consola exige `platform_admin` (migration 0008). Un usuario válido de
Supabase que no esté en esa tabla llega al login, entra, y la consola lo saca:
el privilegio es global y cruza organizaciones, no es un rol de organización.

Para otorgarlo: `supabase/manual/bootstrap_platform_admin.sql`.

## Notas operativas

- **Ambos proyectos despliegan del mismo repositorio.** Cada push a `main`
  dispara los dos builds. Es lo esperado; si molesta, Vercel tiene «Ignored
  Build Step» para saltarse el build cuando no cambió nada relevante.
- **`vercel.json` ya trae el rewrite de SPA** (`/(.*) → /index.html`), así que
  los enlaces directos funcionan en los dos proyectos sin configuración extra.
- **Las sesiones no se comparten entre dominios.** Supabase guarda la sesión en
  el almacenamiento del navegador, que es por origen: iniciar sesión en la
  consola no inicia sesión en la app de clientes. Es lo correcto.

## Rutas

**App de clientes** — `/`, `/clientes`, `/operaciones`, `/alertas`, `/reportes`,
`/listas`, `/reglas`, `/matriz`, `/auditoria`, `/configuracion`, más las
públicas `/login`, `/registro`, `/registro/notarios`, `/recuperar`.

**Consola** — `/` (redirige a `/listas`), `/listas`, `/parametros`, más `/login`,
`/recuperar` y `/restablecer`.

Nótese que la consola **no** usa el prefijo `/admin`: al vivir en su propio
dominio, la ruta raíz ya es la consola.
