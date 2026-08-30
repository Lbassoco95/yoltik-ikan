# El expediente del acto — qué se captura y cuándo

> Bloque RCG0.B3f. Migration `0019_expediente_del_acto.sql`.
> Fuente normativa: instructivo del layout de fe pública del SPPLD
> (`docs/layouts-sat/instructivo_fep_campos.csv`, 518 campos).

## El problema

El aviso mensual se arma el mes siguiente al acto. El notario captura el día que
firma. Entre una cosa y otra hay semanas y decenas de instrumentos.

Hasta antes de este bloque, el alta de un acto guardaba compareciente, monto,
tipo de acto y país. El aviso pide bastante más: número de instrumento público,
fecha del acto, y la persona que solicita la formalización con **nombre y
apellidos por separado**, fecha de nacimiento, RFC y CURP. Nada de eso se
guardaba. El día 17 el notario tendría que volver al protocolo a buscar dato por
dato — y para entonces el compareciente ya no está enfrente.

## La regla de diseño

**Capturar no bloquea.** Los `CHECK` de la migration validan el *formato* cuando
el dato viene; ninguno obliga a llenarlo. Lo que falta se cobra en el panel de
pendientes, no rechazando el alta. Si el sistema estorba el día a día, el
notario deja de capturar y entonces no hay expediente en absoluto.

La única excepción es el **número de instrumento con coma o punto**: `45,321` en
vez de `45321`. El layout sólo admite letras, dígitos, guion medio y guion bajo
(campo 3.6.1.1), así que una coma tira el aviso completo en el portal. Corregirlo
el día 17 significa volver al protocolo, así que ahí sí se ataja en la captura.

## Los tres momentos

| Momento | Qué | Dónde se captura |
|---|---|---|
| **Una vez** | Claves del padrón SAT (campos 2.1–2.3) | Configuración — las carga Kawiil |
| **Al capturar** | Compareciente (3.5.x) y acto (3.6.1.x) | Alta de compareciente / alta de acto |
| **Al cierre del mes** | Referencia del aviso (3.1), prioridad (3.3), alertas (3.4), marca de informe sin operaciones (2.4) | Generador del aviso |

El tercer grupo se muestra en el panel de pendientes **atenuado y etiquetado**,
aunque no se capture ahora. Sin eso, el usuario no sabe si se le olvidó algo o si
el sistema lo va a resolver solo.

## Reglas del layout que no son obvias

Estas salen del instructivo, no de criterio propio. El panel de pendientes cita
el número de campo de cada una.

- **Apellidos.** Si la persona no tiene apellido paterno o materno, el layout
  pide capturar `XXXX` (reglas VC352R1 y VC353R1). Los dos **no** pueden ser
  `XXXX` a la vez (VC352R2 y VC353R2).
- **RFC, CURP y fecha de nacimiento son intercambiables.** El instructivo marca
  los tres como "Obligatorio", pero las reglas VC354R3, VC355R1 y VC356R1 dicen
  que cada uno es opcional mientras exista alguno de los otros dos. Por eso
  faltar los tres **frena** el aviso y faltar uno solo se marca como
  *recomendado*: tratar los tres como obligatorios sería inventar una exigencia
  que la ley no hace.
- **Coherencia de fecha.** Si se reportan juntos, la fecha de nacimiento debe
  cuadrar con la que traen embebida el RFC y la CURP (VC354R4, VC355R2,
  VC356R2). Ikán compara sólo `AAMMDD`, porque el siglo no viaja en la clave:
  exigirlo sería inventar.
- **`<persona_aviso>` es siempre una persona física.** El campo 3.5 describe a
  "la persona que solicita la formalización del instrumento público". Cuando
  quien comparece es una sociedad, en esa rama va quien la representa; la
  sociedad va en el subárbol del acto. Por eso a una persona moral no se le
  reclaman apellidos.
- **Una escritura puede contener varios actos.** `instrumento_publico` **no** es
  único: no lleva constraint de unicidad, sólo índice.

## El subárbol del acto

Las diez ramas del layout (3.6.1.3.1 a 3.6.1.3.10) ya se capturan. No hay diez
formularios escritos a mano: la pantalla se arma desde el diccionario, así que
cuando el SAT publique otra versión del instructivo se regenera
`campos-fep.generated.ts` y la captura cambia sola.

**Cómo se guarda.** El layout repite la misma etiqueta por todas partes —hay un
`<rfc>` del poderdante, otro del apoderado, otro de cada socio— así que la clave
en `operation.datos_acto` es el **número del instructivo** más la ruta de
repeticiones, no la etiqueta:

```
3.6.1.3.1.2.2.1.5          RFC del apoderado, cuando hay uno solo
3.6.1.3.1.2.2.1.5@1        RFC del segundo apoderado
3.6.1.3.6.2.7.2.1.5@0.2    RFC del tercer vendedor de la primera persona moral
3.6.1.3.1.2#n              cuántos apoderados hay
3.6.1.3.1.2.2@1#tipo       si el segundo apoderado es física, moral o fideicomiso
```

