-- ============================================================
-- Verificación · Migration 0007 (Expediente del hallazgo)
-- ============================================================
with chequeos as (
  select 1 as n, 'columna clasificacion_urgencia' as objeto,
         coalesce((select 'OK · nullable=' || is_nullable from information_schema.columns
                   where table_name='hallazgo' and column_name='clasificacion_urgencia'), '❌ FALTA') as estado
  union all select 2, 'tabla hallazgo_documento',
         coalesce((select 'OK · RLS=' || case when relrowsecurity then 'on' else '❌ OFF' end
                   from pg_class where relname='hallazgo_documento'), '❌ FALTA')
  union all select 3, 'tabla hallazgo_bitacora',
         coalesce((select 'OK · RLS=' || case when relrowsecurity then 'on' else '❌ OFF' end
                   from pg_class where relname='hallazgo_bitacora'), '❌ FALTA')
  union all select 4, 'triggers automáticos',
         (select case when count(*)=3 then 'OK · 3 de 3' else '❌ ' || count(*) || ' de 3' end
          from pg_trigger where tgname in
            ('trg_hallazgo_urgencia','trg_hallazgo_bitacora','trg_hallazgo_documento_bitacora'))
  union all select 5, 'políticas RLS tablas nuevas',
         (select case when count(*)=4 then 'OK · 4 de 4' else '❌ ' || count(*) || ' de 4' end
          from pg_policies where tablename in ('hallazgo_documento','hallazgo_bitacora'))
  union all select 6, 'bucket hallazgo-documentos',
         coalesce((select 'OK · privado=' || (not public)::text || ', ' || (file_size_limit/1048576) || ' MB'
                   from storage.buckets where id='hallazgo-documentos'), '❌ FALTA')
  union all select 7, 'políticas de Storage',
         (select case when count(*)=2 then 'OK · 2 de 2' else '❌ ' || count(*) || ' de 2' end
          from pg_policies where schemaname='storage'
            and policyname in ('hallazgo_docs_select','hallazgo_docs_insert'))
  union all select 8, '── clasificación de los hallazgos ──', ''
  union all select 9, '   ' || tipologia_codigo || '  [' || estado || ']', clasificacion_urgencia::text
         from hallazgo
)
select objeto, estado from chequeos order by n, objeto;
