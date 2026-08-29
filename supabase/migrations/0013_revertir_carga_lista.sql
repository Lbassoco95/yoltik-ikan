-- =====================================================================
-- Ikán · Migration 0013 · Revertir una carga de lista
-- =====================================================================
-- Corrige un hueco de la 0012.
--
-- Ahí `lista_movimiento` quedó inmutable ante UPDATE y ante DELETE. La
-- inmutabilidad es correcta —una bitácora de cumplimiento no se reescribe—
-- pero se pasó de largo: dejó SIN salida el caso de la carga equivocada.
-- Si un admin sube el archivo que no era, o captura un oficio con el RFC
-- mal, no había forma de deshacerlo. Y una consola de administración se
-- topa con eso el primer día.
--
-- La distinción que faltaba:
--
--   CORREGIR un hecho real  → movimiento contrario, con su oficio. La
--                             persona estuvo listada y dejó de estarlo; las
--                             dos cosas pasaron y las dos se conservan.
--
--   REVERTIR una carga      → la carga NUNCA debió existir (archivo
--     equivocada               equivocado, captura errónea). No hay hecho
--                             que conservar: hay un error de captura que
--                             borrar, dejando constancia de que se revirtió.
--
-- Sigue sin poderse editar un movimiento ni borrarlo suelto. Sólo se puede
-- revertir una carga COMPLETA, y sólo por la función de abajo, que deja el
-- rastro en `lista_carga`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La inmutabilidad se afina, no se quita
-- ---------------------------------------------------------------------
-- UPDATE: prohibido siempre, sin excepción.
-- DELETE: sólo si la carga ya está marcada 'revertida', que es lo que hace
--         `revertir_carga_lista()` antes de borrar. Nadie puede borrar un
--         movimiento por su cuenta sin pasar por ahí.
create or replace function public.lista_movimiento_inmutable()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_estado estado_carga_lista;
begin
  if tg_op = 'UPDATE' then
    raise exception
      'lista_movimiento no se edita. Para corregir un hecho real registra el movimiento contrario con su oficio; para deshacer una carga equivocada usa revertir_carga_lista().';
  end if;

  select estado into v_estado from lista_carga where id = old.carga_id;
  if v_estado is distinct from 'revertida' then
    raise exception
      'No se puede borrar un movimiento suelto. Para deshacer una carga equivocada usa revertir_carga_lista(%).', old.carga_id;
  end if;

  return old;
end
$$;

-- ---------------------------------------------------------------------
-- 2. Revertir una carga completa
-- ---------------------------------------------------------------------
-- Borra los movimientos de la carga y RECALCULA el estado vigente de cada
-- registro que tocaba, replicando los movimientos que quedan. No basta con
-- desactivar: si la carga equivocada dio de baja a alguien que seguía
-- bloqueado, revertirla tiene que devolverlo a bloqueado.
--
-- Un registro que sólo existía por esta carga se elimina: nunca debió
-- estar ahí.
create or replace function public.revertir_carga_lista(
  p_carga_id uuid,
  p_motivo text default null
)
returns table (registros_recalculados int, registros_eliminados int, movimientos_borrados int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_afectados uuid[];
  v_borrados int := 0;
  v_recalc int := 0;
  v_elim int := 0;
  v_reg uuid;
  v_ultimo record;
begin
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de Kawiil puede revertir una carga de lista.';
  end if;

  if not exists (select 1 from lista_carga where id = p_carga_id) then
    raise exception 'La carga % no existe.', p_carga_id;
  end if;

  -- Qué registros toca esta carga, antes de borrar nada.
  select coalesce(array_agg(distinct registro_id), '{}')
    into v_afectados
  from lista_movimiento
  where carga_id = p_carga_id and registro_id is not null;

  -- Marcar primero: es lo que autoriza el borrado en el trigger.
  update lista_carga
     set estado = 'revertida',
         notas = coalesce(notas, '') ||
                 ' · REVERTIDA ' || to_char(now(), 'YYYY-MM-DD HH24:MI') ||
                 coalesce(': ' || p_motivo, '')
   where id = p_carga_id;

  delete from lista_movimiento where carga_id = p_carga_id;
  get diagnostics v_borrados = row_count;

  -- Recalcular cada registro afectado con los movimientos que sobreviven.
  foreach v_reg in array v_afectados loop
    select m.accion, m.oficio_numero, m.oficio_fecha
      into v_ultimo
      from lista_movimiento m
     where m.registro_id = v_reg
     order by coalesce(m.oficio_fecha, m.aplicado_en::date) desc, m.aplicado_en desc
     limit 1;

    if not found then
      -- El registro sólo existía por la carga revertida.
      delete from lista_registro where id = v_reg;
      v_elim := v_elim + 1;
    else
      update lista_registro set
        activo = (v_ultimo.accion = 'alta'),
        alta_oficio = case when v_ultimo.accion = 'alta' then v_ultimo.oficio_numero else alta_oficio end,
        alta_fecha  = case when v_ultimo.accion = 'alta' then v_ultimo.oficio_fecha  else alta_fecha  end,
        baja_oficio = case when v_ultimo.accion = 'baja' then v_ultimo.oficio_numero else null end,
        baja_fecha  = case when v_ultimo.accion = 'baja' then v_ultimo.oficio_fecha  else null end,
        actualizado_en = now()
      where id = v_reg;
      v_recalc := v_recalc + 1;
    end if;
  end loop;

  -- El conteo de la carga revertida queda en cero.
  update lista_carga set num_movimientos = 0 where id = p_carga_id;

  return query select v_recalc, v_elim, v_borrados;
end
$$;

comment on function public.revertir_carga_lista(uuid, text) is
  'Deshace una carga equivocada: borra sus movimientos y recalcula el estado vigente con los que quedan. Deja constancia en lista_carga. No sustituye al movimiento contrario, que es para corregir hechos reales.';

-- Defensa en profundidad: la función ya verifica es_admin_kawiil() por dentro,
-- pero además se le quita el EXECUTE a PUBLIC. Los roles `anon` y
-- `authenticated` sólo existen en Supabase, así que se tocan sólo si están:
-- esta migration debe poder correrse también en un PostgreSQL limpio para
-- probarla antes de mandarla al remoto.
revoke all on function public.revertir_carga_lista(uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.revertir_carga_lista(uuid, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.revertir_carga_lista(uuid, text) to authenticated';
  end if;
end $$;
