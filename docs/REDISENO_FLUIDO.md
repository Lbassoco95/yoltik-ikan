# Rediseño ESTELA fluida

Rama: `rediseno/estela-fluida`. Punto de regreso: etiqueta `pre-rediseno-fluido` (commit `d273256` de `main`).

El rediseño cambia la forma, no la función. No se tocaron `supabase/`, `scripts/`, `src/lib/`, `src/hooks/`, `src/types/` ni `src/test/`. No se añadieron dependencias, CDN ni llamadas externas. No se cambiaron textos de usuario, rutas, consultas, permisos ni flujos de acceso y MFA. Los tokens semánticos (`--primary`, `--accent`, `--destructive`, `--warning`, `--success`) conservan su valor.

## Qué cambió por archivo

### Marca
- `public/marca/`: se añadieron `ikan-palabra.png`, `ikan-palabra-blanco.png`, `ikan-vertical.png`, `ikan-vertical-claro.png`, `yoltik.png`, `yoltik-blanco.png`, `yoltik-vertical.png` y `yoltik-vertical-claro.png`. Los iconos existentes se conservan.
- `public/marca/README.md`: documenta cada archivo y su fondo (claro u oscuro).

### Estilos
- `src/estela-fluido.css` (nuevo): vidrio, fondo fluido, ola bajo el título, canto de ola del cartucho, flotación, `.estela-aviso` (vidrio con respaldo sin `backdrop-filter`), `.estela-velo` (velo de lectura del área de trabajo), `.fondo-fluido--quieto`, contraste contextual, foco sobre navy, movimiento reducido, pantallas pequeñas e impresión.
- `src/index.css`: importa la capa anterior, retira `--radius: 0.375rem` y la greca, describe ESTELA fluida en el encabezado, aplica Sora y JetBrains Mono empaquetadas con `@fontsource` y añade reglas de impresión.
- `tailwind.config.ts`: radios `sm`, `md`, `lg`, `xl`; sombras `vidrio`, `suave`, `placa-acceso`; colores `ola`. Los colores `ikan.*` y semánticos no cambian.

### Componentes de `src/components/estela/`
- `FondoFluido.tsx` (nuevo) y `index.ts`: exporta el fondo; el comentario del índice describe la ola y el vidrio.
- `Cartucho.tsx`: vidrio, radio 20 px, canto de ola; antetítulo ámbar sólo con `acento="ambar"` (`#7a4f00` en claro, ámbar de marca en oscuro). Conserva `fundamento`.
- `SelloVigencia.tsx`: degradado jade a jade oscuro, anillo punteado mint, giro de -6 grados, giro lento apagado con movimiento reducido. Conserva `role="img"` y `aria-label`.
- `BitacoraLinea.tsx`: hash en píldora jade oscuro con texto blanco y separador de vidrio.
- `EncabezadoSeccion.tsx`: contenedor de vidrio; el H1 conserva `estela-titulo`.
- `EstadoVacio.tsx`: vidrio e icono con flotación suave.
- `MarcaIkan.tsx`: icono y palabra en PNG oficiales según el tono, con texto accesible. API sin cambios.
- `EndosoYoltik.tsx`: `yoltik.png` en claro, `yoltik-blanco.png` en navy u oscuro, respaldo tipográfico. Se retiró el `TODO[Sprint D-2]`.
- `FirmaCelula.tsx`: vidrio navy, halos mint, botón jade oscuro. Sigue sin dibujar nada si no hay célula.
- `PlacaAcceso.tsx`: placa de vidrio `rounded-xl` y `shadow-placa-acceso` sobre `<FondoFluido vivo />`, icono en chip blanco de 84 px, palabra blanca y endoso blanco.

### Marco
- `AppLayout.tsx`: fondo fluido quieto detrás, contenido en `z-10`, `<main>` con velo de lectura.
- `AdminLayout.tsx`: fondo fluido quieto, cabecera en vidrio navy, `<main>` en vidrio.
- `AppHeader.tsx`: vidrio.
- `AppSidebar.tsx`: vidrio navy, activo en jade oscuro, icono en chip blanco 40x40, endoso al pie. Respeta la barra plegada.

### Primitivos shadcn
- `button.tsx`: píldora; la variante principal usa jade oscuro con texto blanco (el blanco de 14 px sobre jade de marca no llega a 4.5:1); `outline` translúcida.
- `card.tsx`: clase de vidrio.
- `badge.tsx`: píldora y sin salto de línea.
- `input.tsx`, `textarea.tsx`, `select.tsx`: radio 12 px.
- `dialog.tsx`: radio de tarjeta; conserva el fondo `bg-card` opaco para que el diálogo se lea sobre cualquier pantalla.
- `table`, `tabs`, `sheet`, `dropdown-menu`, `popover`: heredan el radio por variables; no hizo falta tocarlos.

