-- =====================================================================
-- 0026 · Anclaje externo de la bitácora (RCG0.B8.2)
-- =====================================================================
-- La bitácora encadenada (0021) prueba que nadie alteró un evento suelto.
-- NO prueba que Ikán no la reescribiera entera: es una cadena dentro de una
-- base que Ikán administra. Eso lo arregla publicar periódicamente la raíz
-- Merkle de los eventos donde ya no la podamos cambiar.
--
-- El ancla es OpenTimestamps sobre Bitcoin: sin llave que custodiar, sin
-- saldo, sin token, y verificable por cualquiera con un nodo de Bitcoin.
--
-- Qué sale de aquí hacia afuera: 32 bytes. Ni un dato personal, ni un
-- identificador de cliente, ni el número de eventos de nadie. El deber de
-- reserva del artículo 38 de la LFPIORPI y la prohibición de alertar hacen
-- que revelar que alguien fue reportado sea un delito, así que la raíz Merkle
-- es lo único que viaja.
--
-- Un anclaje NO es un evento de la bitácora. Si lo fuera, anclar cambiaría la
-- cabeza de la cadena y el siguiente anclaje tendría que anclar al anterior,
-- sin final. Los anclajes son una tabla aparte que apunta a la cadena.
-- =====================================================================

create extension if not exists btree_gist;

create table if not exists anclaje (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  -- Tramo de la cadena que este anclaje certifica, inclusive por los dos
  -- extremos. La secuencia 1 es el primer evento de cada organización.
  desde_secuencia bigint not null,
  hasta_secuencia bigint not null,

  -- SHA-256 de la raíz del árbol Merkle sobre los `cadena_hash` del tramo.
  -- Es lo que se estampa. 64 caracteres hex en minúscula.
  raiz_merkle text not null check (raiz_merkle ~ '^[0-9a-f]{64}$'),

  -- El eslabón en `hasta_secuencia`. Redundante con la raíz a propósito:
  -- permite comprobar de un vistazo que el anclaje corresponde a esta cadena
  -- y no a otra, sin recalcular el árbol.
  cadena_hash_final text not null check (cadena_hash_final ~ '^[0-9a-f]{64}$'),

  -- Por qué se ancló. 'cierre_periodo' es el forzado al cerrar un aviso: ese
  -- es el documento que se defiende ante la autoridad y dejarlo sin anclar
  -- hasta el día siguiente sería justo cuando más falta hace.
  motivo text not null check (motivo in ('diario', 'cierre_periodo', 'manual')),

  -- 'pendiente' = el calendario aceptó la raíz pero Bitcoin todavía no la
  -- confirma (tarda unas horas). 'confirmado' = la prueba ya apunta a un
  -- bloque. 'fallido' = el calendario no respondió; se reintenta.
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmado', 'fallido')),

  -- La prueba OpenTimestamps, tal cual. Es lo que se entrega a un tercero
  -- junto con el paquete de verificación; sin ella el anclaje es una promesa.
  ots bytea,
  calendarios text[] not null default '{}'::text[],

  bloque_btc bigint,
  fecha_bloque timestamptz,

  -- Por qué falló, cuando falló. En claro, para poder reintentar con criterio.
  detalle text,

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint anclaje_rango_valido check (hasta_secuencia >= desde_secuencia),
  constraint anclaje_desde_positivo check (desde_secuencia >= 1)
);

-- Los tramos de una organización no se solapan ni dejan huecos por accidente:
-- dos anclajes que cubrieran el mismo evento harían ambiguo cuál es la prueba.
alter table anclaje drop constraint if exists anclaje_sin_traslape;
alter table anclaje add constraint anclaje_sin_traslape
  exclude using gist (
    organization_id with =,
    int8range(desde_secuencia, hasta_secuencia, '[]') with &&
  );

create index if not exists idx_anclaje_org_hasta
  on anclaje(organization_id, hasta_secuencia desc);
create index if not exists idx_anclaje_pendientes
  on anclaje(estado, creado_en) where estado <> 'confirmado';

comment on table anclaje is
  'Raíces Merkle de tramos de la bitácora publicadas en Bitcoin vía OpenTimestamps. '
  'Ningún dato personal sale de aquí: sólo la raíz.';
comment on column anclaje.raiz_merkle is
  'Raíz del árbol Merkle sobre los cadena_hash de [desde_secuencia, hasta_secuencia].';
comment on column anclaje.ots is
  'Prueba OpenTimestamps. Se actualiza al "upgrade": pasa de la promesa del calendario '
  'a la ruta completa hasta un bloque de Bitcoin.';

-- =====================================================================
-- Inmutable en lo que importa
-- =====================================================================
-- El tramo y la raíz no se corrigen: un anclaje mal calculado se marca fallido
-- y se hace otro. Lo que sí cambia es la prueba, que madura de la promesa del
-- calendario a la ruta hasta el bloque.

