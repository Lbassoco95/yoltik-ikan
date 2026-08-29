# Parámetros regulatorios

> Migration `0011` · seed `10` · núcleo puro en `src/lib/parametros.ts`

## Por qué existe

Antes de la 0011 la UMA vivía en tres constantes del código, **con dos valores
distintos**:

| Dónde | Valor | Para qué se usaba |
|---|---|---|
| `src/lib/utils.ts` | `113.07` | umbrales que pintaba el front |
| `supabase/functions/motor-pld/evaluadores.ts` | `113.07` | decidir si había hallazgo |
| `src/data/_legacy_mock.ts` | `132.59` | **lo que veía el usuario** en Motor de Reglas |

Además, `RulesEnginePage` presumía «Actualización automática INEGI», que no
existía. Y ninguno de los dos valores era correcto:

- **UMA 2025**: `113.14` (el `113.07` del repo era ese valor mal transcrito).
- **UMA 2026**: `117.31`, vigente del 1 de febrero de 2026 al 31 de enero de
  2027. Publicada por INEGI el 8 de enero de 2026 (comunicado 1/26) y en el DOF
  el 9 de enero de 2026. Es 3.69% más que 2025, por la variación anual del INPC
  a diciembre de 2025.

Consecuencia práctica: el motor calculaba los umbrales en pesos **por debajo**
del valor real, o sea sobre-reportaba. Un acto de $1,850,000 se comparaba contra
16,000 × 113.07 = $1,809,120 en vez de 16,000 × 117.31 = $1,876,960.

## Modelo

Un parámetro es un **valor con vigencia y con fuente**, no una constante.

```
parametro_regulatorio
  codigo            uma_diaria · umbral_identificacion_uma · umbral_xii_inmueble_uma …
  valor_numerico    la cifra
  unidad            mxn · uma · dia · anio · porcentaje
  sector            '*' = todas las actividades; 'XII' gana sobre '*'
  vigente_desde     obligatorio
  vigente_hasta     null = sigue vigente (rango semiabierto: [desde, hasta))
  fuente            obligatorio. Sin fuente no se siembra
  publicacion_dof   dónde se publicó
  confirmado_por    null = sembrado pero NO validado por Kawiil-Cumplimiento
```

Una **restricción de exclusión** garantiza que un mismo `codigo` + `sector` no
pueda tener dos valores vigentes el mismo día. Sin eso, `parametro_vigente()`
sería ambiguo y el motor podría calcular distinto en dos corridas.

### Ámbito: plataforma, no organización

La tabla **no lleva `organization_id` a propósito**. La UMA no es de una
notaría ni de un exchange: es la misma para todos. Kawiil la mantiene
(`platform_admin`, migration 0008) y toda organización la consume sin importar
su actividad.

- Lectura: cualquier usuario autenticado.
- Escritura: sólo `es_admin_kawiil()`. Ninguna organización puede mover un
  umbral de ley desde su propia consola.
- La vista `v_parametros_vigentes` lleva `security_invoker = true`. **No es
  opcional**: sin eso la vista correría con los permisos de su dueño y saltaría
  la RLS de la tabla.

## Cómo se consume

**Front** — `useParametros()`:

```ts
const { valor, parametro } = useParametros();
const umaMxn = valor(PARAM.UMA_DIARIA);          // number | undefined
const umbral = parametro(PARAM.XII_INMUEBLE, 'XII');
```

Si no hay parámetro vigente, `valor()` devuelve `undefined` y la UI pinta un
guion. **Nunca se sustituye por un valor por omisión**: una cifra inventada en
pantalla es peor que un guion.

**Motor PLD** — `index.ts` lee `parametro_vigente('uma_diaria')` y lo pasa por
`MotorContext.umaMxn`. Si no hay UMA vigente **el motor no corre** y devuelve
422. Fallar es correcto: calcular umbrales con un valor inventado produciría
hallazgos falsos o los ocultaría.

El núcleo `evaluadores.ts` sigue siendo puro y no declara ninguna cifra: recibe
el valor por contexto. Por eso el motor y el front ya no pueden desincronizarse.

## Vigencia histórica

Un acto de agosto de 2026 se juzga con la UMA de 2026 aunque la revisión ocurra
en 2029. Por eso se conserva la fila de 2025 y por eso `parametro_vigente()`
acepta una fecha:

```sql
select public.parametro_vigente('uma_diaria', date '2025-06-15');  -- 113.14
select public.parametro_vigente('uma_diaria');                     -- vigente hoy
```

Hoy el motor resuelve la UMA **a la fecha de la corrida**, no a la del acto.
Recalcular actos viejos con la UMA que les tocaba es un caso aparte; la función
ya lo soporta, el motor todavía no lo usa.

