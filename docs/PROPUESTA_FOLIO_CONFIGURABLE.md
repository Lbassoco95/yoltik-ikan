# Propuesta de esquema · Folio configurable con candado

> **Estado: PROPUESTA. No implementada.** Cierra la decisión #2 del expediente de
> hallazgos (PR #13): se descarta el folio derivado del UUID.
> Requiere resolver las 5 preguntas del final antes de escribir la migration.

## 1. Lo que encontré en el repo (y que cambia la propuesta)

Tres cosas que conviene saber antes de leer el esquema:

**a) El rol "Admin Kawiil" no existe.** `rol_usuario` es
`('operador', 'oc', 'admin')` y los tres están *dentro* de una organización:
`has_rol()` filtra siempre por `current_org_id()`. El `admin` de hoy es el
administrador **del cliente**, no de Kawiil (ver `docs/ROLES.md`: sus cambios
pasan por aprobación del OC). No hay ninguna marca en `organizations` ni en
`user_profile` que distinga a Kawiil de un sujeto obligado.

El candado que pides necesita un privilegio que **cruza organizaciones**, y el
modelo de roles actual no puede expresarlo. Es la decisión de fondo de esta
propuesta (pregunta 1).

**b) El folio de Reportes es maqueta.** `XII-2026-0001` está hardcodeado en un
arreglo de `src/pages/ReportsPage.tsx`; no hay generador que reutilizar. Se
conserva el **estilo visual**, pero la maquinaria se construye desde cero.

**c) Ya existe la bitácora que pides.** `audit_log` (migration 0001) tiene
`actor`, `rol_activo`, `accion`, `recurso_tipo`, `recurso_id`, `antes` jsonb,
`despues` jsonb, `ts`. Es de organización, que es el nivel correcto para el
formato de folio — `hallazgo_bitacora` es del expediente y no aplica. Solo le
falta la justificación en texto libre: se agrega `motivo text`.

## 2. Esquema propuesto

### 2.1 Privilegio de plataforma (Kawiil)

```sql
create table platform_admin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  otorgado_por uuid references auth.users(id),
  otorgado_en timestamptz not null default now()
);

create function public.es_admin_kawiil() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admin where user_id = auth.uid())
$$;
```

Tabla aparte y no un valor nuevo del enum `rol_usuario`: ese enum se otorga
*por organización*, así que un `admin_kawiil` obligaría a insertar una fila de
rol en **cada** organización cliente para poder tocarla. Semánticamente al
revés. `platform_admin` es un privilegio global, que es lo que Kawiil es.

### 2.2 Configuración de folio

```sql
create type ambito_secuencial as enum ('organizacion', 'prefijo', 'prefijo_anio');

create table configuracion_folio (
  organization_id uuid primary key references organizations(id) on delete cascade,
  plantilla text not null default '{prefijo}-{anio}-{secuencial:4}',
  prefijo_fijo text,               -- null = derivar del sector de la tipología
  ambito_secuencial ambito_secuencial not null default 'prefijo_anio',
  iniciada_en timestamptz,         -- null = el OC todavía puede configurar
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now(),
  creada_en timestamptz not null default now()
);
```

`iniciada_en` en vez del booleano `iniciada`: guarda *cuándo* se cerró el
candado, que es lo que va a preguntar un auditor. Lo escribe la función que
emite el folio #1, no una captura manual.

### 2.3 Contadores

```sql
create table folio_secuencial (
  organization_id uuid not null references organizations(id) on delete cascade,
  clave text not null,             -- 'XII|2026' | 'XII' | 'org', según el ámbito
  valor int not null default 0,
  primary key (organization_id, clave)
);
```

Aquí me separo de tu modelo sugerido: propusiste `secuencial_actual` como
columna de `configuracion_folio`. No alcanza si el contador reinicia por año o
por sector — serían varios contadores vivos por organización, no uno. Con tabla
aparte el ámbito es configurable sin cambiar el esquema.

### 2.4 Folio en el hallazgo

```sql
alter table hallazgo add column folio text;
create unique index idx_hallazgo_folio on hallazgo(organization_id, folio)
  where folio is not null;
```

### 2.5 Emisión atómica