### Páginas
- Acceso: `AltaSegundoFactor.tsx` migró a `PlacaAcceso` sin tocar su lógica. `Login`, `RecuperarPassword` y `RestablecerPassword` ya lo usaban.
- `DashboardPage`, `ClientsPage`, `OperationsPage`, `AlertsPage`, `ReportsPage`, `ListsPage`, `RulesEnginePage`, `AuditPage`, `ConfigPage`, `MatrizRiesgoPage`, `NotFound`, `registro/*` y `admin/*`: superficies opacas (`bg-card`, `bg-white`, `bg-muted`) pasan a vidrio o a `.estela-aviso`; texto ámbar legible en claro; tablas dentro de su tarjeta.
- Componentes de apoyo (`AvisoDemostracion`, `admin/*`, `clientes/*`, `hallazgos/ExpedienteHallazgoDialog`): mismos ajustes de superficie.

## Decisiones propias (el prompt no decía nada)
- Sora reemplaza a Plus Jakarta Sans en toda la aplicación, como pide el rediseño. `CLAUDE.md` todavía la marca como pendiente de Dirección; no se editó porque está fuera de lo permitido.
- Se subió la opacidad del vidrio: 0.72 en claro y 0.66 en oscuro (el paquete traía 0.58 y 0.5). Con la opacidad original varios textos secundarios no llegaban a 4.5:1.
- Se añadió `.estela-velo`, un velo translúcido bajo todo el contenido de trabajo. Garantiza que ningún texto quede directo sobre el fondo fluido aunque una página tenga títulos sueltos.
- El contraste se corrige con reglas de contexto: dentro de superficies de vidrio, `text-muted-foreground`, `text-accent` y `text-warning-ink` se oscurecen en claro y se aclaran en oscuro. Los tokens globales no cambian.
- Las etiquetas (`Badge`) no se parten en dos renglones dentro de tablas.
- Foco: anillo blanco de 2 px sobre la barra navy; sobre vidrio se conserva el anillo del sistema.

## Pendientes
- Las capturas se tomaron con un Supabase simulado y datos sintéticos (no hay credenciales en este entorno). Algunas vistas no simuladas salen vacías: hallazgos, evaluación de riesgo, bitácora encadenada, anclaje, prospectos y cargas de listas. Conviene revisarlas con sesión real en la vista previa.
- Ningún texto de usuario se cambió ni se marcó para cambio.

## Verificación automática
- `npm run lint`: pasa.
- `npx tsc --noEmit`: pasa.
- `npm run typecheck`: pasa.
- `npm run test`: 46 archivos, 906 pruebas, todas pasan. No se modificó ninguna.
- `npm run build`: pasa.

## Contraste
Comprobación propia con Playwright: se mide cada texto visible contra el color real del píxel detrás (vidrio incluido), en claro y oscuro. Mínimos: 4.5:1 texto de cuerpo, 3:1 texto grande.
- Capturas principales (16): cero fallas.
- Pantallas adicionales (26): dos marcas, ambas falsos positivos del muestreo (el píxel tomado como fondo cae sobre la propia letra, con contraste 1.0): «Actividades vulnerables» en configuración clara y el título del registro en oscuro. Se revisaron a ojo y se leen bien.
- Foco con teclado: visible sobre vidrio y sobre la barra navy (anillo blanco de 2 px).
- Movimiento reducido: con `prefers-reduced-motion: reduce` hay 0 animaciones y 0 px de desplazamiento, también en el acceso con fondo vivo. Sin la preferencia, el acceso anima (17 animaciones, 78 px en 1.5 s).
- Impresión: el fondo fluido no se imprime; vidrio y velo pasan a blanco sin sombra ni desenfoque.

## Rendimiento
Medición con Playwright en Chromium sin GPU, desplazando tablas de 240 clientes y 320 operaciones.

| Pantalla | Fondo animado | Fondo quieto | Sin fondo |
| --- | --- | --- | --- |
| Clientes | 7 cps, p95 167 ms | 7 cps, p95 150 ms | 10 cps, p95 133 ms |
| Operaciones | 4 cps, p95 650 ms | 7 cps, p95 200 ms | 11 cps, p95 117 ms |

La animación bajaba visiblemente el desplazamiento en operaciones. Por eso las pantallas de trabajo (`AppLayout` y `AdminLayout`) usan `fondo-fluido--quieto`: las manchas se quedan, pero no se mueven. El acceso y las pantallas de contraseña conservan el fondo vivo. Las cifras absolutas son bajas por el render por software; lo que importa es la comparación.

## Capturas
En `docs/rediseno-capturas/`:
- `acceso-claro.png`, `acceso-oscuro.png`
- `recuperar-contrasena-claro.png`, `recuperar-contrasena-oscuro.png`
- `inicio-claro.png`, `inicio-oscuro.png`
- `clientes-claro.png`, `clientes-oscuro.png`
- `operaciones-claro.png`, `operaciones-oscuro.png`
- `matriz-riesgo-claro.png`, `matriz-riesgo-oscuro.png`
- `bitacora-claro.png`, `bitacora-oscuro.png`
- `admin-listas-claro.png`, `admin-listas-oscuro.png`

Todos los datos que aparecen son sintéticos.

## Vista previa en Vercel
Vercel generó la vista previa de la rama (commit `43bb562`):
- Aplicación: https://yoltik-regtech-85uegbold-leopoldo-bassoco-novas-projects.vercel.app
- Consola de administración: https://yoltik-ikan-admin-f7o56eizt-leopoldo-bassoco-novas-projects.vercel.app

Cada push a la rama genera una vista previa nueva; la más reciente aparece en el estado del último commit en GitHub.
