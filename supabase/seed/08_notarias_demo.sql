-- =====================================================================
-- Seed · Demo Notarías (fracción XII, fe pública) — GDL
-- =====================================================================
-- "Viste" Ikán como plataforma para notarías. Organización propia con
-- perfil_actividad='notarias', comparecientes, actos e instrumentos, y
-- tipologías XII que corren en el MISMO motor (sin código nuevo).
--
-- Requiere que la migration 0006 ya esté aplicada (enum 'XII' + columna
-- perfil_actividad). Datos ficticios, no corresponden a personas reales.
--
-- Los umbrales de la fracción XII son de REFERENCIA (16,000 UMA inmuebles,
-- "siempre" en poderes irrevocables, 8,025 UMA personas morales), sujetos a
-- confirmación con Kawiil-Cumplimiento — así viajan en regla_dsl.nota y el
-- motor los copia a regla_payload.nota_referencia del hallazgo.
-- 16,000 UMA × 113.07 ≈ 1,809,120 MXN.
-- =====================================================================

-- =================== Organización notaría demo ===================
insert into organizations (id, rfc, razon_social, sectores, perfil_actividad, domicilio_fiscal)
values (
  '12121212-1212-1212-1212-121212121212',
  'NDG260101XY0',
  'Notaría Demo GDL (DEMO)',
  '{XII}',
  'notarias',
  'Av. Chapultepec 100, Guadalajara, Jalisco'
)
on conflict (id) do update set perfil_actividad = excluded.perfil_actividad,
  sectores = excluded.sectores;

-- =================== Listas de riesgo para la org notaría ===================
-- (El motor filtra country_risk_list por organización; la org notaría necesita
--  sus propias filas para que XII-03 dispare.)
insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
values
  ('12121212-1212-1212-1212-121212121212', 'IR', 'Irán', 3, 'gafi_negra'),
  ('12121212-1212-1212-1212-121212121212', 'IR', 'Irán', 3, 'ofac_sancionado'),
  ('12121212-1212-1212-1212-121212121212', 'KP', 'Corea del Norte (RPDC)', 3, 'gafi_negra')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- =================== Comparecientes / otorgantes ===================
insert into client (id, organization_id, tipo_persona, nombre_razon_social,
                    curp, rfc, nacionalidad, entidad_federativa, pais_residencia_iso2,
                    datos_kyc, nivel_kyc, activo)
values
  ('77777777-0000-0000-0000-000000000001',
   '12121212-1212-1212-1212-121212121212', 'fisica',
   'María Fernanda Ruiz Demo (DEMO)',
   'RUFM900202MJCXXX01', 'RUFM900202AB1', 'Mexicana', 'Jalisco', 'MX',
   '{"ocupacion": "Empresaria", "origen_recursos": "Actividad empresarial"}'::jsonb,
   'N1', true),
  ('77777777-0000-0000-0000-000000000002',
   '12121212-1212-1212-1212-121212121212', 'moral',
   'Inmobiliaria Demo del Bajío S.A. de C.V. (DEMO)',
   null, 'IDB240101XX2', 'Mexicana', 'Jalisco', 'MX',
   '{"giro": "Desarrollo inmobiliario"}'::jsonb,
   'N1', true)
on conflict (id) do nothing;

-- =================== Actos / instrumentos DEMO ===================
-- tipo='otro' (no es operación cripto); el detalle va en contraparte.tipo_acto.
--
-- Los valores de `tipo_acto` son los OFICIALES del layout de fe pública del
-- SAT (rama 3.6.1.3 del instructivo), no etiquetas propias: un aviso armado
-- con nombres inventados falla la validación en el portal, el día 17.
-- Ver docs/layouts-sat/.
--
-- Ojo con el canal: la transmisión de inmuebles se presenta por DeclaraNOT,
-- NO por el SPPLD, y por eso no tiene etiqueta en el layout. Son dos sistemas
-- distintos y confundirlos hace que un notario crea que ya reportó.
insert into operation (id, organization_id, client_id, tipo, monto_mxn, moneda_origen,
                       activo_virtual, contraparte, fecha)
