-- =====================================================================
-- Ikán · ¿Qué migrations están REALMENTE aplicadas en este proyecto?
-- =====================================================================
-- SOLO LECTURA. Pégalo completo en el SQL Editor y córrelo.
--
-- Existe porque `npx supabase migration list` devolvió la columna Remote vacía
-- para las 62 migrations. Eso NO significa que la base esté vacía: significa
-- que la tabla de control `supabase_migrations.schema_migrations` no tiene
-- registros, porque las migrations se aplicaron a mano por el editor SQL y no
-- por el CLI. La base sí tiene el esquema.
--
-- La diferencia importa mucho: con la tabla de control vacía, `db push`
-- intentaría aplicar desde la 0001, y las primeras usan `create table` sin
-- `if not exists`. Antes de poder usar el CLI hay que decirle qué ya está.
--
-- Esto lo mide mirando el esquema real: una firma por migration —una tabla, una
-- función, una columna, un parámetro o un asiento que esa migration crea—. Es
-- indirecto a propósito: preguntarle a la tabla de control sería preguntarle a
-- quien no sabe.
--
-- Cinco firmas van marcadas [efecto de DATOS]: la 0031, 0037, 0040, 0042 y
-- 0054 no crean tablas, cambian datos —la matriz XII, un asiento, un
-- indicador—. En producción deben salir APLICADA porque las organizaciones ya
-- existían cuando corrieron. Si alguna sale FALTA en producción, ESO es un
-- hallazgo y hay que decírmelo: significa que el efecto se perdió.
--
-- Devuelve UNA sola tabla: el editor de Supabase muestra únicamente el
-- resultado de la última consulta, así que un diagnóstico en varios SELECT deja
-- ver sólo el último y parece que lo demás no corrió.
-- =====================================================================

create temp table if not exists ikan_migraciones (
  migration text, firma text, estado text
);

