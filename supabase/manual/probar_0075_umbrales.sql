-- =====================================================================
-- Pruebas de comportamiento · Migration 0075
-- =====================================================================
-- Qué se prueba: que las vigencias sean las de la NORMA y no las de captura,
-- que el régimen anterior de la fracción XII esté cargado, que ninguna regla
-- monetaria siga con el número escrito a mano, y que no quede un hueco de
-- fechas por el que un acto no se pueda medir.
--
-- El comportamiento del motor —resolver por fecha y negarse cuando no puede—
-- se prueba en `src/test/motor-evaluadores.test.ts`, que es donde vive el
-- evaluador. Aquí se prueba lo que la base tiene que garantizarle.
--
-- Corre después de migrations + seeds. No escribe nada.

\set ON_ERROR_STOP on
\pset pager off

do $$
declare
  v_corte date := date '2025-07-17';
  -- Las dos organizaciones que siembran los seeds: Ixim Pay (fracción XVI) y la
  -- Notaría Demo GDL (fracción XII). Las pruebas de tipologías se acotan a
  -- ellas a propósito.
  --
  -- El catálogo de una organización nueva se copia de su referencia, así que un
  -- inquilino real hereda lo que aquí se comprueba. Lo que NO se puede mirar es
  -- lo que otros `probar_*.sql` dejan sembrado: varios provisionan notarías de
  -- fixture con tipologías hechas a mano, y sin acotar, esta prueba fallaría
  -- según el orden en que se corriera la suite. Ya mordió con la 0063.
  v_orgs  uuid[] := array['11111111-1111-1111-1111-111111111111'::uuid,
                          '12121212-1212-1212-1212-121212121212'::uuid];
  v_txt   text;
  v_n     int;
  v_msg   text;
  v_ok    int := 0;
