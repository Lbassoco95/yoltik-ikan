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
-- Los umbrales son los del régimen VIGENTE tras la reforma DOF 16/07/2025,
-- según el informe técnico de Kawiil-Cumplimiento del 31/08/2026:
--   inciso a) inmuebles          ≥ 8,000 UMA   (antes 16,000)
--   inciso b) poder irrevocable  siempre, sin umbral
--   inciso c) personas morales   siempre, sin umbral   (antes 8,025 UMA)
--   inciso d) fideicomisos       ≥ 4,000 UMA   (antes 8,025 y sólo inmuebles)
--
-- Este seed sembraba los ANTERIORES. Estuvieron en producción y el motor
-- calculó con ellos; la migration 0030 los corrigió allí y dejó el asiento.
-- 8,000 UMA × 117.31 = 938,480 MXN.
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
-- El nombre va PARTIDO, no sólo en `nombre_razon_social`. El layout de fe
-- pública pide nombre, apellido paterno y apellido materno en campos separados
-- (3.5.1 a 3.5.3), y la migration 0019 añadió las columnas. El seed se quedó
-- con el nombre completo en una sola cadena, así que la compareciente del demo
-- nacía incompleta: al generar el aviso de agosto salían «falta el nombre del
-- compareciente» y «falta el apellido paterno» por cada acto suyo. Un demo cuyo
-- camino feliz no llega al final no demuestra nada.
--
-- Y la fecha de nacimiento tiene que CUADRAR con el RFC y la CURP: las tres
-- llevan los mismos AAMMDD dentro, y el validador del layout compara. 900202 en
-- la clave es el 2 de febrero de 1990; ponerle otra fecha reproduciría el error
-- que la regla VC354R4 existe para cazar.
insert into client (id, organization_id, tipo_persona, nombre_razon_social,
                    nombre, apellido_paterno, apellido_materno, fecha_nacimiento,
                    curp, rfc, nacionalidad, entidad_federativa, pais_residencia_iso2,
                    datos_kyc, nivel_kyc, activo)