do $estado$
begin
  delete from ikan_migraciones;
  insert into ikan_migraciones values ('0001_initial_schema', 'tabla organizations',
    case when to_regclass('public.organizations') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0002_risk_methodology', 'tabla risk_methodology',
    case when to_regclass('public.risk_methodology') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0003_catalogos', 'tabla country_risk_list',
    case when to_regclass('public.country_risk_list') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0004_clientes_operaciones', 'tabla client',
    case when to_regclass('public.client') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0005_motor_pld', 'tabla tipologia_av',
    case when to_regclass('public.tipologia_av') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0006_perfil_actividad_notarias', 'columna organizations.perfil_actividad',
    case when exists (select 1 from information_schema.columns where table_name = 'organizations' and column_name = 'perfil_actividad') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0007_hallazgo_expediente', 'tabla hallazgo_documento',
    case when to_regclass('public.hallazgo_documento') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0008_folio_configurable', 'tabla platform_admin',
    case when to_regclass('public.platform_admin') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0009_audit_log_kawiil', 'policy audit_select_same_org',
    case when exists (select 1 from pg_policies where policyname = 'audit_select_same_org') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0010_matriz_configurable', 'función validar_configuracion_matriz',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validar_configuracion_matriz') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0011_parametros_regulatorios', 'tabla parametro_regulatorio',
    case when to_regclass('public.parametro_regulatorio') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0012_listas_plataforma', 'tabla lista_fuente',
    case when to_regclass('public.lista_fuente') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0013_revertir_carga_lista', 'función lista_movimiento_inmutable',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'lista_movimiento_inmutable') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0014_situacion_listas', 'función aplicar_movimiento_lista',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'aplicar_movimiento_lista') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0015_carga_archivo_listas', 'función cerrar_carga_completa',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cerrar_carga_completa') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0016_job_listas_aprobacion', 'tabla lista_carga_fila',
    case when to_regclass('public.lista_carga_fila') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0017_estado_listas_cliente', 'vista v_listas_estado',
    case when to_regclass('public.v_listas_estado') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0018_plan_trabajo_hallazgo', 'función fecha_compromiso_propuesta',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'fecha_compromiso_propuesta') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0019_expediente_del_acto', 'función componer_nombre_cliente',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'componer_nombre_cliente') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0020_catalogos_layout', 'tabla catalogo_sat',
    case when to_regclass('public.catalogo_sat') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0021_bitacora_encadenada', 'tabla cadena_auditoria',
    case when to_regclass('public.cadena_auditoria') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0022_cierre_fuga_entre_organizaciones', 'función current_org_id',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'current_org_id') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0023_prospect_intake', 'tabla prospect_intake',
    case when to_regclass('public.prospect_intake') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0024_nonce_sin_pgcrypto', 'función registrar_evento',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'registrar_evento') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0025_aviso_layout_y_bitacora', 'función emitir_evento_de_tabla',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'emitir_evento_de_tabla') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0026_anclaje_bitacora', 'tabla anclaje',
    case when to_regclass('public.anclaje') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0027_prospectos_visibles', 'función marcar_prospecto',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'marcar_prospecto') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0028_reposicion_segundo_factor', 'función usuarios_de_plataforma',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'usuarios_de_plataforma') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0029_parametros_editables', 'función fijar_parametro',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'fijar_parametro') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0030_umbrales_fe_publica_vigentes', 'parámetro umbral_xii_inmueble_uma',
    case when exists (select 1 from parametro_regulatorio where codigo = 'umbral_xii_inmueble_uma') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0031_actos_notaria_y_clave_padron', 'asiento actos_y_reglas_corregidos [efecto de DATOS]',
    case when exists (select 1 from evento_auditoria where tipo = 'actos_y_reglas_corregidos') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0032_verificacion_identidad', 'tabla verificacion_identidad',
    case when to_regclass('public.verificacion_identidad') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0033_umbrales_activos_virtuales', 'columna operation.contraprestacion_mxn',
    case when exists (select 1 from information_schema.columns where table_name = 'operation' and column_name = 'contraprestacion_mxn') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0034_entorno_de_demostracion', 'función aviso_hereda_demostracion',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'aviso_hereda_demostracion') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0035_obligacion_de_avisar', 'columna operation.evaluada_en',
    case when exists (select 1 from information_schema.columns where table_name = 'operation' and column_name = 'evaluada_en') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0036_forma_pago_y_origen_recursos', 'columna operation.forma_pago',
    case when exists (select 1 from information_schema.columns where table_name = 'operation' and column_name = 'forma_pago') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0037_matriz_xii_v2', 'matriz XII versión 2 [efecto de DATOS]',
    case when exists (select 1 from client_risk_template where sector = 'XII' and version >= 2) then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0038_condicion_pep', 'función pep_desde_resumen',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'pep_desde_resumen') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0039_pago_y_articulo_32', 'función limite_efectivo_del_acto',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'limite_efectivo_del_acto') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0040_ventana_acumulacion_seis_meses', 'asiento ventana_acumulacion_corregida [efecto de DATOS]',
    case when exists (select 1 from evento_auditoria where tipo = 'ventana_acumulacion_corregida') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0041_factores_rcg', 'tabla zona_atencion',
    case when to_regclass('public.zona_atencion') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0042_matriz_xii_v3', 'matriz XII versión 3 [efecto de DATOS]',
    case when exists (select 1 from client_risk_template where sector = 'XII' and version >= 3) then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0043_snapshot_gafi_por_plenario', 'country_risk_list con plenario',
    case when exists (select 1 from country_risk_list where plenario is not null) then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0044_margen_perfil_transaccional', 'parámetro margen_perfil_transaccional_operaciones',
    case when exists (select 1 from parametro_regulatorio where codigo = 'margen_perfil_transaccional_operaciones') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0045_snapshot_gafi_junio_2026', 'función cargar_snapshot_gafi_2026_06',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cargar_snapshot_gafi_2026_06') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0046_efectivo_declarado_sin_monto', 'función impedir_efectivo_prohibido',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'impedir_efectivo_prohibido') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0047_respuesta_por_clave', 'columna client_risk_assessment.respuestas_clave',
    case when exists (select 1 from information_schema.columns where table_name = 'client_risk_assessment' and column_name = 'respuestas_clave') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0048_aviso_lo_genera_el_oc', 'policy aviso_insert_oc',
    case when exists (select 1 from pg_policies where policyname = 'aviso_insert_oc') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0049_beneficiario_controlador', 'tabla tipo_social',
    case when to_regclass('public.tipo_social') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0050_provisionar_organizacion', 'función diagnostico_organizacion',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'diagnostico_organizacion') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0051_diagnostico_por_fuente', 'función diagnostico_organizacion',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'diagnostico_organizacion') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0052_provisionar_desde_sql', 'función puede_provisionar',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'puede_provisionar') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0053_regimenes_onu_ofac', 'tabla regimen_sancion',
    case when to_regclass('public.regimen_sancion') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0054_indicador_pais_sancionado', 'indicador PAIS_SANCIONADO en alguna matriz [efecto de DATOS]',
    case when exists (select 1 from client_risk_template where configuracion::text like '%PAIS_SANCIONADO%') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0055_errata_paarss_balcanes_atencion', 'tabla jurisdiccion_atencion',
    case when to_regclass('public.jurisdiccion_atencion') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0056_exencion_bc_bolsa', 'función bc_exento',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'bc_exento') then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0057_nivel_diligencia', 'tabla cambio_nivel_diligencia',
    case when to_regclass('public.cambio_nivel_diligencia') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0058_subdivision_territorial', 'tabla subdivision_riesgo',
    case when to_regclass('public.subdivision_riesgo') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0059_expediente_reforzado', 'tabla expediente_reforzado',
    case when to_regclass('public.expediente_reforzado') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0060_origen_de_recursos', 'tabla origen_recursos',
    case when to_regclass('public.origen_recursos') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0061_cuestionario_y_secretaria', 'tabla cuestionario_reforzado',
    case when to_regclass('public.cuestionario_reforzado') is not null then 'APLICADA' else 'FALTA' end);
  insert into ikan_migraciones values ('0062_oc_designado_y_aprobacion_del_acto', 'función designar_oficial_cumplimiento',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'designar_oficial_cumplimiento') then 'APLICADA' else 'FALTA' end);
end $estado$;

-- La última fila trae el comando exacto que hay que correr para poner al día
-- la tabla de control del CLI SIN tocar el esquema: `migration repair` sólo
-- registra, no ejecuta nada. Después de eso, `npx supabase db push` aplicará
-- únicamente lo que falte, en orden, y se acabó pegar SQL a mano.
insert into ikan_migraciones
select 'ZZZZ · CORRE ESTO EN LA TERMINAL',
       'npx supabase migration repair --status applied ' ||
       string_agg(left(migration, 4), ' ' order by migration),
       'luego: npx supabase db push'
  from ikan_migraciones
 where estado = 'APLICADA';

select migration,
       firma as "se busca / comando",
       estado
  from ikan_migraciones
 order by migration;