create or replace function public.anclaje_solo_madura()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.desde_secuencia is distinct from old.desde_secuencia
     or new.hasta_secuencia is distinct from old.hasta_secuencia
     or new.raiz_merkle is distinct from old.raiz_merkle
     or new.cadena_hash_final is distinct from old.cadena_hash_final
     or new.creado_en is distinct from old.creado_en then
    raise exception
      'Un anclaje no se corrige: el tramo y la raíz son inmutables. '
      'Si está mal, márcalo fallido y crea otro.';
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_anclaje_solo_madura on anclaje;
create trigger trg_anclaje_solo_madura
  before update on anclaje
  for each row execute function public.anclaje_solo_madura();

create or replace function public.anclaje_sin_borrado()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Un anclaje no se borra: es la prueba de que la bitácora no cambió.';
end;
$$;

drop trigger if exists trg_anclaje_sin_borrado on anclaje;
create trigger trg_anclaje_sin_borrado
  before delete on anclaje
  for each row execute function public.anclaje_sin_borrado();

-- =====================================================================
-- Qué falta por anclar
-- =====================================================================

-- Devuelve el tramo pendiente de una organización. `hasta` = 0 significa que
-- no hay nada nuevo que anclar; quien llama no debe crear un anclaje vacío.
create or replace function public.rango_por_anclar(p_organization_id uuid)
returns table (desde bigint, hasta bigint)
language sql
stable
-- SIN security definer a propósito: recibe un organization_id arbitrario, y
-- con definer cualquiera podría preguntar cuántos eventos lleva otra
-- organización. Con invoker, la RLS de cadena_auditoria devuelve cero filas a
-- quien no es de esa organización. La Edge Function usa service_role, que no
-- pasa por RLS.
set search_path = ''
as $$
  select
    coalesce(max(a.hasta_secuencia), 0) + 1 as desde,
    coalesce(c.ultima_secuencia, 0) as hasta
  from public.cadena_auditoria c
  left join public.anclaje a on a.organization_id = c.organization_id
  where c.organization_id = p_organization_id
  group by c.ultima_secuencia;
$$;

comment on function public.rango_por_anclar(uuid) is
  'Tramo de la bitácora todavía sin ancla. hasta < desde = no hay nada nuevo.';

-- Estado del anclaje, para la pantalla de integridad. Con security_invoker
-- para que la RLS de `anclaje` decida quién ve qué, y no la vista.
drop view if exists v_anclaje_estado;
create view v_anclaje_estado with (security_invoker = true) as
select
  c.organization_id,
  c.ultima_secuencia,
  a.id                 as ultimo_anclaje_id,
  a.hasta_secuencia    as anclado_hasta,
  a.raiz_merkle,
  a.estado,
  a.motivo,
  a.bloque_btc,
  a.fecha_bloque,
  a.creado_en          as anclado_en,
  -- Eventos que todavía no tienen ancla que los respalde. Es la ventana en la
  -- que una manipulación no tendría nada que la contradiga.
  greatest(c.ultima_secuencia - coalesce(a.hasta_secuencia, 0), 0) as eventos_sin_anclar
from public.cadena_auditoria c
left join lateral (
  select * from public.anclaje x
  where x.organization_id = c.organization_id
  order by x.hasta_secuencia desc
  limit 1
) a on true;

comment on view v_anclaje_estado is
  'Cabeza de la cadena frente al último anclaje. eventos_sin_anclar es la ventana '
  'sin cobertura externa.';

-- =====================================================================
-- RLS
-- =====================================================================
-- Lee quien puede leer la bitácora: OC y Admin de la organización, más
-- Kawiil. ESCRIBE NADIE: el anclaje lo crea la Edge Function programada con
-- service_role, que no pasa por RLS. Ninguna política de insert o update es
-- deliberado — si alguien "arregla" esto con `using (true)`, cualquier usuario
-- podría fabricar un ancla y el ejercicio entero deja de probar nada.

alter table anclaje enable row level security;

drop policy if exists "anclaje_select" on anclaje;
create policy "anclaje_select" on anclaje
  for select using (
    (organization_id = public.current_org_id()
      and (public.has_rol('oc') or public.has_rol('admin')))
    or public.es_admin_kawiil()
  );

-- PostgreSQL otorga EXECUTE a PUBLIC en cada función nueva, y Supabase además
-- lo otorga a anon/authenticated/service_role por ALTER DEFAULT PRIVILEGES.
-- Los triggers no se llaman a mano; se cierra el acceso directo.
revoke all on function public.anclaje_solo_madura() from public, anon, authenticated;
revoke all on function public.anclaje_sin_borrado() from public, anon, authenticated;
