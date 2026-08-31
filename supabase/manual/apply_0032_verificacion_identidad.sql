-- =====================================================================
-- Ikán · Aplicar migration 0032 en el SQL Editor / API de gestión
-- =====================================================================
-- Crea la tabla donde vive el rastro de las verificaciones de identidad con
-- Didit. No toca datos existentes ni depende de que Didit esté configurado:
-- puede aplicarse antes de desplegar las Edge Functions.
--
-- Idempotente y en transacción.
-- =====================================================================

begin;

-- =====================================================================
-- 0032 · Verificación de identidad del compareciente (Didit)
-- =====================================================================
-- El notario da de alta a un compareciente y necesita verificar que es quien
-- dice ser. Hoy eso es un campo de texto y la palabra de quien capturó.
--
-- Didit corre el KYC —documento, prueba de vida, cotejo facial— en su propio
-- flujo alojado, y avisa por webhook. Aquí vive el rastro: a quién se le pidió,
-- por dónde se le mandó, en qué quedó y cuándo.
--
-- QUÉ SE GUARDA, Y SOBRE TODO QUÉ NO
--
-- No se guarda la decisión completa de Didit. Esa carga trae fotografía del
-- documento, imagen de referencia de la prueba de vida y, en flujos activos,
-- vídeo: biometría, que es dato personal sensible. Copiarla a nuestra base
-- multiplica dónde vive sin que nadie lo haya pedido, y la conservación de la
-- fracción XII pasó a DIEZ AÑOS: lo que se guarde hoy se guarda una década.
--
-- Se guarda lo que hace falta para operar y para probar que la verificación
-- ocurrió: el identificador de la sesión en Didit, el estado, qué módulos
-- corrieron y con qué resultado, y el nombre y tipo de documento que el
-- proveedor leyó. Las imágenes se quedan en Didit, que es donde el usuario
-- consintió que estuvieran, y se consultan allá cuando hagan falta.
--
-- TODO[Kawiil-Cumplimiento]: falta la determinación de si este KYC sustituye,
-- complementa o sólo apoya la integración del expediente único del art. 18, y
-- qué debe conservarse diez años. Mientras no exista, esta tabla NO afirma que
-- el cliente esté «identificado» en el sentido de la Ley: dice que se verificó
-- su identidad con un proveedor, que es un hecho distinto y menor. Ampliar
-- después es fácil; borrar datos personales que ya se guardaron, no.
-- =====================================================================

do $$ begin
  create type estado_verificacion as enum (
    'no_iniciada',   -- Not Started
    'en_progreso',   -- In Progress / Awaiting User
    'en_revision',   -- In Review
    'aprobada',      -- Approved
    'rechazada',     -- Declined
    'reenviada',     -- Resubmitted
    'abandonada',    -- Abandoned
    'expirada',      -- Expired / Kyc Expired
    'error'          -- la sesión no se pudo crear
  );
exception when duplicate_object then null; end $$;

create table if not exists verificacion_identidad (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete cascade,

  -- Lo que devuelve Didit al crear la sesión. `session_id` es la llave para
  -- consultar allá; `url` es lo que se le manda al compareciente.
  didit_session_id text not null unique,
  didit_workflow_id text,
  url text not null,

  estado estado_verificacion not null default 'no_iniciada',

  -- Cómo se le hizo llegar. En una notaría el caso más común es que el
  -- compareciente esté ahí mismo, así que 'presencial' no es un caso raro.
  canal text not null check (canal in ('correo', 'liga', 'presencial')),
  enviado_a text,   -- correo o teléfono, según el canal. Null en presencial.

  -- Resumen de lo que Didit resolvió. NO la decisión completa: ver la nota de
  -- arriba. Lo que cabe aquí es qué módulos corrieron y con qué resultado, sin
  -- imágenes ni biometría.
  resumen jsonb not null default '{}'::jsonb,

  solicitada_por uuid references auth.users(id),
  solicitada_en timestamptz not null default now(),
  resuelta_en timestamptz,

  -- Del webhook, para no procesar dos veces la misma entrega.
  ultimo_evento_id text
);

