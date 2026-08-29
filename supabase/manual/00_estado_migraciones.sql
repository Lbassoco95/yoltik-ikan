-- =====================================================================
-- Ikán · ¿Qué falta correr en este proyecto de Supabase?
-- =====================================================================
-- Pega ESTE archivo primero en el SQL Editor. No escribe nada: sólo mira el
-- esquema y te dice, migration por migration, si ya está aplicada y cuál es
-- el archivo que hay que correr si no.
--
-- Corre los pendientes en el orden de la columna `orden`, de arriba abajo.
-- Todos los bundles son idempotentes: si uno ya estaba, volver a correrlo no
-- hace daño.
-- =====================================================================

with revision(orden, migration, que_hace, aplicada, bundle) as (
  values
    (11, '0011 · parámetros regulatorios',
         'UMA y umbrales con vigencia',
         to_regclass('public.parametro_regulatorio') is not null,
         'supabase/manual/apply_0011_parametros.sql'),

    (12, '0012 · listas de plataforma',
         'altas y bajas por oficio, bitácora inmutable',
         to_regclass('public.lista_movimiento') is not null,
         'supabase/manual/apply_0012_listas.sql'),

    (13, '0013 · revertir carga de lista',
         'deshacer una carga equivocada',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'revertir_carga_lista'),
         'supabase/manual/apply_0013_revertir.sql'),

    (14, '0014 · situaciones del 69-B',
         'las cuatro situaciones; sólo definitivo bloquea',
         exists (select 1 from information_schema.columns
                  where table_name = 'lista_registro' and column_name = 'situacion'),
         'supabase/manual/apply_0014_situaciones.sql'),

    (15, '0015 · carga de archivo de listas',
         'snapshot completo con bajas por diferencia',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'cerrar_carga_completa'),
         'supabase/manual/apply_0015_carga_archivo.sql'),

    (16, '0016 · job con aprobación',
         'el job propone, una persona dispone',
         to_regclass('public.lista_carga_fila') is not null,
         'supabase/manual/apply_0016_job_aprobacion.sql'),

    (17, '0017 · estado de listas para el cliente',
         'el cliente ve la fecha de actualización sin ver las cargas',
         to_regclass('public.v_listas_estado') is not null,
         'supabase/manual/apply_0017_estado_listas.sql'),

    (18, '0018 · plan de trabajo del hallazgo',
         'fecha compromiso, regla de los 15 días, rezago por silencio',
         exists (select 1 from information_schema.columns
                  where table_name = 'hallazgo' and column_name = 'fecha_compromiso'),
         'supabase/manual/apply_0018_plan_trabajo.sql'),

    (19, '0019 · expediente del acto',
         'instrumento público, apellidos por separado, claves del padrón',
         exists (select 1 from information_schema.columns
                  where table_name = 'operation' and column_name = 'instrumento_publico'),
         'supabase/manual/apply_0019_expediente_acto.sql'),

    (20, '0020 · catálogos del layout',
         'las claves con las que se manda el informe',
         to_regclass('public.catalogo_sat') is not null,
         'supabase/manual/apply_0020_catalogos.sql'),

    (21, '0021 · bitácora encadenada',
         'cada paso encadenado por hashes, verificable',
         to_regclass('public.evento_auditoria') is not null,
         'supabase/manual/apply_0021_bitacora.sql')
)
select
  orden,
  migration,
  case when aplicada then 'ya está' else 'FALTA' end as estado,
  que_hace,
  case when aplicada then '' else bundle end as correr
from revision
order by orden;

-- =====================================================================
-- Segunda mirada: cosas que pueden estar a medias aunque la tabla exista
-- =====================================================================
select * from (
  select 1 as orden,
         'catálogos con valores cargados' as revisar,
         case
           when to_regclass('public.catalogo_sat') is null then 'la 0020 ni siquiera está'
           else (select count(*)::text || ' de 26'
                   from public.v_catalogos_estado where valores_vigentes > 0)
         end as estado,
         'esperado: 25 de 26 tras el bundle 0020; 26 tras cargar códigos postales' as nota

  union all
  select 2,
         'códigos postales',
         case
           when to_regclass('public.catalogo_sat') is null then '—'
           when (select coalesce(max(valores_vigentes), 0) from public.v_catalogos_estado
                  where codigo = 'codigos_postales_de_sepomex') > 0
             then 'cargado'
           else 'FALTA — 32,353 valores'
         end,
         'se cargan aparte: ver supabase/manual/cargar_cp_1.sql a cargar_cp_4.sql'

  union all
  select 3,
         'clave de actividad de las organizaciones',
         case
           when to_regclass('public.catalogo_sat') is null then '—'
           else (select count(*) filter (where clave_actividad is not null)::text
                   || ' de ' || count(*)::text || ' organizaciones'
                   from organizations)
         end,
         'FEP para la notaría, AVI para Ixim Pay. Las otras dos claves del padrón las asigna el SAT'

  union all
  select 4,
         'funciones SECURITY DEFINER abiertas a los clientes',
         case
           when to_regclass('public.evento_auditoria') is null then 'la 0021 no está'
           when has_function_privilege('authenticated',
                  'public.registrar_evento(uuid,text,text,uuid,jsonb,text,uuid,jsonb)', 'execute')
             then 'HUECO ABIERTO: un cliente puede fabricar eventos'
           when has_function_privilege('authenticated', 'public.emitir_folio_hallazgo(uuid)', 'execute')
             then 'HUECO ABIERTO: un cliente puede consumir folios ajenos'
           else 'cerradas'
         end,
         'PostgreSQL las abre a PUBLIC por omisión; el bundle 0021 las revoca'

  union all
  select 5,
         'cadenas de bitácora activas',
         case
           when to_regclass('public.cadena_auditoria') is null then 'la 0021 no está'
           else (select count(*)::text from public.cadena_auditoria)
         end,
         'una por organización con actividad, más la de plataforma'
) t order by orden;
