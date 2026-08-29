-- =====================================================================
-- Ikán · Aplicación manual · Migration 0017 (estado de listas, cliente)
-- =====================================================================
-- La pantalla de Listas del sujeto obligado necesita saber CUÁNDO se
-- actualizó cada lista, pero esa fecha vive en `lista_carga`, que es
-- invisible para un cliente y debe seguir siéndolo.
--
-- Esta vista expone sólo el agregado: fecha de la fuente y conteos. Ninguna
-- fila de carga, ni quién la hizo, ni el archivo, ni las revertidas.
--
-- Transaccional e idempotente. REQUISITO: la 0014 aplicada.
-- =====================================================================

begin;

-- =====================================================================
-- Ikán · Migration 0017 · Estado de las listas para la organización cliente
-- =====================================================================
-- La pantalla de Listas del sujeto obligado necesita responder dos cosas:
-- qué listas se están consultando, y CUÁNDO se actualizó cada una. Lo segundo
-- importa tanto como lo primero: una lista de sanciones sin fecha no dice si
-- el barrido de hoy vale.
--
-- El problema: esa fecha vive en `lista_carga`, que por RLS es invisible para
-- un cliente —y debe seguir siéndolo, porque expone la operación interna de
-- Kawiil: quién cargó, con qué archivo, qué se revirtió y por qué.
--
-- Solución: una vista que expone SÓLO el agregado que el cliente necesita.
-- Va deliberadamente SIN `security_invoker`, o sea que corre con los permisos
-- de su dueño y puede leer `lista_carga` aunque quien consulta no pueda.
--
-- Es la ÚNICA excepción de este tipo en el proyecto y por eso se argumenta:
--   · No expone ninguna fila de carga, ni quién la hizo, ni el archivo, ni
--     las revertidas o descartadas. Sólo una fecha y un conteo por fuente.
--   · Es exactamente lo que el sujeto obligado necesita para sostener que su
--     barrido se hizo contra una versión vigente.
--   · Sin ella, la alternativa sería duplicar la fecha en otra tabla, que es
--     el problema que esta migration entera existe para evitar.
-- =====================================================================

create or replace view v_listas_estado as
  select
    f.codigo,
    f.nombre,
    f.autoridad,
    f.naturaleza,
    f.modo_actualizacion,
    f.url_oficial,
    f.obligatoria,
    f.situaciones,
    f.situaciones_bloqueantes,

    -- Cuándo se actualizó, según la FUENTE, no según cuándo lo cargó Kawiil.
    -- Sólo cuenta lo efectivamente aplicado: un borrador sin aprobar o una
    -- carga revertida no actualizaron nada y no deben aparentar que sí.
    (select max(coalesce(c.fecha_publicacion_fuente, c.cargada_en::date))
       from lista_carga c
      where c.fuente_id = f.id and c.estado = 'aplicada') as actualizada_al,

    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo) as registros_vigentes,

    -- Cuántos exigen acción, separado de los que sólo informan (un presunto
    -- del 69-B cuenta en el total pero no bloquea).
    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo
        and (f.situaciones_bloqueantes is null
             or r.situacion is null
             or r.situacion = any (f.situaciones_bloqueantes))) as registros_bloqueantes
  from lista_fuente f
  where f.activa;

comment on view v_listas_estado is
  'Estado de cada lista para la organización cliente: fecha de la fuente y conteos. Sin security_invoker a propósito, para exponer la fecha sin exponer las cargas. No revela ninguna fila de lista_carga.';

grant select on v_listas_estado to authenticated;

commit;

-- =====================================================================
-- Verificación
-- =====================================================================
-- Se agregó después: este bundle terminaba sin decir nada y no había forma de
-- saber si había corrido. Devuelve UNA tabla, porque el SQL Editor de Supabase
-- sólo muestra el resultado de la última consulta.
select 'v_listas_estado' as objeto,
       case when to_regclass('public.v_listas_estado') is not null
            then 'creada' else 'FALTA' end as estado,
       'el cliente ve la fecha de actualización sin ver las cargas' as para_que
union all
select 'permiso de lectura',
       case when has_table_privilege('authenticated', 'public.v_listas_estado', 'select')
            then 'otorgado' else 'FALTA' end,
       'sin esto la pantalla de Listas del cliente se queda en blanco';