comment on table verificacion_identidad is
  'Verificaciones de identidad de comparecientes con Didit. Guarda el rastro y '
  'un resumen del resultado, NO la decisión completa: esa trae biometría y se '
  'queda en el proveedor.';
comment on column verificacion_identidad.resumen is
  'Qué módulos corrieron y con qué resultado. Sin imágenes, sin vídeo, sin '
  'datos biométricos.';

create index if not exists idx_verificacion_cliente
  on verificacion_identidad(client_id, solicitada_en desc);
create index if not exists idx_verificacion_org_estado
  on verificacion_identidad(organization_id, estado);

-- ---------------------------------------------------------------------
-- RLS: cada organización ve las suyas y nada más
-- ---------------------------------------------------------------------
alter table verificacion_identidad enable row level security;

drop policy if exists "verificacion_select_org" on verificacion_identidad;
create policy "verificacion_select_org" on verificacion_identidad
  for select using (
    organization_id = public.current_org_id() or public.es_admin_kawiil()
  );

-- Sin políticas de escritura, a propósito. Las filas las crea la Edge Function
-- `didit-crear-sesion` y las actualiza `didit-webhook`, las dos con
-- service_role. Con un `update` abierto desde la aplicación se podría marcar
-- una verificación como aprobada sin que nadie la hubiera hecho, que es
-- exactamente lo que esta tabla existe para impedir.
revoke insert, update, delete on verificacion_identidad from authenticated, anon;

-- ---------------------------------------------------------------------
-- El estado más reciente por cliente, que es lo que la pantalla necesita
-- ---------------------------------------------------------------------
drop view if exists v_verificacion_vigente;
create view v_verificacion_vigente with (security_invoker = true) as
select distinct on (client_id)
  client_id, organization_id, id as verificacion_id, didit_session_id,
  estado, canal, enviado_a, resumen, solicitada_en, resuelta_en
from verificacion_identidad
order by client_id, solicitada_en desc;

comment on view v_verificacion_vigente is
  'La última verificación de cada compareciente. security_invoker: la RLS de la '
  'tabla decide quién la ve.';


-- =====================================================================
-- Verificación
-- =====================================================================
do $$
declare v_n bigint;
begin
  if to_regclass('public.verificacion_identidad') is null then
    raise exception 'FALLA 1: no se creó verificacion_identidad';
  end if;

  -- 2. Una sola política y de SELECT. Es la comprobación que importa: con una
  --    de escritura, cualquiera podría marcar una verificación como aprobada
  --    sin que nadie la hubiera hecho.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'verificacion_identidad' and cmd <> 'SELECT';
  if v_n > 0 then
    raise exception 'FALLA 2: % política(s) de escritura en verificacion_identidad', v_n;
  end if;

  -- 3. Y el GRANT tampoco: en Supabase el ALTER DEFAULT PRIVILEGES abre las
  --    tablas nuevas a authenticated por su cuenta.
  if has_table_privilege('authenticated', 'public.verificacion_identidad', 'insert')
     or has_table_privilege('authenticated', 'public.verificacion_identidad', 'update')
     or has_table_privilege('authenticated', 'public.verificacion_identidad', 'delete') then
    raise exception 'FALLA 3: authenticated puede escribir en verificacion_identidad';
  end if;

  -- 4. La vista respeta la RLS de quien consulta.
  if not exists (select 1 from pg_class
                  where relname = 'v_verificacion_vigente'
                    and reloptions::text like '%security_invoker=true%') then
    raise exception 'FALLA 4: v_verificacion_vigente sin security_invoker';
  end if;

  -- 5. Las cadenas siguen íntegras.
  select count(*) into v_n from public.cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  if v_n <> 0 then raise exception 'FALLA 5: % cadena(s) rota(s)', v_n; end if;
end $$;

select 'verificación de identidad (Didit)' as bundle,
       (select count(*)::text from public.verificacion_identidad)
         || ' verificación(es) registradas' as datos,
       'sólo lectura por organización; escribe la Edge Function' as rls,
       '5 comprobaciones pasaron' as verificacion,
       'Falta: desplegar didit-crear-sesion y didit-webhook con sus secretos' as siguiente_paso;

commit;
