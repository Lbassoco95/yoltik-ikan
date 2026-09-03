-- =====================================================================
-- ¿En qué paso vamos? · SOLO LECTURA
-- =====================================================================
-- Córrela ANTES de aplicar nada, y entre paso y paso. No escribe nada: mira el
-- catálogo del sistema y cuenta filas solo de las tablas que existen.
--
-- Existe porque aplicar el paso 6 sin el 1 falla con
-- «relation "expediente_reforzado" does not exist»: es cierto, pero no dice qué
-- hacer. Esto sí.
-- =====================================================================

-- La tabla temporal vive en TU sesión y desaparece al cerrarla. Se crea fuera
-- del bloque para que sobreviva entre sentencias: con `on commit drop`, psql la
-- tiraba al terminar el bloque y el select de abajo no encontraba nada.
create temp table if not exists estado_adenda5 (paso int, objeto text, estado text);

do $estado$
declare
  v_n bigint;
begin
  delete from estado_adenda5;

  -- Paso 1
  insert into estado_adenda5 values
    (1, 'tabla expediente_reforzado',
        case when to_regclass('public.expediente_reforzado') is null then 'FALTA' else 'LISTO' end),
    (1, 'tabla allegado',
        case when to_regclass('public.allegado') is null then 'FALTA' else 'LISTO' end),
    (1, 'tabla allegado_sin_declarar',
        case when to_regclass('public.allegado_sin_declarar') is null then 'FALTA' else 'LISTO' end);

  -- Paso 2 · aquí sí interesa el número de filas, no solo que la tabla exista:
  -- un catálogo a medias es peor que uno ausente, porque parece completo.
  if to_regclass('public.origen_recursos') is null then
    insert into estado_adenda5 values (2, 'catálogo origen_recursos (12)', 'FALTA');
  else
    execute 'select count(*) from origen_recursos' into v_n;
    insert into estado_adenda5 values
      (2, 'catálogo origen_recursos (12)',
          case when v_n = 12 then 'LISTO' else 'INCOMPLETO: ' || v_n end);
  end if;

  if to_regclass('public.tipo_documento_origen') is null then
    insert into estado_adenda5 values (2, 'catálogo tipo_documento_origen (30)', 'FALTA');
  else
    execute 'select count(*) from tipo_documento_origen' into v_n;
    insert into estado_adenda5 values
      (2, 'catálogo tipo_documento_origen (30)',
          case when v_n = 30 then 'LISTO' else 'INCOMPLETO: ' || v_n end);
  end if;

  if to_regclass('public.documento_admitido_por_origen') is null then
    insert into estado_adenda5 values (2, 'combinaciones admitidas (46)', 'FALTA');
  else
    execute 'select count(*) from documento_admitido_por_origen' into v_n;
    insert into estado_adenda5 values
      (2, 'combinaciones admitidas (46)',
          case when v_n = 46 then 'LISTO' else 'INCOMPLETO: ' || v_n end);
  end if;

  -- Paso 3
  insert into estado_adenda5 values
    (3, 'tabla origen_declarado',
        case when to_regclass('public.origen_declarado') is null then 'FALTA' else 'LISTO' end),
    (3, 'tabla documento_origen',
        case when to_regclass('public.documento_origen') is null then 'FALTA' else 'LISTO' end),
    (3, 'bucket origen-recursos',
        case when exists (select 1 from storage.buckets where id = 'origen-recursos')
             then 'LISTO' else 'FALTA' end);

  -- Paso 4
  insert into estado_adenda5 values
    (4, 'tabla cuestionario_reforzado',
        case when to_regclass('public.cuestionario_reforzado') is null then 'FALTA' else 'LISTO' end),
    (4, 'tabla consulta_secretaria_economia',
        case when to_regclass('public.consulta_secretaria_economia') is null
             then 'FALTA' else 'LISTO' end),
    (4, 'parámetro FECHA_EXIGIBLE_CONSULTA_SE',
        case when exists (select 1 from parametro_regulatorio
                           where codigo = 'FECHA_EXIGIBLE_CONSULTA_SE')
             then 'LISTO' else 'FALTA' end);

  -- Paso 5 · el asiento tiene que estar en TODAS las organizaciones.
  insert into estado_adenda5 values
    (5, 'asiento de la Adenda 5 en todas las organizaciones',
        case when not exists (
               select 1 from organizations o
                where not exists (select 1 from evento_auditoria e
                                   where e.organization_id = o.id
                                     and e.tipo = 'expediente_reforzado_incorporado'))
             then 'LISTO' else 'FALTA' end);

  -- Paso 6
  insert into estado_adenda5 values
    (6, 'columna organizations.oc_encargado_user_id',
        case when exists (select 1 from information_schema.columns
                           where table_name = 'organizations'
                             and column_name = 'oc_encargado_user_id')
             then 'LISTO' else 'FALTA' end),
    (6, 'columna operation.aprobacion_expediente_id',
        case when exists (select 1 from information_schema.columns
                           where table_name = 'operation'
                             and column_name = 'aprobacion_expediente_id')
             then 'LISTO' else 'FALTA' end),
    (6, 'función n3_sin_aprobacion_vigente',
        case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public'
                             and p.proname = 'n3_sin_aprobacion_vigente')
             then 'LISTO' else 'FALTA' end);
end $estado$;

select paso, objeto, estado from estado_adenda5 order by paso, objeto;
