-- =====================================================================
-- Seed · Catálogos auxiliares (países GAFI/OFAC, entidades MX, señales on-chain)
-- =====================================================================
-- Fuentes:
--   - GAFI Lista Negra/Gris (corte febrero 2025)
--   - OFAC países/regiones sancionados
--   - LISR Art. 176 / regla 3.1.15 paraísos fiscales
--   - ENR 2023 + SESNSP para clasificación de entidades MX
-- =====================================================================

-- =================== Países GAFI Lista Negra ===================
insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
values
  ('11111111-1111-1111-1111-111111111111', 'KP', 'Corea del Norte (RPDC)', 3, 'gafi_negra'),
  ('11111111-1111-1111-1111-111111111111', 'IR', 'Irán', 3, 'gafi_negra'),
  ('11111111-1111-1111-1111-111111111111', 'MM', 'Myanmar', 3, 'gafi_negra')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- =================== Países GAFI Lista Gris (feb 2025) ===================
insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
values
  ('11111111-1111-1111-1111-111111111111', 'DZ', 'Argelia', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'AO', 'Angola', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'BG', 'Bulgaria', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'BF', 'Burkina Faso', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'CM', 'Camerún', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'CI', 'Costa de Marfil', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'HR', 'Croacia', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'CD', 'República Democrática del Congo', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'HT', 'Haití', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'KE', 'Kenia', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'LB', 'Líbano', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'NG', 'Nigeria', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'SY', 'Siria', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'VE', 'Venezuela', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'YE', 'Yemen', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'ZW', 'Zimbabue', 3, 'gafi_gris')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- =================== Países / regiones sancionadas OFAC ===================
insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
values
  ('11111111-1111-1111-1111-111111111111', 'CU', 'Cuba', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'IR', 'Irán', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'KP', 'Corea del Norte', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'SY', 'Siria', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'BY', 'Bielorrusia', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'VE', 'Venezuela (sectorial)', 3, 'ofac_sancionado')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- =================== Paraísos fiscales (LISR 176) ===================
insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
values
  ('11111111-1111-1111-1111-111111111111', 'KY', 'Islas Caimán', 3, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'BM', 'Bermudas', 3, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'VG', 'Islas Vírgenes Británicas', 3, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'PA', 'Panamá', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'BZ', 'Belice', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'BS', 'Bahamas', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'SC', 'Seychelles', 3, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'JE', 'Jersey', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'GG', 'Guernsey', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'IM', 'Isla de Man', 2, 'paraiso_fiscal_mx')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- =================== Entidades MX — riesgo Alto ===================
insert into entity_risk_list (organization_id, entidad, nivel, fuente, notas)
values
  ('11111111-1111-1111-1111-111111111111', 'Baja California', 3, 'entidad_alta_mx', 'Frontera, ENR 2023 + SESNSP'),
  ('11111111-1111-1111-1111-111111111111', 'Chihuahua', 3, 'entidad_alta_mx', 'Frontera, ENR 2023'),
  ('11111111-1111-1111-1111-111111111111', 'Guanajuato', 3, 'entidad_alta_mx', 'Alta incidencia delictiva'),
  ('11111111-1111-1111-1111-111111111111', 'Guerrero', 3, 'entidad_alta_mx', 'Alta incidencia delictiva'),
  ('11111111-1111-1111-1111-111111111111', 'Jalisco', 3, 'entidad_alta_mx', 'Puerto / ruta'),
  ('11111111-1111-1111-1111-111111111111', 'Michoacán', 3, 'entidad_alta_mx', 'Puerto / ruta'),
  ('11111111-1111-1111-1111-111111111111', 'Morelos', 3, 'entidad_alta_mx', 'Incidencia delictiva'),
  ('11111111-1111-1111-1111-111111111111', 'Nuevo León', 3, 'entidad_alta_mx', 'Frontera'),
  ('11111111-1111-1111-1111-111111111111', 'Sonora', 3, 'entidad_alta_mx', 'Frontera'),
  ('11111111-1111-1111-1111-111111111111', 'Tamaulipas', 3, 'entidad_alta_mx', 'Frontera'),
  ('11111111-1111-1111-1111-111111111111', 'Zacatecas', 3, 'entidad_alta_mx', 'Ruta')
