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
--
-- Nota técnica: la segunda parte va por SQL dinámico a propósito. PostgreSQL
-- resuelve los nombres de tabla al ANALIZAR la consulta, no al ejecutarla, así
-- que un `case when existe then (select de esa tabla) end` truena igual cuando
-- la tabla no existe — que es justamente el caso que este diagnóstico tiene que
-- poder reportar.
-- =====================================================================

with revision(orden, migration, que_hace, aplicada, bundle) as (
  values
    (11, '0011 · parámetros regulatorios',
         'UMA y umbrales con vigencia',
         to_regclass('public.parametro_regulatorio') is not null,
         'apply_0011_parametros.sql'),

    (12, '0012 · listas de plataforma',
         'altas y bajas por oficio, bitácora inmutable',
         to_regclass('public.lista_movimiento') is not null,
         'apply_0012_listas.sql'),

    (13, '0013 · revertir carga de lista',
         'deshacer una carga equivocada',
         to_regprocedure('public.revertir_carga_lista(uuid,text)') is not null,
         'apply_0013_revertir.sql'),

    (14, '0014 · situaciones del 69-B',
         'las cuatro situaciones; sólo definitivo bloquea',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'lista_registro'
                    and column_name = 'situacion'),
         'apply_0014_situaciones.sql'),

    (15, '0015 · carga de archivo de listas',
         'snapshot completo con bajas por diferencia',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'cerrar_carga_completa'),
         'apply_0015_carga_archivo.sql'),

    (16, '0016 · job con aprobación',
         'el job propone, una persona dispone',
         to_regclass('public.lista_carga_fila') is not null,
         'apply_0016_job_aprobacion.sql'),

    (17, '0017 · estado de listas para el cliente',
         'el cliente ve la fecha de actualización sin ver las cargas',
         to_regclass('public.v_listas_estado') is not null,
         'apply_0017_estado_listas.sql'),

    (18, '0018 · plan de trabajo del hallazgo',
         'fecha compromiso, regla de los 15 días, rezago por silencio',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hallazgo'
                    and column_name = 'fecha_compromiso'),
         'apply_0018_plan_trabajo.sql'),

    (19, '0019 · expediente del acto',
         'instrumento público, apellidos por separado, claves del padrón',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'operation'
                    and column_name = 'instrumento_publico'),
         'apply_0019_expediente_acto.sql'),

    (20, '0020 · catálogos del layout',
         'las claves con las que se manda el informe',
         to_regclass('public.catalogo_sat') is not null,
         'apply_0020_catalogos.sql'),

    (21, '0021 · bitácora encadenada',
         'cada paso encadenado por hashes, verificable',
         to_regclass('public.evento_auditoria') is not null,
         'apply_0021_bitacora.sql')
)
select
  orden,
  migration,
  case when aplicada then 'ya está' else 'FALTA' end as estado,
  que_hace,
  case when aplicada then '' else 'supabase/manual/' || bundle end as correr
from revision
order by orden;

-- =====================================================================
-- Segunda parte: cosas que pueden estar a medias aunque la tabla exista
-- =====================================================================
drop table if exists pg_temp.estado_detalle;
create temp table estado_detalle (orden int, revisar text, estado text, nota text);

do $$
declare
  v_txt text;
  v_n bigint;