Guardarlo por etiqueta pisaría el RFC del poderdante con el del apoderado, y el
aviso saldría con los datos cambiados de sitio: peor que no salir. Quitar una
repetición renumera las siguientes, incluidos los grupos repetibles anidados
(una escisión tiene varias escindidas y cada una sus accionistas).

**Los tres sentidos de "Obligatorio".** El instructivo usa la misma palabra para
cosas distintas, y tratarlas igual rompe el aviso por los dos lados:

| Grado | Qué dice el instructivo | Bloquea |
|---|---|---|
| `siempre` | exigible en cuanto existe la etiqueta padre | Sí |
| `condicional` | "obligatorio si en `<motivo_constitucion>` se elige la opción 1. Fusión" | No |
| `si_aplica` | "si se cuenta con la información" / "con los mismos" | No |
| `opcional` | el instructivo no lo marca obligatorio | No |

La condición se guarda **en prosa, literal**, y se muestra bajo el campo. Mapear
"opción 1. Fusión" a una clave de catálogo sería inventar; quien decide si
aplica es el fedatario, leyéndola.

RFC, CURP y fecha son intercambiables dentro de una persona: faltar los tres
frena el aviso, faltar uno no.

**Lo que exige el layout se dice en el formulario, no el día 17.** Un RFC de
doce caracteres en una persona física no lo rechaza nadie hasta que el portal
tira el archivo, y para entonces el compareciente ya se fue. Así que:

- Cada campo se valida **mientras se escribe**, contra las columnas LONGITUD y
  FORMATO del instructivo: patrón del RFC (cuatro letras en persona física,
  tres en moral), de la CURP, fechas que existan de verdad —20260231 cumple el
  patrón y no es un día—, importes de hasta 14 enteros, claves sin espacios.
- El encabezado de la captura lleva la **cuenta viva** de lo que falta y nombra
  los primeros seis, con su contexto: "Datos de los Apoderados 2 · Falta el
  RFC", no "faltan 12 campos".
- El generador del XML aplica **el mismo validador**. Si uno aceptara lo que el
  otro rechaza, la pantalla diría "listo" y el portal rechazaría: hay una
  prueba que compara las dos listas.

**Quién lo completa.** El Operador lo captura en el alta. Completarlo después es
de OC y Admin: la política `operation_update_motor_or_oc` sólo se lo permite a
ellos y el flujo del Operador termina con el acuse (`docs/ROLES.md`). Si el
modelo tuviera que cambiar —que el notario-operador pueda corregir su propio
acto antes del cierre— es una decisión de roles, no de esta pantalla.

## Lo que este bloque NO cierra

- **Los catálogos de la UIF** (país, actividad económica, tipo de poder, tipo de
  persona moral, …). El instructivo remite a ellos pero no los incluye, y no se
  inventan: las claves se capturan a mano con banner ámbar hasta que se carguen
  desde la consola de plataforma (RCG0.B7).
- **El generador del XML.** Este bloque deja el dato; el XML es el siguiente
  paso.

## Piezas

| Archivo | Qué es |
|---|---|
| `supabase/migrations/0019_expediente_del_acto.sql` | Columnas nuevas en `organizations`, `client` y `operation` |
| `supabase/manual/apply_0019_expediente_acto.sql` | Bundle para el SQL Editor, con 8 verificaciones |
| `supabase/manual/probar_0019_expediente.sql` | 12 pruebas de comportamiento (Postgres desechable, no el remoto) |
| `scripts/generar-campos-fep.mjs` | Genera el diccionario desde el CSV del instructivo |
| `src/lib/aviso/campos-fep.generated.ts` | Los 518 campos, transcritos — **no editar a mano** |
| `src/lib/aviso/completitud.ts` | Qué falta y cuándo se necesita. Módulo puro |
| `src/lib/aviso/ramas-acto.ts` | El árbol de cada tipo de acto, armado desde el diccionario |
| `src/lib/aviso/valores-acto.ts` | Cómo se guardan los valores en `datos_acto`. Módulo puro |
| `src/lib/aviso/catalogos-fep.generated.ts` | Qué catálogo de la base le toca a cada campo — **generado** |
| `src/components/aviso/PendientesAviso.tsx` | El panel |
| `src/components/aviso/CapturaActo.tsx` | La captura del subárbol, recursiva |
| `src/components/aviso/CampoActo.tsx` | Un campo, con el control que le toca según el instructivo |
| `src/test/completitud-aviso.test.ts` | 31 pruebas |
| `src/test/ramas-acto.test.ts` | 19 pruebas de la estructura |
| `src/test/valores-acto.test.ts` | 22 pruebas del almacenamiento |

Regenerar el diccionario: `node scripts/generar-campos-fep.mjs`.