on conflict (organization_id, entidad, fuente) do nothing;

-- =================== Entidades MX — riesgo Medio ===================
insert into entity_risk_list (organization_id, entidad, nivel, fuente, notas)
values
  ('11111111-1111-1111-1111-111111111111', 'CDMX', 2, 'entidad_media_mx', 'Riesgo moderado'),
  ('11111111-1111-1111-1111-111111111111', 'Colima', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Puebla', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'San Luis Potosí', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Sinaloa', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Tabasco', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Aguascalientes', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Chiapas', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Oaxaca', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Campeche', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Durango', 2, 'entidad_media_mx', '')
on conflict (organization_id, entidad, fuente) do nothing;

-- =================== Entidades MX — riesgo Bajo ===================
insert into entity_risk_list (organization_id, entidad, nivel, fuente, notas)
values
  ('11111111-1111-1111-1111-111111111111', 'Querétaro', 1, 'entidad_baja_mx', 'Baja incidencia'),
  ('11111111-1111-1111-1111-111111111111', 'Hidalgo', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Nayarit', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Coahuila', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Tlaxcala', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Yucatán', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Baja California Sur', 1, 'entidad_baja_mx', '')
on conflict (organization_id, entidad, fuente) do nothing;

-- =================== Señales on-chain ===================
insert into alerta_on_chain_signal (organization_id, codigo, descripcion)
values
  ('11111111-1111-1111-1111-111111111111', 'MIXER_INTERACTION',  'Interacción directa con mixers / tumblers (Tornado Cash, ChipMixer, Samourai Whirlpool).'),
  ('11111111-1111-1111-1111-111111111111', 'RANSOMWARE_LINKED',  'Direcciones vinculadas a ransomware, darknet markets, stolen funds o hacks reportados.'),
  ('11111111-1111-1111-1111-111111111111', 'OFAC_SDN_WALLET',    'Wallet contraparte en OFAC SDN list.'),
  ('11111111-1111-1111-1111-111111111111', 'IMMEDIATE_WITHDRAW', 'Retiros inmediatos del 100% del saldo a wallets externas después de fondeo fiat.'),
  ('11111111-1111-1111-1111-111111111111', 'STRUCTURED_DEPOSITS','Depósitos fiat estructurados por debajo del umbral 645 UMA con patrón sistemático.'),
  ('11111111-1111-1111-1111-111111111111', 'VPN_FROM_SANCTIONED','IP/dispositivo desde país sancionado OFAC/ONU o VPN sistemática.'),
  ('11111111-1111-1111-1111-111111111111', 'DEVICE_BIOMETRIC_OVERLAP', 'Coincidencia de dispositivo / biometría / INE entre varias cuentas (smurfing).'),
  ('11111111-1111-1111-1111-111111111111', 'EXTORTION_PATTERN',  'Beneficiario o tercero repetido recibe múltiples depósitos pequeños sin relación.'),
  ('11111111-1111-1111-1111-111111111111', 'LOW_CAP_ASSET',      'Operación en activos virtuales de baja capitalización o sin prueba de reservas.'),
  ('11111111-1111-1111-1111-111111111111', 'PROFILE_INCONSISTENT','Volumen inconsistente con perfil declarado (ingresos, ocupación).'),
  ('11111111-1111-1111-1111-111111111111', 'PRIVACY_COINS_ONLY', 'Uso exclusivo de privacy coins (Monero, Zcash shielded, Dash PrivateSend).')
on conflict (organization_id, codigo) do nothing;
