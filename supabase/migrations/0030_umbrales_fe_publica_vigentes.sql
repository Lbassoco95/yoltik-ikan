-- =====================================================================
-- 0030 · Umbrales de fe pública al régimen vigente (fracción XII)
-- =====================================================================
-- Los umbrales de la fracción XII que Ikán trae desde el seed 08 son los del
-- régimen ANTERIOR a la reforma del 16/07/2025. El informe técnico de
-- Kawiil-Cumplimiento del 31/08/2026 («Umbrales y régimen de Avisos de la
-- Actividad Vulnerable de fe pública») lo documenta con el texto vigente de la
-- Ley y del Reglamento.
--
-- QUÉ ESTABA MAL, Y CUÁNTO IMPORTA
--
--   Inmuebles (apartado A, inciso a):  teníamos 16,000 UMA · son 8,000 UMA
--
--     Con la UMA de 2026 ($117.31), 8,000 UMA son $938,480 y 16,000 son
--     $1,876,960. El motor dejaba pasar TODA transmisión de inmueble entre
--     esas dos cifras, que es justo donde cae la mayoría de la vivienda media
--     del país. No es un caso de borde: es el caso común.
--
--   Personas morales (inciso c):  teníamos 8,025 UMA · ya NO hay umbral
--
--     La constitución, la modificación patrimonial por aumento o disminución
--     de capital, la fusión, la escisión y la compraventa de acciones o partes
--     sociales son SIEMPRE objeto de Aviso. Un umbral aquí no es un número
--     equivocado: es una condición que sobra y que silencia todo lo que caiga
--     por debajo.
--
--   Fideicomisos (inciso d):  no lo teníamos · son 4,000 UMA
--
--     Y dejó de estar limitado a inmuebles. El seed ya siembra un acto de este
--     tipo y ninguna tipología lo miraba.
--
--   Mutuo o crédito con acreedor fuera del sistema financiero (inciso e):
--     no lo teníamos · SIEMPRE objeto de Aviso.
--
-- POR QUÉ NO SE REESCRIBE EL PASADO
--
-- Legalmente los umbrales nuevos rigen desde el 17/07/2025. En el catálogo de
-- Ikán, sin embargo, el valor viejo estuvo vigente hasta hoy y el motor CALCULÓ
-- con él. Reescribir la fila para que diga que siempre valió 8,000 dejaría el
-- catálogo «correcto» y la historia falsa: no habría manera de explicar por qué
-- un acto de marzo de 2026 no generó hallazgo.
--
-- Así que la vigencia del catálogo refleja lo que el SISTEMA usó, la nota de
-- cada parámetro dice desde cuándo rige de verdad, y el evento de bitácora deja
-- el periodo exacto en que las dos cosas no coincidieron. Es la doctrina de la
-- 0021 aplicada a un error propio: una corrección es un asiento nuevo.
--
-- Y ATENCIÓN A LA ASIMETRÍA DEL ARTÍCULO 32
--
-- El umbral de Aviso para inmuebles es 8,000 UMA y el de prohibición de pago en
-- efectivo es 8,025 UMA. Son cifras distintas, de artículos distintos, y el
-- informe advierte expresamente que NO deben unificarse en los controles
-- internos. Se cargan las dos, por separado, para que nadie las «limpie»
-- creyendo que una es una errata de la otra.
-- =====================================================================

do $$
declare
  v_org        uuid := '12121212-1212-1212-1212-121212121212';  -- Notaría Demo GDL
  v_hoy        date := current_date;
  v_fuente_ley text := 'Art. 17 fr. XII LFPIORPI, reforma DOF 16/07/2025 (en vigor 17/07/2025). '
                    || 'Informe técnico Kawiil-Cumplimiento, 31/08/2026.';
  v_desde_ley  text := 'Rige desde el 17/07/2025. En el catálogo de Ikán este valor abre hoy '
                    || 'porque hasta hoy el sistema usó el del régimen anterior; el periodo '
                    || 'de discrepancia queda asentado en la bitácora.';
  v_n          int;
  v_evento     uuid;
