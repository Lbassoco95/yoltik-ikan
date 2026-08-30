-- =====================================================================
-- Ikán · Migration 0023 · prospect_intake
-- =====================================================================
-- Esta tabla EXISTE en producción desde antes y no tenía migration en ningún
-- repo. Era el último objeto sin respaldo: sin ella, un `supabase db reset` o
-- una base nueva quedaban sin la tabla que la Edge Function `on-prospect-intake`
-- necesita, y nadie se enteraba hasta que un prospecto llenara el formulario.
--
-- El DDL NO está reconstruido de memoria ni deducido del código de la Edge
-- Function: sale de consultar `information_schema` en producción el 30 de
-- agosto de 2026. Orden de columnas, nulabilidad y defaults son los que
-- devolvió esa consulta.
--
-- En producción esta migration es un no-op (`if not exists`). Su valor está en
-- las bases nuevas y en la verificación del bundle, que compara columna por
-- columna contra lo que haya en la base: si el repo y producción se separan,
-- lo dice en vez de dejarlo pasar.
-- =====================================================================

create table if not exists prospect_intake (
  id uuid primary key default gen_random_uuid(),

  razon_social text not null,
  rfc text not null,
  regimen_fiscal text,
  -- Varias fracciones del artículo 17 a la vez: un sujeto obligado puede
  -- operar más de una actividad vulnerable.
  actividad_vulnerable text[] not null,
  estado_operacion text,

  volumen_ops_mes integer,
  clientes_activos integer,
  tiene_oc_designado boolean,
  registrado_sppld boolean,
  tiene_manual_pld boolean,

  contacto_nombre text not null,
  contacto_cargo text,
  contacto_email text not null,
  contacto_telefono text,

  ciudad text,
  estado_republica text,
  origen text,
  notas text,

  consentimiento_privacidad boolean not null,
  consentimiento_contacto boolean not null,

  created_at timestamptz default now(),
  status text default 'nuevo',
  -- Respuestas propias del fedatario que no caben en las columnas fijas.
  extra_fedatario jsonb,
  updated_at timestamptz not null default now()
);

comment on table prospect_intake is
  'Prospectos que llenan el formulario público. La escribe la Edge Function on-prospect-intake con service_role. RLS activo y CERO políticas a propósito: ver el comentario de abajo.';

-- ---------------------------------------------------------------------
-- RLS activo y sin políticas — es correcto, no es un descuido
-- ---------------------------------------------------------------------
-- Con RLS activo y ninguna política, la tabla es ilegible e inescribible para
-- todo rol que pase por RLS. Es exactamente lo que se busca:
--
--   · La Edge Function `on-prospect-intake` escribe con SUPABASE_SERVICE_ROLE_KEY,
--     que salta RLS por diseño. Por eso funciona.
--   · Nadie más debe leerla. Son datos de contacto de prospectos —nombre,
--     correo, teléfono, y qué tan avanzado va su cumplimiento—: información
--     comercial sensible que no le toca a ninguna organización cliente.
--
-- SI ALGUIEN VE QUE `select * from prospect_intake` DEVUELVE VACÍO: no está
-- rota. Está haciendo su trabajo. Añadirle un `using (true)` para "arreglarla"
-- publicaría la lista de prospectos de Kawiil a todos los usuarios de todos los
-- clientes.
alter table prospect_intake enable row level security;
