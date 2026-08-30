-- =====================================================================
-- Ikán · ¿Qué falta correr en este proyecto de Supabase?
-- =====================================================================
-- Pégalo completo en el SQL Editor y córrelo. No escribe nada en el esquema.
--
-- Devuelve UNA sola tabla, a propósito: el SQL Editor de Supabase muestra
-- únicamente el resultado de la última consulta del script, así que un
-- diagnóstico repartido en varios SELECT deja ver sólo el último y parece que
-- lo demás no corrió.
--
-- Lee la columna `estado`: lo que diga FALTA se corre, en el orden de `orden`.
-- Todos los bundles son idempotentes; volver a correr uno no hace daño.
--
-- Nota técnica: la parte del detalle va por SQL dinámico porque PostgreSQL
-- resuelve los nombres de tabla al ANALIZAR la consulta, no al ejecutarla: un
-- `case when existe then (select de esa tabla) end` truena igual cuando la
-- tabla no está, que es justo el caso que hay que poder reportar.
-- =====================================================================

drop table if exists pg_temp.ikan_estado;
create temp table ikan_estado (
  seccion text,
  orden   int,
  concepto text,
  estado  text,
  accion  text
);

-- ---------------------------------------------------------------------
-- Migraciones 0011 a 0021
-- ---------------------------------------------------------------------
insert into ikan_estado
select '1 · Migraciones', orden, migration,
       case when aplicada then 'ya está' else 'FALTA' end,
       case when aplicada then '' else 'supabase/manual/' || bundle end
from (
  select c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'v_user_roles_simple') c,
lateral (values
  (11, '0011 · parámetros regulatorios (UMA y umbrales con vigencia)',
       to_regclass('public.parametro_regulatorio') is not null,
       'apply_0011_parametros.sql'),
  (12, '0012 · listas de plataforma (altas y bajas por oficio)',
       to_regclass('public.lista_movimiento') is not null,
       'apply_0012_listas.sql'),
  (13, '0013 · revertir carga de lista equivocada',
       to_regprocedure('public.revertir_carga_lista(uuid,text)') is not null,
       'apply_0013_revertir.sql'),
  (14, '0014 · situaciones del 69-B (sólo definitivo bloquea)',
       exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='lista_registro'
                  and column_name='situacion'),
       'apply_0014_situaciones.sql'),
  (15, '0015 · carga de archivo de listas (bajas por diferencia)',
       exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.proname='cerrar_carga_completa'),
       'apply_0015_carga_archivo.sql'),
  (16, '0016 · job con aprobación (el job propone, alguien dispone)',
       to_regclass('public.lista_carga_fila') is not null,
       'apply_0016_job_aprobacion.sql'),
  (17, '0017 · estado de listas para el cliente',
       to_regclass('public.v_listas_estado') is not null,
       'apply_0017_estado_listas.sql'),
  (18, '0018 · plan de trabajo del hallazgo (regla de los 15 días)',
       exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='hallazgo'
                  and column_name='fecha_compromiso'),
       'apply_0018_plan_trabajo.sql'),
  (19, '0019 · expediente del acto (instrumento, apellidos, claves)',
       exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='operation'
                  and column_name='instrumento_publico'),
       'apply_0019_expediente_acto.sql'),
  (20, '0020 · catálogos del layout (las claves del informe)',
       to_regclass('public.catalogo_sat') is not null,
       'apply_0020_catalogos.sql'),
  (21, '0021 · bitácora encadenada (cada paso con su hash)',
       to_regclass('public.evento_auditoria') is not null,
       'apply_0021_bitacora.sql'),
  (22, '0022 · cierre de fuga entre organizaciones (PRIORIDAD)',
       coalesce((select option_value from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), 'false') = 'true',
       'apply_0022_seguridad.sql'),
  -- La tabla ya existe en producción, así que su presencia no distingue si el
  -- bundle corrió. Lo que sí lo distingue es el comentario que pone: sólo lo
  -- escribe la 0023.
  (23, '0023 · prospect_intake (respaldo + cotejo con la base)',
       to_regclass('public.prospect_intake') is not null
         and obj_description('public.prospect_intake'::regclass, 'pg_class') is not null,
       'apply_0023_prospect_intake.sql')
) as m(orden, migration, aplicada, bundle);