```sql
create function public.emitir_folio_hallazgo(p_hallazgo_id uuid) returns text
language plpgsql security definer set search_path = public as $$
  -- 1. resuelve config (crea la default si la organización no tiene)
  -- 2. arma la clave de ámbito ('XII|2026')
  -- 3. incrementa de forma atómica:
  --      insert into folio_secuencial (organization_id, clave, valor) values (..., 1)
  --      on conflict (organization_id, clave)
  --      do update set valor = folio_secuencial.valor + 1
  --      returning valor
  -- 4. renderiza la plantilla
  -- 5. si iniciada_en is null -> iniciada_en = now()  (cierra el candado)
  -- 6. update hallazgo set folio = ...
$$;
```

El `on conflict do update ... returning` es lo que evita la condición de
carrera: el motor crea hallazgos en lote y un `select` + `update` por separado
entregaría folios duplicados.

Placeholders soportados: `{prefijo}`, `{anio}`, `{secuencial:N}` (N = longitud
con relleno de ceros). Conjunto cerrado y validado al guardar; una plantilla con
un placeholder desconocido se rechaza en vez de renderizar basura.

### 2.6 El candado

`configuracion_folio` **no lleva política de UPDATE**: nadie la edita directo.
El único camino es una función que exige justificación:

```sql
create function public.cambiar_formato_folio(
  p_organization_id uuid,
  p_plantilla text,
  p_prefijo_fijo text,
  p_ambito ambito_secuencial,
  p_justificacion text
) returns configuracion_folio
language plpgsql security definer set search_path = public as $$
  -- Si iniciada_en IS NULL      -> permite al OC de esa organización.
  --                                Justificación opcional.
  -- Si iniciada_en IS NOT NULL  -> exige es_admin_kawiil() y p_justificacion
  --                                no vacía; si no, lanza excepción.
  -- Siempre que iniciada_en IS NOT NULL escribe en audit_log:
  --   accion='cambio_formato_folio', recurso_tipo='configuracion_folio',
  --   antes={plantilla,prefijo_fijo,ambito}, despues={...}, motivo=p_justificacion
$$;
```

Se hace por función y no por trigger porque un trigger no puede recibir la
justificación como parámetro (habría que pasarla por una variable de sesión,
que es frágil y fácil de omitir). Así la justificación es obligatoria por firma.

```sql
alter table audit_log add column motivo text;
```

## 3. Consecuencia operativa que hay que decidir

El candado se cierra con el **primer folio real**. Si el folio se emite al crear
el hallazgo, la organización queda cerrada en su **primera corrida del motor** —
y si nadie configuró el formato antes, se queda con la plantilla por defecto y
ya solo Kawiil puede cambiarla.

Eso obliga a poner la configuración de folio en el **onboarding**, antes de la
primera corrida. No es un problema del esquema, pero sí un paso de producto que
hoy no existe.

Aplica igual a las organizaciones ya vivas: FIATCOIN y la notaría de GDL ya
tienen hallazgos. Ver pregunta 5.

## 4. Preguntas antes de implementar

1. **Admin Kawiil.** ¿Va la tabla `platform_admin` como privilegio global? Es un
   nivel de acceso que cruza organizaciones — quiero tu visto bueno explícito
   antes de introducirlo, no darlo por hecho.
2. **Ámbito del secuencial.** `XII-2026-0001`: ¿reinicia cada año? ¿el contador
   es por sector/tipología o uno solo por organización? Propuesta por defecto:
   por prefijo **y** año (`prefijo_anio`).
3. **Prefijo.** ¿Sale del sector de la tipología que disparó el hallazgo (XII,
   XVI) o es un texto fijo por organización? El esquema soporta ambos
   (`prefijo_fijo` null = derivar), pero el default importa.
4. **Momento de emisión.** ¿El folio se asigna al crear el hallazgo (motor) o
   al abrir el expediente por primera vez? Ver sección 3.
5. **Hallazgos existentes.** Los de FIATCOIN y la notaría, ¿se rellenan con
   folio retroactivo — lo que cierra el candado de ambas de inmediato — o se
   quedan sin folio y solo lo llevan los nuevos?

## 5. Fuera de esta propuesta

- Folios de Reportes/Avisos: hoy son maqueta. El mismo `configuracion_folio`
  podría servirles, pero no lo diseño hasta que el de hallazgos esté probado
  (mismo criterio que usamos con el expediente).
- UI de configuración del formato. Va después de cerrar el esquema.