## Actualización automática desde INEGI

**Estado: pendiente de decisión.** Lo que sabemos:

- INEGI tiene una API oficial (Banco de Indicadores, fuentes BISE y BIE) que
  devuelve JSON o XML y **requiere un token gratuito** por registro.
- No se pudo confirmar que la UMA tenga un identificador de indicador en esa
  API: el entorno de desarrollo tiene bloqueado el dominio de INEGI por política
  de red de salida. **Hace falta un token para verificarlo.**

**Recomendación: no automatizar todavía.** La UMA cambia **una vez al año**, en
una fecha conocida (INEGI publica los primeros días de enero, vigencia desde el
1 de febrero). Construir y mantener un scraper para un valor anual cuesta más de
lo que ahorra, y falla en silencio justo el día que importa. Es el mismo
criterio que el repo ya aplicó al GAFI en `SPRINT_RCG0_BACKLOG.md`: *«no
construir scraper de PDF; la frecuencia no lo justifica»*.

El diseño propuesto:

1. Recordatorio anual a Kawiil-Cumplimiento en enero.
2. Alta del nuevo valor desde la consola de plataforma, con su publicación del
   DOF, y `vigente_hasta` del anterior cerrado automáticamente.
3. **Opcional**, si el token confirma que el indicador existe: una verificación
   que compare el valor cargado contra INEGI y avise si difieren. Verificar, no
   escribir: el número que usa el motor lo aprueba una persona.

Para las **listas** el cálculo es al revés —OFAC cambia varias veces por semana—
y ahí sí va ingesta automatizada. Eso es el Bloque 2.

## Pendiente de confirmación

Estos parámetros están sembrados con `confirmado_por = null` y la UI los marca
como referencia:

| Código | Valor | Por qué |
|---|---|---|
| `uma_diaria` (2026) | 117.31 | Verificado contra fuentes secundarias coincidentes; falta el cotejo formal contra el DOF |
| `umbral_identificacion_uma` | 645 | Trasladado del código con su cita heredada; confirmar alcance por fracción |
| `umbral_restriccion_uma` | 3,210 | El repo lo usaba sin cita explícita |
| `umbral_xii_inmueble_uma` | 16,000 | Viene marcado «referencia» desde el seed 08 |
| `umbral_xii_persona_moral_uma` | 8,025 | Igual |

`vigente_desde` de los umbrales se fijó al **inicio del ejercicio en curso**, no
a la entrada en vigor de la ley, porque esa fecha no está documentada en el repo
y no se inventa.

## Aplicar en el remoto

```
1. supabase/manual/apply_0011_parametros.sql   ← aplica
2. supabase/manual/verificar_0011.sql          ← comprueba
```

Idempotente y transaccional. Requiere la migration 0008 aplicada (de ahí sale
`es_admin_kawiil()`). La verificación no sólo revisa que las tablas existan:
comprueba que `parametro_vigente()` **resuelva los valores correctos**, que es
donde estaba el error original.

### Nota para quien escriba seeds

El primer intento de aplicar este seed falló con:

```
ERROR: column "confirmado_en" is of type date but expression is of type text
```

En una lista `VALUES`, PostgreSQL infiere el tipo de cada columna a partir de
las filas. Si **todas** las filas traen `NULL` sin tipo, lo infiere como `text`,
y el insert truena contra una columna `date` o `numeric`. Por eso en este seed
**todos los NULL van casteados** (`null::date`, `null::text`), incluso donde la
inferencia acertaría: así reordenar una fila no vuelve a romperlo.

Se puede reproducir sin tocar el remoto levantando un Postgres desechable:

```bash
mkdir -p /tmp/ikanpg && chown postgres:postgres /tmp/ikanpg
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/ikanpg -U postgres --auth=trust"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/ikanpg -o '-p 55432 -k /tmp -c listen_addresses=' -l /tmp/ikanpg/server.log start"
# Arnés mínimo: la 0011 sólo necesita esto de Supabase
psql -h /tmp -p 55432 -U postgres -c "create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable as \$\$ select null::uuid \$\$;
  create function public.es_admin_kawiil() returns boolean language sql stable as \$\$ select false \$\$;"
psql -h /tmp -p 55432 -U postgres -f supabase/manual/apply_0011_parametros.sql
psql -h /tmp -p 55432 -U postgres -f supabase/manual/verificar_0011.sql
```

`npm run typecheck/lint/test/build` **no** ejecuta SQL. Cualquier migration o
seed nuevo se prueba así antes de mandarlo al remoto.
