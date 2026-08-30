# Prompt para Devin · Migration 0026 + Edge Function de anclaje

> Copia todo lo que sigue a partir de la línea `---` y pégalo en Devin.
> Vive en el repo para que la siguiente vez no haya que reescribirlo.

---

# Ikán · Aplicar la 0026 y dejar corriendo el anclaje en Bitcoin

Trabajas sobre el proyecto **Ikán** (plataforma de cumplimiento PLD).
Repo: `Lbassoco95/yoltik-ikan`, rama `claude/happy-wright-91iz1v`.
Supabase **de producción**: `cibpguwwggwzdhhpdomz`.

## Reglas, antes que nada

1. **Es producción.** Nada destructivo: sin `drop table`, sin `truncate`, sin
   `delete` fuera del cuerpo de una función.
2. **Todo cambio de esquema entra por su bundle.** No escribas SQL propio para
   "arreglar" algo: si un bundle falla, **párate y reporta el error completo**.
   No improvises alrededor.
3. **Ningún token, PAT ni `.env` se commitea.**
4. Si algo no cuadra con lo que dice este prompt, **detente y dímelo**.
5. Un commit por unidad de trabajo, con mensaje en español.

## Contexto en dos párrafos

Ikán guarda una **bitácora encadenada**: cada alta, cada acto y cada corrida
del motor queda con su hash, encadenado al anterior. Eso prueba que nadie
alteró un evento suelto. Lo que **no** prueba es que Ikán no reescribiera la
cadena entera, porque la cadena vive en una base que Ikán administra.

Eso lo cierra publicar cada día la **raíz Merkle** de los eventos nuevos en
Bitcoin, vía **OpenTimestamps**: gratis, sin llave ni saldo que custodiar, y
verificable por cualquiera con un nodo de Bitcoin. Hacia afuera salen 32 bytes:
ni un dato personal, ni un identificador de cliente, ni cuántos eventos hay
detrás. Eso último no es un detalle: el artículo 38 de la LFPIORPI impone deber
de reserva y revelar que alguien fue reportado es delito.

---

## Tarea 1 · Ver qué falta

Pega en el SQL Editor **`supabase/manual/00_estado_migraciones.sql`**. No
escribe nada, sólo mira. Devuelve una sola tabla (el editor únicamente muestra
el último resultado, por eso está armada así).

Espera ver la 0026 como `FALTA`. **Pega el resultado completo en tu reporte.**

Si alguna migration anterior a la 0026 aparece como `FALTA`, **córrela primero**
en el orden de la columna `orden`. Todos los bundles son idempotentes.

---

## Tarea 2 · Aplicar la 0026

Pega **`supabase/manual/apply_0026_anclaje.sql`** completo en el SQL Editor.

Va dentro de una transacción y **verifica antes del `commit`**: si alguna de
las 8 comprobaciones falla, la transacción se aborta sola y no queda nada a
medias.

Al final devuelve una tabla como esta:

```
bundle                 | esquema                | rls                                                 | datos                  | ...
anclaje de la bitácora | 15 columnas en anclaje | 1 política (sólo lectura; escribe la Edge Function) | 0 anclajes registrados | ...
```

**Pega el resultado.** Si sale un error, pega el error completo y **para ahí**.

### Lo que NO hay que "arreglar"

La tabla `anclaje` queda con **una sola política de RLS, de lectura**. Eso es
deliberado y está comentado en la migración:

> Los anclajes los crea **únicamente** la Edge Function con `service_role`, que
> no pasa por RLS. Si alguien le agrega una política de `insert`, cualquier
> usuario autenticado podría fabricar un ancla — y entonces el ancla deja de
> probar absolutamente nada.

Si ves una herramienta o un linter de Supabase quejándose de que a `anclaje`
"le falta política de escritura": **es correcto que le falte**. No la agregues.
El diagnóstico del paso 1 marca `HUECO GRAVE` si alguien la agrega.

Del mismo modo, `anclaje` tiene disparadores que impiden **corregir** el tramo
o la raíz y que impiden **borrar** una fila. Sólo se puede pasar de `pendiente`
a `confirmado`. También es deliberado: poder reescribir un anclaje sería poder
elegir a posteriori qué se certificó.

---

## Tarea 3 · Desplegar la Edge Function

```bash
npx supabase functions deploy anclar-bitacora --project-ref cibpguwwggwzdhhpdomz
```

El código está en `supabase/functions/anclar-bitacora/`. Importa dos módulos de
`supabase/functions/_shared/` (`merkle.ts` y `opentimestamps.ts`):

- **Si el despliegue falla porque no encuentra `../_shared/`**, no muevas los
  archivos ni los dupliques: repórtalo y dime el error exacto. Duplicar el
  módulo Merkle es justamente lo que no queremos —dos copias de esa aritmética
  son dos raíces distintas el día que una se toque.

