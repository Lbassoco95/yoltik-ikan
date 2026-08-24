-- =====================================================================
-- Seed · Tipologías sector XVI (Activos Virtuales)
-- =====================================================================
-- 8 tipologías derivadas de la metodología Ixim Pay y de las señales de
-- alerta UIF para activos virtuales (Anexo D de la metodología PLD-FT).
-- Cada `regla_dsl` es declarativa: el Motor PLD las interpreta sin código.
-- =====================================================================

insert into tipologia_av (id, organization_id, sector, codigo, nombre, descripcion,
                          regla_dsl, severidad, version, fuente)
values
  -- XVI-01 Structuring
  ('33333333-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-01', 'Structuring (fraccionamiento)',
   'Al menos 3 operaciones del mismo cliente en 72 horas cuya suma alcance o supere 645 UMA.',
   '{
      "tipo": "agregado",
      "ventana": "72h",
      "agrupar_por": "client_id",
      "condicion": {
        "count": { "op": ">=", "valor": 3 },
        "suma_monto_uma": { "op": ">=", "valor": 645 }
      }
    }'::jsonb,
   'alta', 1, 'UIF Guía 24h · ENR 2023 · Guía señales LD/FT'),

  -- XVI-02 Layering
  ('33333333-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-02', 'Layering (retiro inmediato post-fondeo)',
   'Retiro on-chain >= 90% del saldo dentro de 24 horas posteriores a fondeo fiat.',
   '{
      "tipo": "secuencia",
      "ventana": "24h",
      "secuencia": ["deposito_fiat", "retiro_cripto"],
      "condicion": { "razon_retiro_saldo": { "op": ">=", "valor": 0.9 } }
    }'::jsonb,
   'alta', 1, 'GAFI Recomendación 15 · Anexo D Metodología Ixim Pay'),

  -- XVI-03 Exposición on-chain
  ('33333333-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-03', 'Exposición on-chain a mixers o sanctioned',
   'Wallet contraparte con exposición > 10% a Tornado Cash, ChipMixer, OFAC SDN, ransomware o darknet.',
   '{
      "tipo": "score",
      "fuente": "blockchain_analytics_mock",
      "condicion": {
        "exposicion_pct": { "op": ">", "valor": 10 },
        "categorias": ["mixer", "ofac_sdn", "ransomware", "darknet"]
      }
    }'::jsonb,
   'critica', 1, 'Anexo D · señales on-chain UIF'),

  -- XVI-04 Operación con país de alto riesgo
  ('33333333-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-04', 'Operación con país de alto riesgo',
   'Origen o destino en lista negra/gris GAFI o sancionado OFAC/ONU.',
   '{
      "tipo": "lookup",
      "campo": "contraparte.pais_iso2",
      "fuentes": ["gafi_negra", "gafi_gris", "ofac_sancionado", "onu"]
    }'::jsonb,
   'critica', 1, 'GAFI 02/2025 · OFAC · ONU consolidada'),

  -- XVI-05 Smurfing por dispositivo / biometría
  ('33333333-0000-0000-0000-000000000005',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-05', 'Smurfing por dispositivo o biometría',
   'Dos o más cuentas con coincidencia de device_id, IP o biometría facial.',
   '{
      "tipo": "duplicado",
      "campos": ["device_id", "ip", "biometric_hash"],
      "umbral_cuentas": 2
    }'::jsonb,
   'alta', 1, 'Señales de alerta UIF · estructuración'),

  -- XVI-06 VPN / Tor sistemática
  ('33333333-0000-0000-0000-000000000006',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-06', 'Uso sistemático de VPN o Tor',
   'Cinco o más accesos del cliente desde IPs de VPN/Tor conocidas en el mes.',
   '{
      "tipo": "agregado",
      "ventana": "1M",
      "agrupar_por": "client_id",
      "condicion": { "count_ip_anonima": { "op": ">=", "valor": 5 } }
    }'::jsonb,
   'media', 1, 'Anexo D · señales on-chain · GAFI 2021 VASPs'),

  -- XVI-07 Operación fuera de perfil
  ('33333333-0000-0000-0000-000000000007',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-07', 'Operación fuera del perfil transaccional',
   'Volumen mensual del cliente > 3x el promedio histórico declarado.',
   '{
      "tipo": "desviacion",
      "factor": 3.0,
      "comparar": "promedio_historico_mensual"
    }'::jsonb,
   'alta', 1, 'Metodología Ixim Pay §6 — perfil transaccional'),

  -- XVI-08 Privacy coins
  ('33333333-0000-0000-0000-000000000008',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-08', 'Uso de privacy coins',
   'Operación con activos virtuales de privacidad (Monero, Zcash shielded, Dash PrivateSend).',
   '{
      "tipo": "lookup",
      "campo": "activo_virtual",
      "valores": ["XMR", "ZEC", "DASH"]
    }'::jsonb,
   'media', 1, 'GAFI Recomendación 15 · Banxico Circular 4/2019')
on conflict (organization_id, sector, codigo, version) do nothing;