begin
  -- Esta migration CORRIGE lo que el seed ya sembró; no siembra ella misma.
  -- En un proyecto vacío las migrations corren antes que los seeds, así que
  -- aquí no hay nada que corregir y el seed 10 —ya arreglado— nace bien. Sin
  -- esta guarda, la migration insertaba los parámetros con la fecha de hoy y
  -- luego el seed chocaba contra la restricción de no-traslape al intentar
  -- ponerlos con su vigencia legal.
  if not exists (select 1 from public.parametro_regulatorio where sector = 'XII') then
    raise notice 'Catálogo XII vacío: proyecto nuevo, el seed 10 lo siembra ya corregido.';
    return;
  end if;

  -- ------------------------------------------------------------------
  -- 1. Inmuebles: 16,000 → 8,000 UMA
  -- ------------------------------------------------------------------
  update public.parametro_regulatorio
     set vigente_hasta = v_hoy,
         notas = coalesce(notas || E'\n---\n', '')
              || 'RETIRADO el ' || v_hoy || ': 16,000 UMA es el umbral del régimen ANTERIOR a la '
              || 'reforma DOF 16/07/2025. El vigente es 8,000 UMA desde el 17/07/2025.'
   where codigo = 'umbral_xii_inmueble_uma' and sector = 'XII' and vigente_hasta is null
     -- Acotado al valor VIEJO a propósito. Con `vigente_hasta is null` a secas,
     -- la segunda corrida cerraba la fila nueva contra su propia fecha de
     -- apertura y violaba el check vigente_hasta > vigente_desde: la migration
     -- se anunciaba idempotente y corrompía el dato al repetirse.
     and valor_numerico = 16000;

  insert into public.parametro_regulatorio
    (codigo, nombre, valor_numerico, unidad, sector, vigente_desde, fuente, publicacion_dof, notas)
  select 'umbral_xii_inmueble_uma',
         'Transmisión o constitución de derechos reales sobre inmuebles · umbral de Aviso',
         8000, 'uma', 'XII', v_hoy, v_fuente_ley, 'DOF 16/07/2025',
         v_desde_ley || E'\n'
         || 'Base de cálculo (art. 6 del Reglamento, reforma DOF 27/03/2026): el MAYOR entre '
         || 'precio pactado, valor catastral, valor comercial y monto garantizado por suerte '
         || 'principal, excluyendo contribuciones y accesorios. No es el precio de la operación.'
         || E'\n' || 'Excluye garantías a favor de instituciones del sistema financiero u '
         || 'organismos públicos de vivienda.'
   where not exists (select 1 from public.parametro_regulatorio
                      where codigo = 'umbral_xii_inmueble_uma' and sector = 'XII'
                        and vigente_desde = v_hoy);

  -- ------------------------------------------------------------------
  -- 2. Personas morales: el umbral desaparece, no cambia de número
  -- ------------------------------------------------------------------
  -- No se abre un sustituto: no hay cifra que poner. Dejar 0 UMA sería una
  -- forma rebuscada de decir «siempre» que alguien leería como un error.
  update public.parametro_regulatorio
     set vigente_hasta = v_hoy,
         notas = coalesce(notas || E'\n---\n', '')
              || 'RETIRADO el ' || v_hoy || ': tras la reforma DOF 16/07/2025 la constitución de '
              || 'personas morales, la modificación patrimonial por aumento o disminución de '
              || 'capital, la fusión, la escisión y la compraventa de acciones o partes sociales '
              || 'son SIEMPRE objeto de Aviso, sin umbral. Este supuesto ya no se resuelve con '
              || 'una cifra sino con la tipología XII-04.'
   where codigo = 'umbral_xii_persona_moral_uma' and sector = 'XII' and vigente_hasta is null
     and valor_numerico = 8025;

  -- ------------------------------------------------------------------
  -- 3. Fideicomisos: 4,000 UMA, y ya no sólo sobre inmuebles
  -- ------------------------------------------------------------------
  insert into public.parametro_regulatorio
    (codigo, nombre, valor_numerico, unidad, sector, vigente_desde, fuente, publicacion_dof, notas)
  select 'umbral_xii_fideicomiso_uma',
         'Constitución o modificación de fideicomisos traslativos o de garantía · umbral de Aviso',
         4000, 'uma', 'XII', v_hoy, v_fuente_ley, 'DOF 16/07/2025',
         v_desde_ley || E'\n'
         || 'La reforma suprimió la limitación a inmuebles: aplica a todo fideicomiso traslativo '
         || 'de dominio o de garantía, salvo los que garanticen crédito a favor de instituciones '
         || 'del sistema financiero u organismos públicos de vivienda.'
   where not exists (select 1 from public.parametro_regulatorio
                      where codigo = 'umbral_xii_fideicomiso_uma' and sector = 'XII');

  -- ------------------------------------------------------------------
  -- 4. Artículo 32: prohibición de efectivo. NO es el umbral de Aviso.
  -- ------------------------------------------------------------------
  insert into public.parametro_regulatorio
    (codigo, nombre, valor_numerico, unidad, sector, vigente_desde, fuente, publicacion_dof, notas)
  select * from (values
    ('umbral_efectivo_inmueble_uma',
     'Prohibición de pago en efectivo · inmuebles',
     8025::numeric, 'uma', 'XII', v_hoy,
     'Art. 32 LFPIORPI, reforma DOF 16/07/2025. Informe técnico Kawiil-Cumplimiento, 31/08/2026.',
     'DOF 16/07/2025',
     'NO CONFUNDIR con el umbral de Aviso de inmuebles, que es 8,000 UMA. La asimetría es '
     || 'deliberada: son artículos distintos y el informe advierte expresamente que no deben '
     || 'unificarse en los controles internos. Se mide con la UMA vigente AL DÍA DEL PAGO, no a '
     || 'la fecha del instrumento.'),
    ('umbral_efectivo_acciones_uma',
     'Prohibición de pago en efectivo · acciones y partes sociales',
     3210::numeric, 'uma', 'XII', v_hoy,
     'Art. 32 LFPIORPI, reforma DOF 16/07/2025. Informe técnico Kawiil-Cumplimiento, 31/08/2026.',
     'DOF 16/07/2025',
     'Se mide con la UMA vigente al día del pago. El fedatario debe identificar la forma de pago '
     || 'y dejar constancia; omitirlo se sanciona con porcentaje sobre el valor de la operación.')
  ) as v(codigo, nombre, valor_numerico, unidad, sector, vigente_desde, fuente, publicacion_dof, notas)
  where not exists (select 1 from public.parametro_regulatorio p
                     where p.codigo = v.codigo and p.sector = v.sector);

  -- ------------------------------------------------------------------
  -- 5. Las tipologías. Aquí es donde de verdad cambia el motor.
  -- ------------------------------------------------------------------
  -- El umbral que el motor aplica vive en `regla_dsl`, NO en el catálogo de
  -- parámetros: corregir los parámetros de arriba y parar ahí habría dejado la
  -- documentación bien y el comportamiento igual de mal.
  --
  -- Se versiona en vez de editar: los 5 hallazgos que ya existen se generaron
  -- con la v1 y tienen que poder explicarse con la regla que los produjo.
  if exists (select 1 from public.organizations where id = v_org) then

    update public.tipologia_av set activa = false
     where organization_id = v_org and sector = 'XII' and codigo = 'XII-01' and version = 1;

    insert into public.tipologia_av
      (id, organization_id, sector, codigo, nombre, descripcion, regla_dsl, severidad, version, fuente)
    select '33333333-0012-0000-0000-000000000101', v_org, 'XII', 'XII-01',
           'Transmisión de inmueble ≥ 8,000 UMA',
           'Aviso por transmisión o constitución de derechos reales sobre inmuebles cuyo valor '
           || 'alcance o supere 8,000 UMA. La base es el MAYOR entre precio pactado, valor '
           || 'catastral, valor comercial y monto garantizado por suerte principal, sin '
           || 'contribuciones ni accesorios.',
           '{
              "tipo": "agregado",
              "ventana": "6M",
              "agrupar_por": "client_id",
              "condicion": {
                "count": { "op": ">=", "valor": 1 },
                "suma_monto_uma": { "op": ">=", "valor": 8000 }
              },
              "nota": "Art. 17 fr. XII apartado A inciso a) LFPIORPI, reforma DOF 16/07/2025. La ventana de seis meses implementa la acumulación del penúltimo párrafo del art. 17 y del art. 7 del Reglamento."
            }'::jsonb,
           'alta', 2, v_fuente_ley
     where not exists (select 1 from public.tipologia_av
                        where organization_id = v_org and sector = 'XII'
                          and codigo = 'XII-01' and version = 2);

    insert into public.tipologia_av
      (id, organization_id, sector, codigo, nombre, descripcion, regla_dsl, severidad, version, fuente)
    select * from (values
      ('33333333-0012-0000-0000-000000000004'::uuid, v_org, 'XII'::sector_av, 'XII-04',
       'Persona moral: constitución o cambio patrimonial (aviso siempre)',
       'Aviso por constitución de personas morales, modificación patrimonial por aumento o '
       || 'disminución de capital social, fusión, escisión y compraventa de acciones o partes '
       || 'sociales. Sin umbral de monto.',
       '{
          "tipo": "lookup",
          "campo": "contraparte.tipo_acto",
          "valores": ["constitucion_personas_morales"],
          "nota": "Art. 17 fr. XII apartado A inciso c) LFPIORPI, reforma DOF 16/07/2025: siempre objeto de Aviso, sin umbral. Antes de la reforma tenía umbral de 8,025 UMA."
        }'::jsonb,
       'alta'::severidad_tipologia, 1, v_fuente_ley),
      ('33333333-0012-0000-0000-000000000005'::uuid, v_org, 'XII'::sector_av, 'XII-05',
       'Fideicomiso traslativo o de garantía ≥ 4,000 UMA',
       'Aviso por constitución o modificación de fideicomisos traslativos de dominio o de '
       || 'garantía cuyo valor alcance o supere 4,000 UMA. Ya no se limita a inmuebles.',
       '{
          "tipo": "agregado",
          "ventana": "6M",
          "agrupar_por": "client_id",
          "condicion": {
            "count": { "op": ">=", "valor": 1 },
            "suma_monto_uma": { "op": ">=", "valor": 4000 }
          },
          "nota": "Art. 17 fr. XII apartado A inciso d) LFPIORPI, reforma DOF 16/07/2025. La reforma bajó el umbral de 8,025 a 4,000 UMA y suprimió la limitación a inmuebles."
        }'::jsonb,
       'alta'::severidad_tipologia, 1, v_fuente_ley)
    ) as v(id, organization_id, sector, codigo, nombre, descripcion, regla_dsl, severidad, version, fuente)
    where not exists (select 1 from public.tipologia_av t
                       where t.organization_id = v.organization_id and t.sector = v.sector
                         and t.codigo = v.codigo and t.version = v.version);

    -- ----------------------------------------------------------------
    -- 6. Asiento en la bitácora de la notaría
    -- ----------------------------------------------------------------
    -- Va a SU cadena, no a la de plataforma: el sujeto obligado tiene que poder
    -- enseñar en su propio paquete de verificación desde cuándo su motor aplica
    -- el umbral correcto, y durante qué periodo aplicó el anterior.
    -- Una sola vez: repetir el asiento en cada corrida llenaría la cadena de
    -- la notaría de eventos idénticos que no cuentan nada nuevo.
    if exists (select 1 from public.evento_auditoria
                where organization_id = v_org
                  and tipo = 'umbrales_actualizados_a_regimen_vigente') then
      return;
    end if;

    v_evento := public.registrar_evento(
      v_org, 'umbrales_actualizados_a_regimen_vigente', 'tipologia_av', null,
      jsonb_build_object(
        'sector', 'XII',
        'motivo', 'Los umbrales de fe pública que traía el seed son los del régimen anterior a '
               || 'la reforma DOF 16/07/2025.',
        'fuente', v_fuente_ley,
        'inmuebles',       jsonb_build_object('antes', 16000, 'ahora', 8000, 'unidad', 'uma'),
        'personas_morales', jsonb_build_object('antes', 8025, 'ahora', 'siempre, sin umbral'),
        'fideicomisos',    jsonb_build_object('antes', 'no existía', 'ahora', 4000, 'unidad', 'uma'),
        'rige_legalmente_desde', '2025-07-17',
        'corregido_en_ikan_el',  v_hoy,
        'periodo_de_discrepancia',
          'Entre el 17/07/2025 y el ' || v_hoy || ' el motor aplicó 16,000 UMA a las '
          || 'transmisiones de inmueble y 8,025 UMA a las personas morales. Las operaciones de '
          || 'ese periodo deben volver a evaluarse con los umbrales vigentes.',
        'que_hacer', 'Correr el motor sobre las operaciones del periodo (botón «Recorrer motor») '
                  || 'y revisar los hallazgos nuevos que aparezcan.'
      ),
      'sistema', null);
  end if;
end $$;

comment on table tipologia_av is
  'Tipologías por actividad vulnerable. El umbral que el motor aplica vive en regla_dsl, no en '
  'parametro_regulatorio: ese catálogo documenta la cifra, esta tabla la ejecuta. Cambiar una sin '
  'la otra deja la documentación y el comportamiento en desacuerdo.';
