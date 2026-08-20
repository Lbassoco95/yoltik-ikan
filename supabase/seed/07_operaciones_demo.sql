-- =====================================================================
-- Seed · Operaciones DEMO de Juan Pérez (RCG0.B0)
-- =====================================================================
-- Operaciones ficticias para que el Motor PLD tenga contra qué evaluar en
-- el walkthrough. NO corresponden a operaciones reales. Cada bloque está
-- diseñado para disparar una tipología concreta de forma aislada:
--
--   XVI-01 (structuring)  → 3 compras en <72h que suman >= 645 UMA
--   XVI-04 (país riesgo)   → 1 operación con contraparte en Irán (gafi_negra/ofac)
--   XVI-03 (on-chain, MOCK)→ 1 operación con exposicion_pct alto y categoría "mixer"
--   XVI-08 (privacy coins) → 1 operación en XMR (Monero)
--
-- Las señales on-chain (exposicion_pct, categorias) y de sesión (device_id, ip)
-- viven en operation.contraparte (jsonb). Son MOCK: no hay analítica on-chain
-- real integrada — el front las muestra con banner ámbar "DEMO".
-- Umbral 645 UMA * 113.07 MXN/UMA ≈ 72,930 MXN (Art. 17 LFPIORPI).
-- =====================================================================

-- --- XVI-01 Structuring: 3 compras del mismo cliente en <72h (suma ≈ 75,000 MXN > umbral) ---
insert into operation (id, organization_id, client_id, tipo, monto_mxn, moneda_origen,
                       activo_virtual, contraparte, fecha)
values
  ('66666666-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001',
   'compra_fiat_cripto', 25000.00, 'MXN', 'BTC',
   '{"pais_iso2": "MX", "nota_demo": "structuring 1/3"}'::jsonb,
   '2026-08-18T10:00:00Z'),
  ('66666666-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001',
   'compra_fiat_cripto', 25000.00, 'MXN', 'BTC',
   '{"pais_iso2": "MX", "nota_demo": "structuring 2/3"}'::jsonb,
   '2026-08-18T16:00:00Z'),
  ('66666666-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001',
   'compra_fiat_cripto', 25000.00, 'MXN', 'BTC',
   '{"pais_iso2": "MX", "nota_demo": "structuring 3/3"}'::jsonb,
   '2026-08-19T09:00:00Z')
on conflict (id) do nothing;

-- --- XVI-04 País de alto riesgo: contraparte en Irán (gafi_negra + ofac) ---
insert into operation (id, organization_id, client_id, tipo, monto_mxn, moneda_origen,
                       activo_virtual, contraparte, fecha)
values
  ('66666666-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001',
   'venta_cripto_fiat', 15000.00, 'MXN', 'USDT',
   '{"pais_iso2": "IR", "nota_demo": "contraparte pais de alto riesgo"}'::jsonb,
   '2026-08-19T11:00:00Z')
on conflict (id) do nothing;

-- --- XVI-03 Exposición on-chain (MOCK): wallet con 35% de exposición a mixer ---
insert into operation (id, organization_id, client_id, tipo, monto_mxn, moneda_origen,
                       activo_virtual, contraparte, fecha)
values
  ('66666666-0000-0000-0000-000000000005',
   '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001',
   'retiro_cripto', 40000.00, 'MXN', 'ETH',
   '{"pais_iso2": "MX", "exposicion_pct": 35, "categorias": ["mixer"], "fuente_mock": true, "nota_demo": "DEMO exposicion on-chain simulada"}'::jsonb,
   '2026-08-19T14:00:00Z')
on conflict (id) do nothing;

-- --- XVI-08 Privacy coins: operación en Monero (XMR) ---
insert into operation (id, organization_id, client_id, tipo, monto_mxn, moneda_origen,
                       activo_virtual, contraparte, fecha)
values
  ('66666666-0000-0000-0000-000000000006',
   '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001',
   'compra_fiat_cripto', 12000.00, 'MXN', 'XMR',
   '{"pais_iso2": "MX", "nota_demo": "privacy coin"}'::jsonb,
   '2026-08-19T15:00:00Z')
on conflict (id) do nothing;