-- ---------------------------------------------------------------------
-- Lo que puede estar a medias aunque la tabla exista
-- ---------------------------------------------------------------------
do $$
declare v_n bigint; v_t text;
begin
  if to_regclass('public.v_catalogos_estado') is null then
    insert into ikan_estado values ('2 · Datos', 1, 'catálogos con valores',
      'FALTA (la 0020 no está)', 'apply_0020_catalogos.sql carga 25 catálogos con 924 claves del SAT');
    insert into ikan_estado values ('2 · Datos', 2, 'códigos postales',
      'FALTA (la 0020 no está)', 'después de la 0020: cargar_cp_1.sql a cargar_cp_4.sql');
  else
    execute 'select count(*) from public.v_catalogos_estado where valores_vigentes > 0' into v_n;
    insert into ikan_estado values ('2 · Datos', 1, 'catálogos con valores',
      v_n || ' de 26', case when v_n >= 25 then '' else 'vuelve a correr apply_0020_catalogos.sql' end);

    execute $q$select coalesce(max(valores_vigentes),0) from public.v_catalogos_estado
              where codigo='codigos_postales_de_sepomex'$q$ into v_n;
    insert into ikan_estado values ('2 · Datos', 2, 'códigos postales',
      case when v_n > 0 then v_n || ' cargados' else 'FALTAN los 32,353' end,
      case when v_n > 0 then ''
           else 'consola con codigos_postales.csv, o cargar_cp_1.sql a cargar_cp_4.sql' end);
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='organizations'
                    and column_name='clave_actividad') then
    insert into ikan_estado values ('2 · Datos', 3, 'clave de actividad vulnerable',
      'FALTA (la 0019 no está)', 'FEP para la notaría, AVI para Ixim Pay; la siembra el bundle 0020');
  else
    execute 'select count(*) filter (where clave_actividad is not null) from organizations' into v_n;
    execute 'select count(*)::text from organizations' into v_t;
    insert into ikan_estado values ('2 · Datos', 3, 'clave de actividad vulnerable',
      v_n || ' de ' || v_t || ' organizaciones',
      'las otras dos claves del padrón las asigna el SAT: quedan en null a propósito');
  end if;

  if to_regprocedure('public.registrar_evento(uuid,text,text,uuid,jsonb,text,uuid,jsonb)') is null then
    insert into ikan_estado values ('3 · Seguridad', 1, 'funciones SECURITY DEFINER',
      'FALTA (la 0021 no está)', 'el bundle 0021 revoca registrar_evento y emitir_folio_hallazgo de PUBLIC');
  elsif has_function_privilege('authenticated',
          'public.registrar_evento(uuid,text,text,uuid,jsonb,text,uuid,jsonb)','execute') then
    insert into ikan_estado values ('3 · Seguridad', 1, 'funciones SECURITY DEFINER',
      'HUECO: un cliente puede fabricar eventos', 'vuelve a correr apply_0021_bitacora.sql');
  elsif to_regprocedure('public.emitir_folio_hallazgo(uuid)') is not null
        and has_function_privilege('authenticated','public.emitir_folio_hallazgo(uuid)','execute') then
    insert into ikan_estado values ('3 · Seguridad', 1, 'funciones SECURITY DEFINER',
      'HUECO: un cliente puede consumir folios ajenos', 'vuelve a correr apply_0021_bitacora.sql');
  else
    insert into ikan_estado values ('3 · Seguridad', 1, 'funciones SECURITY DEFINER', 'cerradas', '');
  end if;

  if to_regclass('public.cadena_auditoria') is null then
    insert into ikan_estado values ('3 · Seguridad', 2, 'cadenas de bitácora',
      'FALTA (la 0021 no está)', 'la cadena empieza el día que se aplica; no reescribe el pasado');
  else
    execute 'select count(*) from public.cadena_auditoria' into v_n;
    insert into ikan_estado values ('3 · Seguridad', 2, 'cadenas de bitácora', v_n || ' activa(s)', '');
  end if;

  -- Quién entra a la consola de plataforma
  if to_regclass('public.platform_admin') is null then
    insert into ikan_estado values ('4 · Consola', 1, 'administradores de plataforma',
      'FALTA la migration 0008', '');
  else
    execute 'select count(*) from public.platform_admin' into v_n;
    if v_n = 0 then
      insert into ikan_estado values ('4 · Consola', 1, 'administradores de plataforma',
        'NINGUNO: nadie puede entrar', 'supabase/manual/bootstrap_platform_admin.sql');
    else
      execute $q$
        insert into ikan_estado
        select '4 · Consola', 1, 'entra a la consola: ' || u.email,
               'sí, desde ' || to_char(pa.otorgado_en, 'DD/MM/YYYY'), ''
          from platform_admin pa join auth.users u on u.id = pa.user_id
      $q$;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Resumen arriba de todo, para no tener que leer la tabla entera
-- ---------------------------------------------------------------------
insert into ikan_estado
select '0 · Resumen', 1,
       case when count(*) = 0 then 'Todo aplicado de la 0011 a la 0023'
            else count(*) || ' migration(s) por correr' end,
       case when count(*) = 0 then 'al día' else 'empieza por la ' || min(orden) end,
       coalesce(string_agg(replace(accion, 'supabase/manual/', ''), ' → ' order by orden), '')
from ikan_estado
where seccion = '1 · Migraciones' and estado = 'FALTA';

-- ---------------------------------------------------------------------
-- El único resultado que el editor va a mostrar
-- ---------------------------------------------------------------------
select seccion, orden, concepto, estado, accion
from ikan_estado
order by seccion, orden;
