-- =====================================================================
-- Seed · Cliente Juan Pérez Ejemplo (persona ficticia)
-- =====================================================================
-- Cliente final de muestra para el walkthrough del demo.
-- Sus datos no corresponden a ninguna persona real.
-- =====================================================================

insert into client (id, organization_id, tipo_persona, nombre_razon_social,
                    curp, rfc, nacionalidad, entidad_federativa, pais_residencia_iso2,
                    datos_kyc, nivel_kyc, alto_de_oficio, activo)
values (
  '55555555-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'fisica',
  'Juan Pérez Ejemplo (DEMO)',
  'PEJU850101HDFXXX01',
  'PEJU850101ABC',
  'Mexicana',
  'CDMX',
  'MX',
  '{
    "telefono": "+52 55 0000 0000",
    "email": "juan.perez+demo@ejemplo.mx",
    "domicilio": "Calle Demo 123, CDMX",
    "ocupacion": "Empleado formal",
    "origen_recursos": "Nómina"
  }'::jsonb,
  'N1', false, true
)
on conflict (id) do nothing;

-- Evaluación de riesgo precargada (score 17 → Bajo)
insert into client_risk_assessment (client_id, template_id, respuestas, subtotales,
                                    score_total, clasificacion)
values (
  '55555555-0000-0000-0000-000000000001',
  '44444444-0000-0000-0000-000000000001',
  '{
    "PROD-01": 3,
    "CLI-PF-01": 1, "CLI-PF-02": 2, "CLI-PF-03": 1, "CLI-PF-04": 1, "CLI-PF-05": 1,
    "PAIS-01": 1, "PAIS-02": 2, "PAIS-03": 1,
    "CAN-01": 2, "CAN-02": 1, "CAN-03": 2,
    "TRX-01": 1, "TRX-02": 1, "TRX-03": 1, "TRX-04": 1, "TRX-05": 1, "TRX-06": 1, "TRX-07": 1
  }'::jsonb,
  '{
    "E1_PRODUCTOS": 3,
    "E2_CLIENTE": 6,
    "E3_PAISES": 4,
    "E4_CANALES": 5,
    "E5_TRANSACCIONES": 7
  }'::jsonb,
  17,
  'bajo'
);

-- NOTA: este cliente sirve para que el operador pueda capturar operaciones
-- adicionales y para que el Motor PLD tenga contra qué evaluar tipologías.