begin
  -- Catálogos con valores cargados
  if to_regclass('public.v_catalogos_estado') is null then
    insert into estado_detalle values
      (1, 'catálogos con valores cargados', 'la 0020 todavía no está',
          'corre apply_0020_catalogos.sql: registra 26 catálogos y carga 25 con 924 claves del SAT');
  else
    execute 'select count(*) from public.v_catalogos_estado where valores_vigentes > 0' into v_n;
    insert into estado_detalle values
      (1, 'catálogos con valores cargados', v_n || ' de 26',
          'esperado: 25 tras el bundle 0020; 26 tras cargar los códigos postales');
  end if;

  -- Códigos postales
  if to_regclass('public.v_catalogos_estado') is null then
    insert into estado_detalle values (2, 'códigos postales', '—', 'depende de la 0020');
  else
    execute $q$select coalesce(max(valores_vigentes), 0) from public.v_catalogos_estado
              where codigo = 'codigos_postales_de_sepomex'$q$ into v_n;
    insert into estado_detalle values
      (2, 'códigos postales',
          case when v_n > 0 then v_n || ' cargados' else 'FALTAN los 32,353' end,
          'consola de plataforma con codigos_postales.csv, o cargar_cp_1.sql a cargar_cp_4.sql');
  end if;

  -- Clave de actividad vulnerable de las organizaciones
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'organizations'
                    and column_name = 'clave_actividad') then
    insert into estado_detalle values
      (3, 'clave de actividad de las organizaciones', 'la 0019 todavía no está',
          'FEP para la notaría, AVI para Ixim Pay; la siembra el bundle 0020');
  else
    execute 'select count(*) filter (where clave_actividad is not null) from organizations' into v_n;
    execute 'select count(*)::text from organizations' into v_txt;
    insert into estado_detalle values
      (3, 'clave de actividad de las organizaciones', v_n || ' de ' || v_txt || ' organizaciones',
          'las otras dos claves del padrón las asigna el SAT: se quedan en null a propósito');
  end if;

  -- Funciones SECURITY DEFINER que PostgreSQL deja abiertas a PUBLIC
  if to_regprocedure('public.registrar_evento(uuid,text,text,uuid,jsonb,text,uuid,jsonb)') is null then
    insert into estado_detalle values
      (4, 'funciones SECURITY DEFINER abiertas a los clientes', 'la 0021 todavía no está',
          'el bundle 0021 revoca registrar_evento y emitir_folio_hallazgo de PUBLIC');
  elsif has_function_privilege('authenticated',
          'public.registrar_evento(uuid,text,text,uuid,jsonb,text,uuid,jsonb)', 'execute') then
    insert into estado_detalle values
      (4, 'funciones SECURITY DEFINER abiertas a los clientes',
          'HUECO ABIERTO: un cliente puede fabricar eventos',
          'vuelve a correr apply_0021_bitacora.sql');
  elsif to_regprocedure('public.emitir_folio_hallazgo(uuid)') is not null
        and has_function_privilege('authenticated', 'public.emitir_folio_hallazgo(uuid)', 'execute') then
    insert into estado_detalle values
      (4, 'funciones SECURITY DEFINER abiertas a los clientes',
          'HUECO ABIERTO: un cliente puede consumir folios ajenos',
          'vuelve a correr apply_0021_bitacora.sql');
  else
    insert into estado_detalle values
      (4, 'funciones SECURITY DEFINER abiertas a los clientes', 'cerradas',
          'PostgreSQL las abre a PUBLIC por omisión; el bundle 0021 las revoca');
  end if;

  -- Cadenas de bitácora
  if to_regclass('public.cadena_auditoria') is null then
    insert into estado_detalle values
      (5, 'cadenas de bitácora activas', 'la 0021 todavía no está',
          'la cadena empieza el día que se aplica; no reescribe la historia anterior');
  else
    execute 'select count(*) from public.cadena_auditoria' into v_n;
    insert into estado_detalle values
      (5, 'cadenas de bitácora activas', v_n::text,
          'una por organización con actividad, más la de plataforma');
  end if;

  -- Administradores de plataforma: sin esto no se entra a la consola de Kawiil
  if to_regclass('public.platform_admin') is null then
    insert into estado_detalle values
      (6, 'administradores de plataforma', 'falta la 0008',
          'sin esta tabla no hay consola');
  else
    execute 'select count(*) from public.platform_admin' into v_n;
    insert into estado_detalle values
      (6, 'administradores de plataforma',
          case when v_n = 0 then 'NINGUNO: nadie puede entrar a la consola' else v_n || ' usuario(s)' end,
          'se otorga a mano con supabase/manual/bootstrap_platform_admin.sql');
  end if;
end $$;

select * from estado_detalle order by orden;

-- Quién puede entrar hoy a la consola de plataforma, si la tabla existe.
drop table if exists pg_temp.estado_admins;
create temp table estado_admins (nombre text, email text, otorgado_en timestamptz);

do $$
begin
  if to_regclass('public.platform_admin') is not null then
    execute $q$
      insert into estado_admins
      select pa.nombre, u.email, pa.otorgado_en
        from platform_admin pa join auth.users u on u.id = pa.user_id
    $q$;
  end if;
end $$;

select * from estado_admins;
