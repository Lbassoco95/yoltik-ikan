-- =====================================================================
-- 0040 · La acumulación de la fracción XII son seis meses, no uno
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 1 del 31/08/2026,
-- apartado 1.3. Segunda mitad de la instrucción 2.
--
-- XII-01 —transmisión de inmuebles— acumulaba en una ventana de UN MES. XII-05
-- —fideicomisos— ya usaba seis. Las dos acumulan por el mismo párrafo del mismo
-- artículo, así que una de las dos estaba mal, y era la primera.
--
-- La Adenda lo dice sin rodeos: la ventana es la MÓVIL DE SEIS MESES del
-- artículo 7 del Reglamento. Con un mes, dos transmisiones del mismo
-- compareciente separadas por seis semanas no se sumaban, y el Aviso por
-- acumulación que el penúltimo párrafo del artículo 17 ordena no se producía.
--
-- El artículo 18 fracción X obliga además a que los mecanismos automatizados
-- DETECTEN las operaciones que deban acumularse. Detectarlas en una ventana
-- cinco veces más corta que la legal es no detectarlas.
--
-- ---------------------------------------------------------------------
-- Se versiona, no se corrige en sitio
-- ---------------------------------------------------------------------
-- A diferencia del `filtro` de la 0031 —que corrigió lo que la regla alcanzaba
-- a ver sin cambiar el criterio— esto cambia QUÉ OPERACIONES entran en el
-- cálculo. Un hallazgo producido con la ventana de un mes se explica con la v2;
-- con la v3 habría salido distinto, y los dos tienen que poder reconstruirse
-- con la regla que los produjo.
-- =====================================================================

do $$
declare
  v_org uuid := '12121212-1212-1212-1212-121212121212';
  v_regla jsonb;
begin
  if not exists (select 1 from public.organizations where id = v_org) then
    return;
  end if;

  -- La versión vigente de XII-01, sea cual sea, con la ventana corregida.
  select regla_dsl into v_regla
    from public.tipologia_av
   where organization_id = v_org and sector = 'XII' and codigo = 'XII-01' and activa
   order by version desc limit 1;

  if v_regla is null or v_regla->>'ventana' = '6M' then
    return;
  end if;

  update public.tipologia_av set activa = false
   where organization_id = v_org and sector = 'XII' and codigo = 'XII-01' and activa;

  insert into public.tipologia_av
    (id, organization_id, sector, codigo, nombre, descripcion, regla_dsl,
     severidad, version, fuente, genera_aviso)
  select '33333333-0012-0000-0000-000000000103', v_org, 'XII', 'XII-01',
         'Transmisión de inmueble ≥ 8,000 UMA (acumulado a seis meses)',
         'Aviso por transmisión o constitución de derechos reales sobre inmuebles cuyo valor '
         || 'alcance o supere 8,000 UMA, acumulando los actos del mismo compareciente en la '
         || 'ventana móvil de seis meses del art. 7 del Reglamento. La base es el MAYOR entre '
         || 'precio pactado, valor catastral, valor comercial y monto garantizado por suerte '
         || 'principal, sin contribuciones ni accesorios.',
         jsonb_set(v_regla, '{ventana}', '"6M"'::jsonb)
           || jsonb_build_object(
                'nota', 'Art. 17 fr. XII apartado A inciso a) y penúltimo párrafo LFPIORPI; '
                     || 'art. 7 del Reglamento (ventana móvil de seis meses). '
                     || 'Adenda 1 de Kawiil-Cumplimiento, 31/08/2026, apartado 1.3.'),
         'alta',
         (select coalesce(max(version), 0) + 1 from public.tipologia_av
           where organization_id = v_org and sector = 'XII' and codigo = 'XII-01'),
         'Art. 17 fr. XII LFPIORPI, reforma DOF 16/07/2025. Adenda 1 de '
         || 'Kawiil-Cumplimiento del 31/08/2026.',
         true;

  perform public.registrar_evento(
    v_org, 'ventana_acumulacion_corregida', 'tipologia_av', null,
    jsonb_build_object(
      'tipologia', 'XII-01',
      'antes', v_regla->>'ventana',
      'ahora', '6M',
      'motivo', 'XII-01 acumulaba en un mes y XII-05 en seis. Las dos acumulan por el '
             || 'mismo párrafo del mismo artículo: una estaba mal, y era la primera.',
      'efecto', 'Dos transmisiones del mismo compareciente separadas por seis semanas no se '
             || 'sumaban, y el Aviso por acumulación del penúltimo párrafo del art. 17 no se '
             || 'producía. El art. 18 fr. X obliga a detectar lo que deba acumularse, y '
             || 'detectarlo en una ventana cinco veces más corta que la legal es no detectarlo.',
      'fundamento', 'Art. 7 del Reglamento (DOF 27/03/2026), ventana móvil de seis meses.'
    ),
    'sistema', null
  );
end $$;

revoke insert, update, delete on tipologia_av from anon;
