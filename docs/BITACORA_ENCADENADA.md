# Bitácora encadenada

> Bloque RCG0.B8.1. Migration `0021_bitacora_encadenada.sql`.
> Diseño completo y las otras tres capas: `docs/TRAZABILIDAD_Y_ANCLAJE.md`.

## Qué hace

Cada alta de compareciente, cada acto, cada hallazgo del motor y cada
movimiento de catálogo, lista o parámetro queda en **un solo flujo de eventos**,
encadenado por hashes:

```
evento_hash = SHA256( payload_canónico || "|" || nonce )
cadena_hash = SHA256( hash_anterior || "|" || evento_hash || "|" || secuencia )
```

El primer eslabón cuelga de 64 ceros. Borrar o modificar un evento pasado rompe
la cadena y se detecta al recalcularla.

## Qué prueba y qué no

| | |
|---|---|
| **Sí prueba** | Que ningún evento fue alterado ni borrado dentro de la bitácora. Cualquier cambio a un registro pasado aparece al recalcular, tanto en la base como en la máquina de quien audite. |
| **No prueba** | Que el dato capturado sea **verdadero**. Una cadena certifica lo que le entregaron: si alguien capturó un monto falso, queda un monto falso certificado. |
| **Todavía no prueba** | Que la cadena **completa** no haya sido reescrita. Vive en la base que administramos nosotros. Eso lo cierra el anclaje externo (B8.2). |

El tercer punto está fijado como **prueba**, no como comentario
(`probar_0021_bitacora.sql`, caso 18): reescribir la cadena entera desde la base
**no** lo detecta la cadena sola, y la prueba lo comprueba a propósito para que
nadie llegue después creyendo que basta.

La pantalla dice lo mismo: una verificación exitosa se acompaña siempre de
`ADVERTENCIA_SIN_ANCLA` mientras no exista el ancla.

## Decisiones que no son obvias

**Los eventos los emiten triggers, no la aplicación.** Si dependieran de que
alguien se acuerde de llamar a una función, tarde o temprano una ruta nueva se
olvidaría y el hueco no se notaría hasta que alguien buscara ese evento y no
estuviera.

**El texto que se hashea se guarda tal cual.** `payload_canonico` es la fuente
de verdad; `payload` (jsonb, para consultar) es **columna generada** a partir de
él, así que no pueden discrepar. Al verificar no se vuelve a canonicalizar: se
hashea el texto guardado. Eso elimina de raíz el riesgo de que dos lenguajes
serialicen el mismo objeto de dos maneras.

**Nonce por evento.** Sin él, el hash de un evento con pocos campos posibles se
rompe probando combinaciones.

**Dos cadenas.** Una por organización, más una de plataforma (UUID de ceros)
para lo que hace Kawiil y afecta a todos: catálogos, listas, parámetros.
Separarlas permite que una organización verifique la suya sin ver las demás, y
que el paquete de verificación de un cliente no filtre el volumen de otro.

**Sin llave foránea a `organizations`.** Si una organización se borra, su
bitácora tiene que sobrevivir. Un rastro de auditoría que desaparece con lo
auditado no es un rastro de auditoría.

**Append-only sin excepciones.** En las listas se permitió deshacer una carga
equivocada porque ahí existe el concepto de «carga»; aquí no: una corrección es
un evento nuevo, nunca la edición de uno viejo.

**`verificar_cadena` no es SECURITY DEFINER.** Corre con los permisos de quien
pregunta, así que nadie audita una cadena ajena. Y si la cadena no es visible,
**lanza error en vez de reportarla íntegra**: decir que la cadena de otra
organización está íntegra sería afirmar algo que no se comprobó.

## Se verifica dos veces, a propósito

La pantalla corre **dos** verificaciones: la de la base, con su propia función,
y la del navegador, recalculando desde el paquete exportado. Si sólo verificara
la base, se estaría pidiendo confiar justo en quien se quiere auditar. Que las
dos coincidan es parte del resultado; si difieren, la pantalla lo dice.

El botón **Exportar** baja el paquete completo —eventos, nonces, hashes y
cabeza— para que un auditor lo recalcule por su cuenta con
`src/lib/bitacora/verificador.ts`, sin tocar nuestra API.

Tres hashes de referencia calculados en PostgreSQL están fijados en
`src/test/bitacora-verificador.test.ts`: si la base y el verificador dejaran de
coincidir, la prueba rompe antes que la confianza.

## Un hueco de seguridad que apareció al verificar

El chequeo 11 del bundle encontró que **PostgreSQL otorga `EXECUTE` a `PUBLIC`
en cada función nueva**. Con una función `SECURITY DEFINER` eso significa que
cualquier usuario autenticado la puede llamar con los permisos del dueño.

- `registrar_evento` quedaba abierta: un cliente podía **fabricar eventos en la
  cadena de cualquier organización**, justo lo que la bitácora existe para
  impedir.
- Al revisar el resto apareció lo mismo en `emitir_folio_hallazgo` (migration
  0008), que tampoco comprueba nada: quien la llamara podía **consumir folios de
  la secuencia de otra organización** y abrir huecos en una numeración que se
  supone continua.

Las dos quedaron revocadas de `public`, y el bundle lo comprueba en cada
aplicación. Las demás funciones `SECURITY DEFINER` del repo se revisaron una por
una: las de listas y matriz sí traen control de acceso interno, y el resto son
funciones de trigger, que no se pueden invocar directamente.

## Lo que la cadena empieza a cubrir hoy

La migration **no reescribe la historia anterior**. Los eventos previos no
existen en la cadena y no se inventan: la cadena empieza el día que se aplica.

Emisores instalados: `client`, `operation`, `hallazgo`, `hallazgo_bitacora`,
`catalogo_valor`, `lista_movimiento`, `parametro_regulatorio`.

## Piezas

| Archivo | Qué es |
|---|---|
| `supabase/migrations/0021_bitacora_encadenada.sql` | Tablas, `json_canonico()`, `registrar_evento()`, `verificar_cadena()`, emisores y RLS |
| `supabase/manual/apply_0021_bitacora.sql` | Bundle para el SQL Editor, con 12 verificaciones |
| `supabase/manual/probar_0021_bitacora.sql` | 18 pruebas de comportamiento, incluida la del límite |
| `src/lib/bitacora/verificador.ts` | Verificador puro, sin dependencia de Ikán |
| `src/lib/api/bitacora.ts` | Estado, verificación en base y exportación del paquete |
| `src/components/bitacora/IntegridadBitacora.tsx` | La tarjeta con doble verificación |
| `src/pages/admin/AdminBitacoraPage.tsx` | Cadena de plataforma en la consola de Kawiil |
| `src/test/bitacora-verificador.test.ts` | 15 pruebas, tres contra hashes reales de PostgreSQL |

## Siguiente: B8.2

Anclaje diario de la raíz Merkle con **OpenTimestamps** sobre Bitcoin —gratis,
sin llave ni saldo que custodiar— y paquete de verificación con el archivo
`.ots`. Cadencia propuesta: diaria más un anclaje forzado al cerrar cada periodo
de aviso. **PENDIENTE_CONFIRMAR.**
