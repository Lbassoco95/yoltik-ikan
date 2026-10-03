-- =====================================================================
-- 0076 · Formatos oficiales UIF (DOF 24/09/2026)
-- =====================================================================
-- Fuente de verdad: docs/formatos-uif/*.json (NO el PDF del DOF).
-- Catálogo versionado por vigencia a la fecha del acto, no a la de carga.
--
-- Reversa (manual):
--   drop table if exists formato_oficial_campo cascade;
--   drop table if exists catalogo_formato_valor cascade;
--   drop table if exists catalogo_formato cascade;
--   drop table if exists formato_oficial cascade;
--   drop type if exists estado_formato_oficial;
--   drop type if exists regimen_formato_uif;
-- =====================================================================

create type estado_formato_oficial as enum (
  'activo',      -- cargado y usable
  'pendiente',   -- anexo citado pero no publicado en la extracción (4, 10, 14)
  'retirado'     -- deja de estar disponible (p. ej. formatos anteriores post 1-jul-2027)
);

create type regimen_formato_uif as enum (
  'nov_2026',  -- régimen / transición previa (layouts anteriores; referencia)
  'dic_2026',  -- 1-dic-2026: avisos arts. 26 Bis, 26 Bis 1, 26 Bis 2 y 27 de las Reglas
  'jun_2027',  -- 1-jun-2027: todos los avisos e informes
  'jul_2027'   -- 1-jul-2027: formatos anteriores dejan de existir
);

-- ---------------------------------------------------------------------
-- Formato (anexo versionado)
-- ---------------------------------------------------------------------
create table formato_oficial (
  id uuid primary key default gen_random_uuid(),
  -- Código del anexo tal cual index.json: '1', '2-A', '12-C', '14-A', '16'…
  codigo_anexo text not null,
  ambito text not null,
  -- Versión de la resolución. Hoy sólo 'dof-2026-09-24'.
  version text not null default 'dof-2026-09-24',
  estado estado_formato_oficial not null default 'activo',
  -- Régimen a partir del cual este formato es el vigente para su ámbito.
  regimen_entrada regimen_formato_uif not null default 'jun_2027',
  vigente_desde date not null,
  -- Null = sigue vigente. 2027-06-30 para formatos anteriores en modificatorios.
  vigente_hasta date,
  total_campos int not null default 0,
  archivo_origen text,
  fuente text not null default
    'DOF 24/09/2026 — Resolución formatos oficiales de avisos e informes (UIF)',
  notas text,
  creado_en timestamptz not null default now(),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  check (total_campos >= 0),
  unique (codigo_anexo, version)
);

comment on table formato_oficial is
  'Catálogo versionado de formatos oficiales UIF. Un aviso se valida contra la '
  'versión vigente a la fecha del acto, no contra la última cargada.';
comment on column formato_oficial.estado is
  'pendiente = anexo 4/10/14 no publicados en la extracción; no se inventan.';

create index idx_formato_oficial_codigo on formato_oficial(codigo_anexo);
create index idx_formato_oficial_vigencia
  on formato_oficial(vigente_desde, vigente_hasta);

-- ---------------------------------------------------------------------
-- Campos del formato (dato, no código)
-- ---------------------------------------------------------------------
create table formato_oficial_campo (
  id uuid primary key default gen_random_uuid(),
  formato_id uuid not null references formato_oficial(id) on delete cascade,
  orden int not null,
  numero text not null,
  padre text,
  nombre text not null,
  etiqueta_xml text not null,
  -- Se guarda TAL CUAL el JSON, erratas incluidas (ver INCONSISTENCIAS.md).
  obligatoriedad text not null,
  tipo_dato text not null,
  longitud text not null,
  formato text not null,
  pagina_dof int,
  -- Si el campo depende de un catálogo de valores UIF (aún no publicado, salvo
  -- Anexo A). Null = no depende o aún no se identificó.
  catalogo_codigo text,
  unique (formato_id, orden)
);

comment on table formato_oficial_campo is
  'Campos del formato oficial. Fuente: docs/formatos-uif/anexo-*.json. '
  'Prohibido «corregir» tipografías del DOF aquí. '
  'La unicidad es por orden canónico: el DOF reutiliza `numero` dentro del mismo anexo.';

create index idx_formato_campo_formato on formato_oficial_campo(formato_id);
create index idx_formato_campo_orden on formato_oficial_campo(formato_id, orden);

-- ---------------------------------------------------------------------
-- Catálogos de valores del formato (mecanismo; Anexo A sí trae datos)
-- ---------------------------------------------------------------------
create table catalogo_formato (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  descripcion text,
  -- 'dof' = viene en la resolución (Anexo A); 'portal_uif' = lo publica la UIF
  -- en el Portal (art. 9) y todavía no está cargado.
  fuente text not null default 'portal_uif',
  version int not null default 0,
  creado_en timestamptz not null default now()
);

comment on table catalogo_formato is
  'Mecanismo de catálogos de valores para formatos UIF. Sin valores cargados, '
  'los campos que dependen de ellos se marcan no validados (nunca se acepta '
  'valor libre como válido).';

create table catalogo_formato_valor (
  id uuid primary key default gen_random_uuid(),
  catalogo_id uuid not null references catalogo_formato(id) on delete cascade,
  clave text not null,
  descripcion text not null,
  orden int,
  vigente_desde date not null default date '2026-09-24',
  vigente_hasta date,
  version_carga int not null default 1,
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create index idx_catalogo_formato_valor_cat on catalogo_formato_valor(catalogo_id);
create index idx_catalogo_formato_valor_clave
  on catalogo_formato_valor(catalogo_id, clave);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'catalogo_formato_valor_sin_traslape'
  ) then
    alter table catalogo_formato_valor
      add constraint catalogo_formato_valor_sin_traslape
      exclude using gist (
        catalogo_id with =,
        clave with =,
        daterange(vigente_desde, vigente_hasta, '[)') with &&
      );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- RLS: lectura para sujetos de la org; escritura sólo service role / plataforma
-- ---------------------------------------------------------------------
alter table formato_oficial enable row level security;
alter table formato_oficial_campo enable row level security;
alter table catalogo_formato enable row level security;
alter table catalogo_formato_valor enable row level security;

-- Catálogo regulatorio: cualquiera autenticado de una org lo lee.
create policy "formato_oficial_select" on formato_oficial
  for select to authenticated using (true);

create policy "formato_oficial_campo_select" on formato_oficial_campo
  for select to authenticated using (true);

create policy "catalogo_formato_select" on catalogo_formato
  for select to authenticated using (true);

create policy "catalogo_formato_valor_select" on catalogo_formato_valor
  for select to authenticated using (true);

revoke insert, update, delete on formato_oficial from anon, authenticated;
revoke insert, update, delete on formato_oficial_campo from anon, authenticated;
revoke insert, update, delete on catalogo_formato from anon, authenticated;
revoke insert, update, delete on catalogo_formato_valor from anon, authenticated;

grant select on formato_oficial to authenticated;
grant select on formato_oficial_campo to authenticated;
grant select on catalogo_formato to authenticated;
grant select on catalogo_formato_valor to authenticated;
