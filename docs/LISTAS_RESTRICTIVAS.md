# Listas restrictivas

> Migration `0012` · seed `11`

## El problema que resuelve

Las tablas de listas de la migration `0003` (`country_risk_list`,
`entity_risk_list`, `sanctions_list_entry`) llevan `organization_id not null`.
Cada organización guarda **su propia copia de las mismas listas globales**. El
seed 08 lo dejó por escrito:

> «El motor filtra `country_risk_list` por organización; la org notaría necesita
> sus propias filas para que XII-03 dispare.»

Hubo que duplicar Irán y Corea del Norte. La lista negra del GAFI no es de una
notaría ni de un exchange: es la misma para todos. Con veinte notarías serían
veinte copias de la misma verdad y veinte formas de desincronizarse.

Aquí el catálogo se mantiene **una vez**, lo administra Kawiil
(`platform_admin`, migration 0008) y lo consume toda organización sin importar
su actividad. Nadie guarda copias: todos leen `v_listas_vigentes`.

## Los dos patrones de actualización

Esta es la decisión de diseño central. Las fuentes **no** se actualizan igual, y
forzarlas al mismo molde rompería una de las dos.

| Modo | Fuentes | Cómo funciona |
|---|---|---|
| `snapshot` | OFAC, ONU, UE, SAT 69-B | Publican el archivo **completo**. La carga nueva reemplaza el estado; las bajas se deducen por diferencia. |
| `movimientos` | **UIF · Personas Bloqueadas** | No publica un archivo que se reemplace: emite **oficios**. Un oficio da de alta, otro da de baja. El estado vigente es el resultado de aplicarlos en orden. |

La UIF es el caso que obliga al diseño. Por eso:

- **`lista_movimiento`** es la bitácora **inmutable** de lo que pasó, con el
  oficio que lo respalda. No se edita ni se borra: corregir es registrar el
  movimiento contrario.
- **`lista_registro`** es el estado vigente, **derivado por trigger**. Nunca se
  escribe a mano.
- Una baja **desactiva, nunca borra**.

## Por qué la baja no borra

Es la diferencia entre tener evidencia y no tenerla.

Si el notario barrió a un compareciente en marzo, cuando la persona sí estaba
bloqueada, y la UIF la desbloqueó en junio, **el barrido de marzo fue correcto**.
Si la baja hubiera borrado la fila, el sistema sólo podría decir «hoy no
aparece», que no es lo que se defiende en una verificación.

```sql
select public.listado_en_fecha('uif_bloqueadas', date '2026-04-15', 'RAPJ800101AB1');
-- true: el 15 de abril SÍ estaba listada, aunque hoy ya no lo esté
```

Se resuelve por la **fecha del oficio**, no por cuándo Kawiil lo capturó: lo que
importa es cuándo lo determinó la autoridad.

## Captura de la UIF (lo que va en la consola de Kawiil)

Un movimiento por oficio, con estos campos:

| Campo | Obligatorio | Nota |
|---|---|---|
| `accion` | sí | `alta` o `baja` |
| `nombre` | sí | Se normaliza para cotejo: sin acentos, mayúsculas, sin puntuación |
| `rfc` | no | Se guarda en mayúsculas. Es el identificador fuerte del cotejo |
| `oficio_numero` | no en el esquema, **sí en la práctica** | Sin él la baja no es defendible |
| `oficio_fecha` | no | Si falta, se usa la fecha de captura |
| `curp`, `pais`, `identificadores` | no | |

### Cómo cotejan las altas y bajas

Por **RFC** cuando lo hay; por **nombre normalizado** cuando no. Nunca entre
fuentes distintas: una persona en la lista de la UIF y otra en OFAC son
registros separados aunque coincida el RFC, porque son designaciones de
autoridades distintas.

Una **baja sin alta previa se rechaza** con un error explícito. Es a propósito:
avisa al administrador de que esa persona no estaba listada, en vez de aceptar
en silencio un movimiento que no aplica a nadie.

Un **alta sobre alguien dado de baja lo reactiva** y limpia el rastro de baja
del estado vigente; el movimiento anterior sigue en la bitácora.

## Naturaleza de la fuente

`lista_fuente.naturaleza` distingue `sancion_aml`, `fiscal`, `jurisdiccion`,
`pep` e `interna`. No es cosmético: el **69-B del SAT es materia fiscal**
(operaciones presuntamente simuladas), no una sanción de lavado. Sin la
distinción, el OC trataría a un EFOS como si fuera un sancionado de OFAC.

## Lo que ningún proveedor cubre

Ni Sumsub ni Didit incluyen la Lista de Personas Bloqueadas de la UIF ni el
69-B. Los dos traen OFAC, ONU, UE, HMT, PEP y medios adversos. La lista que el
**Art. 18 fr. V LFPIORPI** obliga a consultar es mexicana y no está en ninguno.

Por eso esta capa no es opcional ni sustituible: es el núcleo del cumplimiento
mexicano. Al proveedor se le compra identidad y listas globales; **lo mexicano
lo sostiene Kawiil**.

## Estado y qué falta

Aplicado en esta migration:

- Catálogo de fuentes, cargas, movimientos y estado vigente.
- Ciclo completo de alta y baja por oficio, con evidencia histórica.
- RLS: lectura del catálogo para autenticados; cargas, movimientos y escritura
  sólo para `es_admin_kawiil()`. Ninguna organización puede meter o sacar a
  alguien de una lista restrictiva.
- `v_listas_vigentes` con `security_invoker` (sin eso la vista saltaría la RLS).

Pendiente:

1. **Consola de Kawiil** para capturar movimientos y subir archivos.
2. **Jurisdicciones** (GAFI) y migración de `country_risk_list` al catálogo global.
3. **Parsers de archivo** para OFAC y 69-B. Van como núcleo puro con fixtures
   (probable en CI) más el `fetch` en una Edge Function, porque el entorno de
   desarrollo tiene bloqueadas todas las fuentes por política de red de salida.
   **Hacen falta muestras reales de cada archivo**: inventar el formato sería
   peor que no tener el parser.
4. **`coincidencia_lista`**: el rastro de cada barrido contra un compareciente,
   que es lo que conecta esta capa con el expediente.
5. **Lista interna por organización**: la fuente ya está en el catálogo pero
   necesita alcance por organización antes de habilitarse.

## Aplicar y probar

```
1. supabase/manual/apply_0012_listas.sql          ← aplica (transaccional, idempotente)
2. supabase/manual/verificar_0012.sql             ← comprueba estructura y catálogo
3. supabase/manual/probar_0012_movimientos.sql    ← ejercita alta/baja; termina en ROLLBACK
```

El tercero es seguro de correr en el SQL Editor: va dentro de una transacción
que revierte, así que no deja ni una fila.

Verificado contra PostgreSQL 16 real (ver `docs/PARAMETROS_REGULATORIOS.md` para
levantar el Postgres desechable): 12 escenarios, incluyendo alta, baja, re-alta,
cotejo con y sin acentos, rechazo de baja sin alta previa, inmutabilidad de la
bitácora y aislamiento entre fuentes.
