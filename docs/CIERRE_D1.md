# Cierre del Sprint D-1

> Estado al 30 de agosto de 2026, commit `66a1b7c`, rama
> `claude/happy-wright-91iz1v`. Producción: Supabase `cibpguwwggwzdhhpdomz`,
> migrations 0011 a 0026 aplicadas.

Este documento existe para que dentro de tres meses se pueda distinguir lo que
está **comprobado** de lo que está **escrito**. Cada línea de abajo se verificó
ejecutando, no leyendo código.

## Aceptación · las siete comprobaciones

Corridas en navegador contra el checkout de `66a1b7c` y el Supabase de
producción.

| # | Qué | Resultado |
|---|---|---|
| 1 | `/auditoria` → Verificar | **Íntegra · 1 evento recalculado.** `verificar_cadena` existe y el rol de la notaría la ejecuta |
| 2 | Paquete de verificación | JSON descargado, 755 bytes, con su evento. El panel dice «Sin anclaje externo todavía» |
| 3 | Cuatro pantallas a 390 px | **390 px de documento en las cuatro.** Barra lateral superpuesta, se cierra al tocar fuera y al navegar |
| 4 | Umbrales en `/operaciones` | Las seis filas lo dicen en TEXTO, no sólo por color |
| 5 | Cambiar el tipo de acto | Pregunta antes de borrar el expediente capturado |
| 6 | Alta del segundo factor | QR como imagen, sin el prefijo del data URI, con «Cerrar sesión» |
| 7 | Consola sin privilegio | «Su cuenta no tiene privilegio…», sin bucle de redirección |

## El anclaje, comprobado de punta a punta

La bitácora de la plataforma —eventos 1 a 32 354— está anclada en el **bloque
964750 de Bitcoin**, del 30 de agosto de 2026 a las 16:00:40 UTC.

```
$ ots info anclaje.ots
File sha256 hash: 61ab5aec00735d8719fb655417a3c8c8e234effd08fb927736aea77367cbf110
…
verify BitcoinBlockHeaderAttestation(964750)
```

El digest del archivo es exactamente la `raiz_merkle` de la tabla. El `.ots`
pasó de 687 a 2 474 bytes al recoger la prueba completa, y sigue siendo un
archivo válido después de la sustitución byte a byte.

`ots verify` pide un nodo de Bitcoin y en la máquina de pruebas no lo hay. Eso
**no es una carencia**: es lo que se buscaba. Si verificar dependiera de una
API de Ikán, se estaría pidiendo confiar justo en quien se quiere auditar.
Quien no tenga nodo compara la raíz del `.ots` contra el bloque en cualquier
explorador, sin intervención nuestra.

## Lo que se cazó durante la aceptación

Ninguno de estos se habría visto leyendo el código:

- **El QR no servía.** `qr_code` de Supabase es un data URI, no SVG suelto:
  inyectarlo como HTML dejaba `data:image/svg+xml;utf-8,` impreso encima.
- **El alta de 2FA se colgaba para siempre** en «Preparando el código…». Un
  guardia contra el doble montaje y una bandera de limpieza se peleaban y
  descartaban el `enroll` en vuelo. En la única pantalla de la que no se puede
  salir.
- **La app no cabía en un teléfono.** 1144 px de documento con viewport de 390.
  No eran las tablas: la barra lateral era una columna fija de 260 px y el
  botón para plegarla estaba en las props desde el andamiaje **sin conectar**.
- **El selector de rol tapaba el botón de menú.** Con «Operando como» y
  «Oficial de Cumplimiento» dentro medía más de media pantalla.
- **Dos bucles de redirección** en la consola de plataforma: uno que introduje
  con el guardia de 2FA, y otro que ya estaba desde antes.
- **El cron no habría anclado nunca.** Mandaba `motivo: 'cron'`, que la tabla
  no admite: respuesta 200 y cero anclajes, todas las noches, en silencio.
- **`deBytea` usada y nunca definida** en la Edge Function, desplegada sin que
  ningún compilador la hubiera mirado. De ahí `tsconfig.functions.json`.

## Lo que quedó dicho con precisión, y no de más

Tres pantallas afirmaban cosas que el sistema no sostiene:

- `/verificacion` enseñaba cuatro verificaciones inventadas con nombres,
  scores y veredictos «Aprobado» y «Rechazado», sin una sola marca de que
  fueran de mentira.
- El contador de la campana salía en **3 fijo**.
- «La bitácora encadenada es inmutable» afirmaba más de lo que se sostiene:
  quien tenga acceso de administrador a la base sí puede escribir. Lo que sí
  se sostiene —y es lo que importa— es que **se detecta**.

Y `mfa_habilitado` decía `true` fijo cuando no existía ni la pantalla para dar
de alta el segundo factor.

## Decisiones abiertas · no son de Code

1. **Tipografía.** El Brandbook v2.1 §06 exige **Sora**; `CLAUDE.md` decía que
   Plus Jakarta Sans la sustituye. Uno de los dos está desactualizado. Mientras
   tanto la familia va **empaquetada** con `@fontsource` —el nivel 3 de entrega
   es on-prem y no puede depender del CDN de Google—, así que cambiarla son los
   `@import` de `src/index.css`, `--font-sans` y `tailwind.config.ts`.
2. **El rojo funcional `#B32B21`.** El brandbook no define uno y un producto de
   cumplimiento necesita distinguir «esto está roto» de «esto necesita tu
   atención». Queda PROPUESTO; hasta que Dirección lo apruebe se usa el
   `--destructive` actual y no se lleva a piezas comerciales.
3. **`AdminUsuariosPage` con reposición del segundo factor.** Hoy la pantalla
   de 2FA dice lo que es cierto —escribir a Kawiil— en vez de prometer una
   consola que no existe. Construirla es lo correcto a mediano plazo.

## Lo que sigue (D-2)

- Pantalla de prospectos sobre `prospect_intake`. Hoy quien llena el formulario
  del sitio **entra y nadie lo ve nunca**: la tabla tiene RLS con cero
  políticas a propósito, así que hace falta una de lectura para
  `platform_admin`.
- Consola de plataforma para cargar catálogos y listas sin SQL.
- Las dos secciones de reglas de `RulesEnginePage`, maqueta declarada con
  banner ámbar.
- `tiene_ots` como columna generada, para no traerse los bytes de la prueba
  sólo para pintar una lista.