begin
  -- Que el catálogo sembrado siga ahí. Sin esto, acotar por organización
  -- convertiría cualquier prueba de abajo en un «pasa porque no mira nada».
  select count(*) into v_n
    from tipologia_av
   where activa and organization_id = any(v_orgs)
     and codigo in ('XII-01', 'XII-02', 'XII-04', 'XII-05', 'XVI-01', 'XVI-09');
  if v_n < 6 then
    raise exception 'PRUEBA 0: el catálogo sembrado tiene % de las 6 tipologías que estas '
      'pruebas miran. Sin ellas lo de abajo no comprueba nada.', v_n;
  end if;
  -- ------------------------------------------------------------------
  -- 1. Ningún umbral vigente arranca después del corte
  -- ------------------------------------------------------------------
  -- Es el hueco que tenía la tabla: las vigencias eran del día en que Kawiil
  -- capturó cada valor —2026-01-01, 2026-08-31— y no del día en que la norma
  -- surtió efecto. Un acto de agosto de 2025 caía en tierra de nadie.
  select string_agg(codigo || ' (' || vigente_desde || ')', ', ') into v_txt
    from parametro_regulatorio
   where unidad = 'uma' and vigente_hasta is null and vigente_desde > v_corte;
  if v_txt is not null then
    raise exception 'PRUEBA 1: umbrales vigentes que arrancan después del corte: %', v_txt;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  1 OK · las vigencias son las de la norma, no las de captura';

  -- ------------------------------------------------------------------
  -- 2. Y ninguno termina después del corte
  -- ------------------------------------------------------------------
  select string_agg(codigo || ' (' || vigente_hasta || ')', ', ') into v_txt
    from parametro_regulatorio
   where unidad = 'uma' and vigente_hasta is not null and vigente_hasta <> v_corte;
  if v_txt is not null then
    raise exception 'PRUEBA 2: umbrales cuyo régimen anterior no termina en el corte: %', v_txt;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  2 OK · el régimen anterior termina exactamente en el corte';

  -- ------------------------------------------------------------------
  -- 3. Los dos valores del régimen anterior que Cumplimiento nombró
  -- ------------------------------------------------------------------
  select valor_numerico::int into v_n
    from parametro_regulatorio
   where codigo = 'umbral_xii_inmueble_uma' and vigente_hasta = v_corte;
  if v_n is distinct from 16000 then
    raise exception 'PRUEBA 3: el umbral anterior de inmuebles son 16,000 UMA, y hay %',
      coalesce(v_n::text, '(nada)');
  end if;
  select valor_numerico::int into v_n
    from parametro_regulatorio
   where codigo = 'umbral_xii_persona_moral_uma' and vigente_hasta = v_corte;
  if v_n is distinct from 8025 then
    raise exception 'PRUEBA 3: el umbral anterior de sociedades son 8,025 UMA, y hay %',
      coalesce(v_n::text, '(nada)');
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  3 OK · 16,000 en inmuebles y 8,025 en sociedades, del régimen anterior';

  -- ------------------------------------------------------------------
  -- 4. Sin hueco entre un régimen y el siguiente
  -- ------------------------------------------------------------------
  -- Si el anterior terminara antes de que empiece el nuevo, los actos del
  -- intervalo no se podrían medir con nada — y el motor los rechazaría, que es
  -- correcto pero evitable.
  select string_agg(a.codigo, ', ') into v_txt
    from parametro_regulatorio a
    join parametro_regulatorio b
      on b.codigo = a.codigo and b.vigente_hasta is null
   where a.unidad = 'uma' and a.vigente_hasta is not null
     and a.vigente_hasta <> b.vigente_desde;
  if v_txt is not null then
    raise exception 'PRUEBA 4: hueco de vigencias en: %', v_txt;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  4 OK · los regímenes empalman sin hueco';

  -- ------------------------------------------------------------------
  -- 5. Ninguna regla monetaria trae el número escrito a mano
  -- ------------------------------------------------------------------
  select string_agg(codigo || ' v' || version, ', ') into v_txt
    from tipologia_av
   where activa and organization_id = any(v_orgs)
     and codigo in ('XII-01', 'XII-05', 'XVI-01', 'XVI-09')
     and (regla_dsl->'condicion'->'suma_monto_uma' ? 'valor'
          or regla_dsl->'condicion'->'contraprestacion_uma' ? 'valor');
  if v_txt is not null then
    raise exception 'PRUEBA 5: reglas con umbral escrito a mano: %', v_txt;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  5 OK · las reglas apuntan al parámetro, no a un número';

  -- ------------------------------------------------------------------
  -- 6. Y el parámetro al que apuntan existe
  -- ------------------------------------------------------------------
  -- Una regla que apunta a un parámetro inexistente no se equivoca de umbral:
  -- deja de evaluar del todo, en silencio para quien no lea los metadatos.
  select string_agg(t.codigo || ' → ' || x.param, ', ') into v_txt
    from tipologia_av t
    cross join lateral (
      select coalesce(
               t.regla_dsl->'condicion'->'suma_monto_uma'->>'parametro',
               t.regla_dsl->'condicion'->'contraprestacion_uma'->>'parametro'
             ) as param
    ) x
   where t.activa and t.organization_id = any(v_orgs) and x.param is not null
     and not exists (select 1 from parametro_regulatorio p where p.codigo = x.param);
  if v_txt is not null then
    raise exception 'PRUEBA 6: reglas que apuntan a un parámetro inexistente: %', v_txt;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  6 OK · todo parámetro referido por una regla existe';

  -- ------------------------------------------------------------------
  -- 7. Las reglas que la reforma tocó declaran desde cuándo rigen
  -- ------------------------------------------------------------------
  -- Es lo que cubre a XII-04, cuya obligación cambió sin que cambiara ninguna
  -- cifra: hoy avisa siempre y antes exigía 8,025 UMA.
  select string_agg(codigo, ', ') into v_txt
    from tipologia_av
   where activa and organization_id = any(v_orgs)
     and codigo in ('XII-01', 'XII-02', 'XII-04', 'XII-05', 'XVI-01')
     and not (regla_dsl ? 'vigente_desde');
  if v_txt is not null then
    raise exception 'PRUEBA 7: reglas tocadas por la reforma sin vigencia declarada: %', v_txt;
  end if;
  select regla_dsl->>'vigente_desde' into v_txt
    from tipologia_av
   where codigo = 'XII-04' and activa and organization_id = any(v_orgs) limit 1;
  if v_txt is distinct from '2025-07-17' then
    raise exception 'PRUEBA 7: XII-04 debe regir desde el corte, y dice "%"',
      coalesce(v_txt, '(nada)');
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  7 OK · las reglas tocadas por la reforma declaran su vigencia';

  raise notice '--- 0075: % de 7 (más la 0 de montaje) ---', v_ok;

exception when others then
  get stacked diagnostics v_msg = message_text;
  raise notice 'FALLO: %', v_msg;
  raise;
end $$;
