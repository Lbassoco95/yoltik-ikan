-- ============================================================
-- Verificación · Migration 0011 + seed 10 (Parámetros regulatorios)
-- ============================================================
-- Pégalo en el SQL Editor después de correr apply_0011_parametros.sql.
-- Todo debe decir OK. Cualquier ❌ es un problema real, no un aviso.
--
-- Los chequeos 8 a 12 no verifican que las tablas existan, sino que el
-- valor RESUELTO sea el correcto: es donde estaba el error que llevó a que
-- el motor calculara los umbrales con una UMA equivocada.
with chequeos as (
  select 1 as n, 'tabla parametro_regulatorio' as objeto,
         coalesce((select 'OK · RLS=' || case when relrowsecurity then 'on' else '❌ OFF' end
                   from pg_class where relname='parametro_regulatorio'), '❌ FALTA') as estado

  union all select 2, 'restricción de no-traslape',
         coalesce((select 'OK · ' || contype::text from pg_constraint
                   where conname='parametro_sin_traslape'), '❌ FALTA')

  union all select 3, 'función parametro_vigente',
         coalesce((select 'OK · ' || pg_get_function_arguments(oid)
                   from pg_proc where proname='parametro_vigente'), '❌ FALTA')

  union all select 4, 'vista v_parametros_vigentes',
         coalesce((select case when reloptions::text like '%security_invoker=true%'
                            then 'OK · security_invoker'
                            else '❌ SIN security_invoker — la vista salta la RLS' end
                   from pg_class where relname='v_parametros_vigentes'), '❌ FALTA')

  union all select 5, 'políticas RLS',
         (select case when count(*)=2 then 'OK · 2 de 2' else '❌ ' || count(*) || ' de 2' end
          from pg_policies where tablename='parametro_regulatorio')

  union all select 6, 'extensión btree_gist',
         coalesce((select 'OK' from pg_extension where extname='btree_gist'), '❌ FALTA')

  union all select 7, 'filas sembradas',
         (select case when count(*)>=6 then 'OK · ' || count(*) || ' parámetros'
                      else '❌ sólo ' || count(*) end from parametro_regulatorio)

  union all select 8, '── resolución de valores ──', ''

  union all select 9, '   UMA vigente hoy',
         coalesce((select case when public.parametro_vigente('uma_diaria') = 117.31
                            then 'OK · 117.31'
                            else '❌ ' || public.parametro_vigente('uma_diaria')::text end), '❌ SIN UMA VIGENTE')

  union all select 10, '   UMA de un acto del 15/jun/2025',
         coalesce((select case when public.parametro_vigente('uma_diaria', date '2025-06-15') = 113.14
                            then 'OK · 113.14 (histórico)'
                            else '❌ ' || public.parametro_vigente('uma_diaria', date '2025-06-15')::text end), '❌ FALTA')

  union all select 11, '   umbral XII lo ve XII, no XVI',
         (select case when public.parametro_vigente('umbral_xii_inmueble_uma', current_date, 'XII') = 16000
                       and public.parametro_vigente('umbral_xii_inmueble_uma', current_date, 'XVI') is null
                      then 'OK · precedencia por sector'
                      else '❌ la precedencia por sector no funciona' end)

  union all select 12, '   umbral global lo ve cualquier sector',
         (select case when public.parametro_vigente('umbral_identificacion_uma', current_date, 'XII') = 645
                      then 'OK · 645 UMA' else '❌' end)

  union all select 13, '── umbral XII en pesos ──', ''

  union all select 14, '   con la UMA correcta',
         to_char(public.parametro_vigente('umbral_xii_inmueble_uma', current_date, 'XII')
                 * public.parametro_vigente('uma_diaria'), 'FM$999,999,999.00')

  union all select 15, '   con la constante vieja (113.07)',
         to_char(16000 * 113.07, 'FM$999,999,999.00') || '  ← lo que usaba el motor antes'

  union all select 16, '── parámetros sin validar por Cumplimiento ──', ''

  union all select 16 + row_number() over (order by codigo, sector),
         '   ' || codigo || ' [' || sector || ']', 'pendiente'
    from parametro_regulatorio where confirmado_por is null
)
select objeto, estado from chequeos order by n;