La función necesita salida a internet hacia `*.opentimestamps.org` y
`*.eternitywall.com`. Las Edge Functions de Supabase la tienen por defecto.

---

## Tarea 4 · Forzar un anclaje y COMPROBAR EL ARCHIVO `.ots`

**Esta es la tarea importante del encargo.** Todo lo demás está probado; esto
no se pudo probar.

### Por qué

El envío al calendario de OpenTimestamps es una petición HTTP simple y no tiene
misterio. **El armado del archivo `.ots` sigue la especificación del formato
pero nunca se comprobó contra un calendario real**: el entorno donde se escribió
tiene bloqueado `*.opentimestamps.org`.

Además, la librería de referencia (`javascript-opentimestamps`) arrastra `web3`,
`bitcore-lib` y `fs`, que no corren en una Edge Function, así que el cliente es
propio y mínimo.

El riesgo está acotado a propósito: **la respuesta del calendario se guarda tal
cual dentro del archivo**. Si el armado resultara mal, la prueba no se pierde y
el `.ots` se rehace después. Lo que no se puede rehacer es el estampado, y ese
ya habría ocurrido de todos modos.

### Cómo

**4.1 — Forzar un anclaje.**

```bash
curl -s -X POST \
  "https://cibpguwwggwzdhhpdomz.supabase.co/functions/v1/anclar-bitacora" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"motivo":"manual"}' | jq .
```

Responde algo así:

```json
{"ok": true, "motivo": "manual", "organizaciones": 2, "ancladas": 1,
 "detalle": [{"organization_id": "...", "anclado": true, "desde": 1, "hasta": 47,
              "raiz_merkle": "…", "estado": "pendiente"}]}
```

- `"anclado": false` con `"motivo_no_anclado": "sin eventos nuevos"` en una
  organización es **normal**: no ha registrado nada.
- Si TODAS salen con `estado: "fallido"`, pega el campo `motivo_no_anclado`
  completo: ahí dice qué contestó cada calendario.

**Pega la respuesta entera en tu reporte.**

**4.2 — Sacar el `.ots` de la base.**

En el SQL Editor:

```sql
select id,
       desde_secuencia, hasta_secuencia,
       raiz_merkle,
       estado,
       calendarios,
       octet_length(ots) as bytes_ots,
       encode(ots, 'base64') as ots_base64
  from anclaje
 order by creado_en desc
 limit 1;
```

Guarda `ots_base64` en un archivo:

```bash
echo '<pega aquí el base64>' | base64 -d > anclaje.ots
```

**4.3 — Validarlo con la herramienta oficial.**

```bash
pip install opentimestamps-client
ots info anclaje.ots
```

`ots info` no necesita red y es la prueba que buscamos: dice si el archivo está
bien formado, qué digest lleva y qué atestiguaciones tiene.

- **Si `ots info` lo lee bien** y muestra el mismo `raiz_merkle` que trae la
  tabla, más una atestiguación `PendingAttestation` apuntando a los
  calendarios → **el armado es correcto**. Dilo así en tu reporte y pega la
  salida completa.
- **Si `ots info` da error** ("bad magic bytes", "unsupported version",
  "truncated", cualquier cosa) → **el armado está mal**. Pega el error exacto y
  la salida de:

  ```bash
  xxd anclaje.ots | head -8
  ```

  Con eso se corrige `supabase/functions/_shared/opentimestamps.ts` sin volver a
  estampar nada. **No intentes arreglarlo tú**: la corrección tiene que salir
  del formato, no de prueba y error.

**4.4 — Opcional, si `ots info` pasó:** `ots verify anclaje.ots` va a decir que
está *pendiente* (Bitcoin tarda unas horas en confirmar). Eso es lo esperado, no
un fallo. La confirmación se recoge en un bloque posterior.

---

## Tarea 5 · Programar el cron diario

Sólo **si la tarea 4 salió bien**. Si el `.ots` no validó, este paso espera: no
tiene sentido dejar corriendo a diario algo cuyo formato de salida está en duda
—aunque el estampado sí serviría igual—.

En el dashboard de Supabase, **Database → Cron Jobs** (o `pg_cron`), un job
diario que llame a la función. Sugerencia: **03:00 hora de la Ciudad de México**,
que es cuando nadie está capturando.

Pega la configuración que hayas dejado.

---

## Lo que hay que reportar

1. Resultado completo de `00_estado_migraciones.sql` (antes y después).
2. Resultado del bundle `apply_0026_anclaje.sql`.
3. Salida del despliegue de la Edge Function.
4. La respuesta JSON del anclaje forzado.
5. **La salida completa de `ots info`** — con esto se decide si el bloque se
   cierra o hay que corregir el armado.
6. La configuración del cron, si llegaste hasta ahí.

Si algo falla: el error completo, sin resumir, y **para**. Es preferible un
paso a medias reportado con precisión que un arreglo improvisado en producción.
