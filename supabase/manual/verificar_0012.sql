-- ============================================================
-- Verificación · Migrations 0012, 0013 y 0014 + seeds 11 y 12 (Listas)
-- ============================================================
-- Pégalo en el SQL Editor después de correr apply_0012_listas.sql.
-- Todo debe decir OK. Cualquier ❌ es un problema real.
with chequeos as (
  select 1 as n, 'tablas del catálogo' as objeto,
         (select case when count(*)=4 then 'OK · 4 de 4'
                      else '❌ ' || count(*) || ' de 4' end
          from pg_class where relname in
            ('lista_fuente','lista_carga','lista_movimiento','lista_registro')) as estado

  union all select 2, 'RLS activa en las 4',
         (select case when count(*)=4 then 'OK · 4 de 4'
                      else '❌ ' || count(*) || ' de 4' end
          from pg_class where relrowsecurity and relname in
            ('lista_fuente','lista_carga','lista_movimiento','lista_registro'))

  union all select 3, 'triggers de la bitácora',
         (select case when count(*)=3 then 'OK · 3 de 3'
                      else '❌ ' || count(*) || ' de 3' end
          from pg_trigger where tgname in
            ('trg_lista_movimiento','trg_lista_carga_conteo','trg_lista_movimiento_inmutable'))

  union all select 4, 'función normalizar_nombre',
         coalesce((select 'OK · ' || provolatile::text || ' (debe ser i = inmutable)'
                   from pg_proc where proname='normalizar_nombre'), '❌ FALTA')

  union all select 5, 'función listado_en_fecha',
         coalesce((select 'OK' from pg_proc where proname='listado_en_fecha'), '❌ FALTA')

  union all select 6, 'vista v_listas_vigentes',
         coalesce((select case when reloptions::text like '%security_invoker=true%'
                            then 'OK · security_invoker'
                            else '❌ SIN security_invoker — salta la RLS' end
                   from pg_class where relname='v_listas_vigentes'), '❌ FALTA')

  union all select 7, 'columna generada nombre_normalizado',
         coalesce((select case when is_generated='ALWAYS' then 'OK · generada'
                               else '❌ no es generada' end
                   from information_schema.columns
                   where table_name='lista_registro' and column_name='nombre_normalizado'), '❌ FALTA')

  union all select 8, 'función revertir_carga_lista (0013)',
         coalesce((select 'OK' from pg_proc where proname='revertir_carga_lista'), '❌ FALTA — aplica la 0013')

  union all select 9, 'columna situacion (0014)',
         coalesce((select 'OK' from information_schema.columns
                   where table_name='lista_registro' and column_name='situacion'), '❌ falta — aplica la 0014')

  union all select 10, 'columna bloqueante en la vista (0014)',
         coalesce((select 'OK' from information_schema.columns
                   where table_name='v_listas_vigentes' and column_name='bloqueante'), '❌ falta — aplica la 0014')

  union all select 11, '── catálogo de fuentes ──', ''

  union all select 11 + row_number() over (order by codigo),
         '   ' || codigo,
         naturaleza::text || ' · ' || modo_actualizacion::text
         || case when obligatoria then ' · obligatoria' else '' end
    from lista_fuente

  union all select 100, '── estado ──', ''
  union all select 101, '   personas listadas hoy',
         (select count(*)::text || ' vigentes de ' ||
                 (select count(*) from lista_registro)::text || ' registros'
          from v_listas_vigentes)
  union all select 102, '   cargas registradas',
         (select count(*)::text from lista_carga)
  union all select 103, '   la UIF se captura por oficio',
         (select case when modo_actualizacion='movimientos'
                      then 'OK · altas y bajas por oficio, no por archivo'
                      else '❌ está como snapshot' end
          from lista_fuente where codigo='uif_bloqueadas')
  union all select 104, '   se puede deshacer una carga equivocada',
         (select case when count(*)=1 then 'OK · revertir_carga_lista disponible'
                      else '❌ sin salida para una captura errónea' end
          from pg_proc where proname='revertir_carga_lista')
  union all select 105, '   el 69-B ingiere las 4 situaciones',
         coalesce((select case when array_length(situaciones,1) = 4
                                and situaciones_bloqueantes = array['definitivo']
                               then 'OK · sólo definitivo genera hallazgo'
                               else '❌ ' || coalesce(situaciones::text,'sin situaciones') end
                   from lista_fuente where codigo='sat_69b'), '❌ falta el seed 12')
  union all select 106, '   el 69-B va marcado como fiscal',
         (select case when naturaleza='fiscal'
                      then 'OK · no se confunde con una sanción AML'
                      else '❌ mal clasificado' end
          from lista_fuente where codigo='sat_69b')
)
select objeto, estado from chequeos order by n;