values
  ('77777777-0000-0000-0000-000000000001',
   '12121212-1212-1212-1212-121212121212', 'fisica',
   -- Sin «(DEMO)» pegado al nombre, y no por descuido: el trigger
   -- componer_nombre_cliente (migration 0019) recompone nombre_razon_social
   -- desde las partes en cuanto existen, así que el marcador se perdía en el
   -- insert y esta cadena quedaba mintiendo sobre lo que hay en la base.
   -- Meterlo en las partes tampoco sirve: nombre y apellidos VIAJAN AL XML del
   -- aviso, y ahí un «(DEMO)» sería un dato falso presentado a la autoridad.
   -- Que el expediente es de prueba lo dice organizations.es_demostracion
   -- (migration 0034): la barra ámbar en cada pantalla y el candado que impide
   -- firmar el aviso. Ése es el mecanismo, no un sufijo en un nombre.
   'María Fernanda Ruiz Demo',
   'María Fernanda', 'Ruiz', 'Demo', date '1990-02-02',
   'RUFM900202MJCXXX01', 'RUFM900202AB1', 'Mexicana', 'Jalisco', 'MX',
   '{"ocupacion": "Empresaria", "origen_recursos": "Actividad empresarial", "email": "maria.ruiz@demo.mx", "telefono": "+523300000001"}'::jsonb,
   'N1', true),
  ('77777777-0000-0000-0000-000000000002',
   '12121212-1212-1212-1212-121212121212', 'moral',
   'Inmobiliaria Demo del Bajío S.A. de C.V. (DEMO)',
   -- Una persona moral no lleva apellidos ni fecha de nacimiento: lleva fecha
   -- de constitución, y el layout la pide en otro campo.
   null, null, null, null,
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
  -- XII-01 · Compraventa de inmueble ≈ $2,000,000 (> 8,000 UMA)
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
--
-- El `filtro` de las reglas agregadas (migration 0031) NO es opcional aquí: sin
-- él, XII-01 sumaba TODOS los actos del compareciente en el mes para decidir si
-- rebasaba el umbral de inmuebles. La ley acumula por tipo de acto, no por
-- persona. Un poder, una constitución y una compraventa del mismo compareciente
-- sumaban entre sí y disparaban un umbral que ninguno alcanzaba por su cuenta.
-- `genera_aviso` (migration 0035) dice cuáles corresponden a un supuesto de
-- Aviso del artículo 17 y cuáles son señal de riesgo para la bandeja del OC.
-- Va explícito aquí y no sólo en la migration porque en un proyecto nuevo las
-- migrations corren ANTES que los seeds: si dependiera del update de la 0035,
-- estas tipologías nacerían todas sin marcar y ningún acto entraría al aviso.
insert into tipologia_av (id, organization_id, sector, codigo, nombre, descripcion,
                          regla_dsl, severidad, version, fuente, genera_aviso)
values
  ('33333333-0012-0000-0000-000000000001',
   '12121212-1212-1212-1212-121212121212',
   'XII', 'XII-01', 'Transmisión de inmueble ≥ 8,000 UMA',
   'Aviso por transmisión o constitución de derechos reales sobre inmuebles cuyo valor alcance o supere 8,000 UMA. La base es el MAYOR entre precio pactado, valor catastral, valor comercial y monto garantizado por suerte principal, sin contribuciones ni accesorios (art. 6 del Reglamento).',
   '{
      "tipo": "agregado",
      "ventana": "1M",
      "agrupar_por": "client_id",
      "filtro": {
        "campo": "contraparte.tipo_acto",
        "valores": ["transmision_inmueble"]
      },
      "condicion": {
        "count": { "op": ">=", "valor": 1 },
        "suma_monto_uma": { "op": ">=", "valor": 8000 }
      },
      "nota": "Art. 17 fr. XII apartado A inciso a) LFPIORPI, reforma DOF 16/07/2025."
    }'::jsonb,
   'alta', 1, 'Art. 17 fr. XII LFPIORPI, reforma DOF 16/07/2025. Informe Kawiil-Cumplimiento 31/08/2026.', true),

  ('33333333-0012-0000-0000-000000000002',
   '12121212-1212-1212-1212-121212121212',
   'XII', 'XII-02', 'Poder irrevocable (aviso siempre)',
   'Aviso por el otorgamiento de poderes irrevocables, en todos los casos y sin umbral de monto.',
   '{
      "tipo": "lookup",
      "campo": "contraparte.tipo_acto",
      "valores": ["otorgamiento_poder"],
      "nota": "Art. 17 fr. XII apartado A inciso b) LFPIORPI: aviso siempre, sin umbral de monto."
    }'::jsonb,
   'alta', 1, 'Art. 17 fr. XII LFPIORPI, reforma DOF 16/07/2025. Informe Kawiil-Cumplimiento 31/08/2026.', true),

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
   'critica', 1, 'GAFI · OFAC · ONU (snapshot en BD)', false),

  -- Los dos supuestos que la reforma DOF 16/07/2025 cambió de fondo y que este
  -- seed no cubría. El acto de fideicomiso ya estaba sembrado arriba y ninguna
  -- tipología lo miraba: se capturaba y no producía nada.
  ('33333333-0012-0000-0000-000000000004',
   '12121212-1212-1212-1212-121212121212',
   'XII', 'XII-04', 'Persona moral: constitución o cambio patrimonial (aviso siempre)',
   'Aviso por constitución de personas morales, modificación patrimonial por aumento o disminución de capital social, fusión, escisión y compraventa de acciones o partes sociales. Sin umbral de monto.',
   '{
      "tipo": "lookup",
      "campo": "contraparte.tipo_acto",
      "valores": ["constitucion_personas_morales", "modificacion_patrimonial",
                  "fusion", "escision", "compra_venta_acciones"],
      "nota": "Art. 17 fr. XII apartado A inciso c) LFPIORPI, reforma DOF 16/07/2025: siempre objeto de Aviso, sin umbral. Antes de la reforma tenía umbral de 8,025 UMA."
    }'::jsonb,
   'alta', 1, 'Art. 17 fr. XII LFPIORPI, reforma DOF 16/07/2025. Informe Kawiil-Cumplimiento 31/08/2026.', true),

  ('33333333-0012-0000-0000-000000000005',
   '12121212-1212-1212-1212-121212121212',
   'XII', 'XII-05', 'Fideicomiso traslativo o de garantía ≥ 4,000 UMA',
   'Aviso por constitución o modificación de fideicomisos traslativos de dominio o de garantía cuyo valor alcance o supere 4,000 UMA. Ya no se limita a inmuebles.',
   '{
      "tipo": "agregado",
      "ventana": "6M",
      "agrupar_por": "client_id",
      "filtro": {
        "campo": "contraparte.tipo_acto",
        "valores": ["constitucion_modificacion_fideicomiso"]
      },
      "condicion": {
        "count": { "op": ">=", "valor": 1 },
        "suma_monto_uma": { "op": ">=", "valor": 4000 }
      },
      "nota": "Art. 17 fr. XII apartado A inciso d) LFPIORPI, reforma DOF 16/07/2025. Bajó de 8,025 a 4,000 UMA y se suprimió la limitación a inmuebles."
    }'::jsonb,
   'alta', 1, 'Art. 17 fr. XII LFPIORPI, reforma DOF 16/07/2025. Informe Kawiil-Cumplimiento 31/08/2026.', true)
on conflict (organization_id, sector, codigo, version) do nothing;