values
  -- XII-01 · Compraventa de inmueble ≈ $2,000,000 (> 16,000 UMA)
  ('88888888-0000-0000-0000-000000000001',
   '12121212-1212-1212-1212-121212121212', '77777777-0000-0000-0000-000000000001',
   'otro', 2000000.00, 'MXN', null,
   '{"tipo_acto": "transmision_inmueble", "pais_iso2": "MX", "canal": "declaranot", "nota_demo": "transmision de inmueble; se presenta por DeclaraNOT, no por el SPPLD"}'::jsonb,
   '2026-08-18T10:00:00Z'),

  -- XII-02 · Poder irrevocable (aviso "siempre", sin umbral de monto)
  ('88888888-0000-0000-0000-000000000002',
   '12121212-1212-1212-1212-121212121212', '77777777-0000-0000-0000-000000000001',
   'otro', 0.00, 'MXN', null,
   '{"tipo_acto": "otorgamiento_poder", "pais_iso2": "MX", "nota_demo": "poder irrevocable"}'::jsonb,
   '2026-08-18T12:00:00Z'),

  -- XII-03 · Constitución de sociedad con socio en país de riesgo (IR)
  ('88888888-0000-0000-0000-000000000003',
   '12121212-1212-1212-1212-121212121212', '77777777-0000-0000-0000-000000000002',
   'otro', 1000000.00, 'MXN', null,
   '{"tipo_acto": "constitucion_personas_morales", "pais_iso2": "IR", "socio_demo": "Socio extranjero (DEMO)", "nota_demo": "socio en pais de alto riesgo"}'::jsonb,
   '2026-08-19T09:00:00Z'),

  -- Acto benigno (no dispara ninguna tipología) — muestra que el motor es selectivo
  ('88888888-0000-0000-0000-000000000004',
   '12121212-1212-1212-1212-121212121212', '77777777-0000-0000-0000-000000000001',
   'otro', 300000.00, 'MXN', null,
   '{"tipo_acto": "constitucion_modificacion_fideicomiso", "pais_iso2": "MX", "nota_demo": "fideicomiso ordinario"}'::jsonb,
   '2026-08-19T15:00:00Z')
on conflict (id) do nothing;

-- =================== Tipologías XII (mismo motor) ===================
-- La `nota` viaja dentro de regla_dsl → el motor la copia a
-- regla_payload.nota_referencia del hallazgo.
insert into tipologia_av (id, organization_id, sector, codigo, nombre, descripcion,
                          regla_dsl, severidad, version, fuente)
values
  ('33333333-0012-0000-0000-000000000001',
   '12121212-1212-1212-1212-121212121212',
   'XII', 'XII-01', 'Transmisión de inmueble ≥ 16,000 UMA',
   'Aviso por transmisión de propiedad de bienes inmuebles cuyo valor alcance o supere 16,000 UMA.',
   '{
      "tipo": "agregado",
      "ventana": "1M",
      "agrupar_por": "client_id",
      "condicion": {
        "count": { "op": ">=", "valor": 1 },
        "suma_monto_uma": { "op": ">=", "valor": 16000 }
      },
      "nota": "Umbral de referencia (16,000 UMA), sujeto a confirmación con Kawiil-Cumplimiento."
    }'::jsonb,
   'alta', 1, 'Art. 17 fr. XII LFPIORPI (referencia, sin confirmar)'),

  ('33333333-0012-0000-0000-000000000002',
   '12121212-1212-1212-1212-121212121212',
   'XII', 'XII-02', 'Poder irrevocable (aviso siempre)',
   'Aviso por el otorgamiento de poderes irrevocables, en todos los casos y sin umbral de monto.',
   '{
      "tipo": "lookup",
      "campo": "contraparte.tipo_acto",
      "valores": ["otorgamiento_poder"],
      "nota": "Aviso siempre (sin umbral), de referencia, sujeto a confirmación con Kawiil-Cumplimiento."
    }'::jsonb,
   'alta', 1, 'Art. 17 fr. XII LFPIORPI (referencia, sin confirmar)'),

  ('33333333-0012-0000-0000-000000000003',
   '12121212-1212-1212-1212-121212121212',
   'XII', 'XII-03', 'Compareciente o socio en país de alto riesgo',
   'Compareciente, socio o contraparte con país en lista negra/gris GAFI o sancionado OFAC/ONU.',
   '{
      "tipo": "lookup",
      "campo": "contraparte.pais_iso2",
      "fuentes": ["gafi_negra", "gafi_gris", "ofac_sancionado", "onu"],
      "nota": "Señal de referencia, sujeta a confirmación con Kawiil-Cumplimiento."
    }'::jsonb,
   'critica', 1, 'GAFI · OFAC · ONU (snapshot en BD)')
on conflict (organization_id, sector, codigo, version) do nothing;
