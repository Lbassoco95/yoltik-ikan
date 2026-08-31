-- =====================================================================
-- 0027 · Que Kawiil pueda ver a sus prospectos (D-2)
-- =====================================================================
-- Desde la migration 0023 el formulario público escribe en `prospect_intake`
-- y la tabla quedó con RLS activo y CERO políticas, a propósito: la escribe la
-- Edge Function con service_role y nadie más debía leerla.
--
-- El efecto no previsto es que tampoco puede leerla KAWIIL. Quien llena el
-- formulario del sitio entra a la base y NADIE lo ve nunca. Un embudo comercial
-- que no se puede consultar es lo mismo que no tenerlo.
--
-- Se abre exactamente una puerta: lectura para administradores de plataforma.
-- No se abre para las organizaciones cliente, y ahí el comentario de la 0023
-- sigue vigente palabra por palabra: son datos de contacto de prospectos
-- —nombre, correo, teléfono y qué tan avanzado va su cumplimiento— que no le
-- tocan a ningún cliente de Ikán.
--
-- Y se abre SÓLO lectura. Marcar un prospecto como atendido se hace con una
-- función acotada, no dándole `update` a la tabla: con update abierto, un
-- administrador podría reescribir el nombre o el correo con el que alguien se
-- registró, y ese dato es la constancia de lo que la persona escribió.
-- =====================================================================

-- Explícito, sin depender del ALTER DEFAULT PRIVILEGES de Supabase: lo que
-- protege la tabla tiene que ser la política de abajo, no el azar de que a
-- alguien se le olvidara un GRANT. Con RLS activo, el GRANT por sí solo no
-- abre nada.
grant select on prospect_intake to authenticated;

drop policy if exists "prospect_intake_select_kawiil" on prospect_intake;
create policy "prospect_intake_select_kawiil" on prospect_intake
  for select using (public.es_admin_kawiil());

comment on table prospect_intake is
  'Prospectos que llenan el formulario público. La escribe la Edge Function '
  'on-prospect-intake con service_role. Sólo LECTURA para administradores de '
  'plataforma (migration 0027); ninguna organización cliente la ve.';

-- ---------------------------------------------------------------------
-- Estado del prospecto, sin poder tocar lo que la persona escribió
-- ---------------------------------------------------------------------
-- `status` nace en 'nuevo' (migration 0023). Los demás valores no estaban
-- acotados en ninguna parte, así que se fijan aquí antes de que la pantalla
-- empiece a escribirlos y cada quien invente el suyo.

create or replace function public.marcar_prospecto(
  p_id uuid,
  p_status text,
  p_notas text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de plataforma puede mover un prospecto.';
  end if;

  if p_status not in ('nuevo', 'contactado', 'en_diagnostico', 'cliente', 'descartado') then
    raise exception 'Estado "%" no válido para un prospecto.', p_status;
  end if;

  update public.prospect_intake
     set status = p_status,
         -- Las notas se AÑADEN, no se sustituyen: son el historial de lo que
         -- se habló con esa persona, y perderlo al escribir la siguiente sería
         -- perder el motivo por el que el prospecto está donde está.
         notas = case
                   when p_notas is null or btrim(p_notas) = '' then notas
                   when notas is null or btrim(notas) = '' then p_notas
                   else notas || E'\n---\n' || p_notas
                 end,
         updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'No existe el prospecto %.', p_id;
  end if;
end;
$$;

comment on function public.marcar_prospecto(uuid, text, text) is
  'Mueve un prospecto de estado y le añade una nota. Acotada a propósito: con '
  'un update abierto se podría reescribir el nombre o el correo con el que '
  'alguien se registró, y eso es la constancia de lo que esa persona escribió.';

-- PostgreSQL otorga EXECUTE a PUBLIC en cada función nueva, y Supabase además
-- lo da directo a anon/authenticated por ALTER DEFAULT PRIVILEGES. La función
-- comprueba el privilegio por dentro, pero no hay razón para dejarla al
-- alcance de quien no es de Kawiil.
revoke all on function public.marcar_prospecto(uuid, text, text) from public, anon;

-- ---------------------------------------------------------------------
-- Resumen del embudo
-- ---------------------------------------------------------------------
-- Con security_invoker para que la RLS de arriba decida quién lo ve, y no la
-- vista. Sin él, cualquiera con acceso a la vista vería el conteo de
-- prospectos de Kawiil.
drop view if exists v_prospectos_resumen;
create view v_prospectos_resumen with (security_invoker = true) as
select
  coalesce(status, 'nuevo') as status,
  count(*)                  as cuantos,
  max(created_at)           as mas_reciente
from public.prospect_intake
group by coalesce(status, 'nuevo');

comment on view v_prospectos_resumen is
  'Cuántos prospectos hay en cada estado. Sólo la ve Kawiil, por la RLS de la tabla.';
