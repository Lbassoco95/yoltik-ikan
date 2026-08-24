-- =====================================================================
-- Seed · Metodología EBR sector XVI (Ixim Pay)
-- =====================================================================
-- Valores exactos del archivo "Metodologia EBR - Ixim Pay.xlsx".
-- 5 Elementos con pesos institucionales, sus indicadores con peso interno
-- y nivel inherente.
-- =====================================================================

-- Metodología
insert into risk_methodology (id, organization_id, sector, version,
                              apetito_riesgo, frecuencia_revision, notas)
values (
  '22222222-2222-2222-2222-222222222201',
  '11111111-1111-1111-1111-111111111111',
  'XVI', 1, 'medio', 'anual',
  'Metodología EBR base Ixim Pay — Activos Virtuales (Art. 17 fr. XVI LFPIORPI).'
)
on conflict (organization_id, sector, version) do nothing;

-- ============================
-- ELEMENTO 1 — Productos y Servicios (peso 0.25, impacto 75%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E1_PRODUCTOS',
          'Productos y Servicios', 0.25, 75, 1)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E1-01', 'On/off ramp (fiat⇄cripto)', 'Anonimato o falta de identificación del Usuario', 0.35::numeric, 2, 1),
  ('E1-02', 'On/off ramp (fiat⇄cripto)', 'Producto que facilita la transferencia de valor', 0.40::numeric, 3, 2),
  ('E1-03', 'On/off ramp (fiat⇄cripto)', 'Manipulación de grandes volúmenes de recursos', 0.25::numeric, 3, 3)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;

-- ============================
-- ELEMENTO 2 — Tipos de Usuario (peso 0.20, impacto 50%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E2_USUARIO',
          'Tipos de Usuario', 0.20, 50, 2)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E2-01', 'Persona Física', 'Tipo de persona', 0.15::numeric, 2, 1),
  ('E2-02', 'Persona Física', 'Edad', 0.10::numeric, 2, 2),
  ('E2-03', 'Persona Física', 'Nacionalidad', 0.15::numeric, 2, 3),
  ('E2-04', 'Persona Física', 'Ocupación / actividad económica', 0.15::numeric, 2, 4),
  ('E2-05', 'Persona Física', 'Identificados en listas PEPs o bloqueados', 0.20::numeric, 3, 5),
  ('E2-06', 'Persona Moral', 'Antigüedad / tipo de sociedad / BC', 0.15::numeric, 3, 6),
  ('E2-07', 'Persona Moral', 'Beneficiario Controlador (transparencia)', 0.10::numeric, 3, 7)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;

-- ============================
-- ELEMENTO 3 — Países y Áreas Geográficas (peso 0.10, impacto 45%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E3_PAISES',
          'Países y Áreas Geográficas', 0.10, 45, 3)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E3-01', 'Países (contraparte externa)', 'Regímenes fiscales preferentes', 0.15::numeric, 2, 1),
  ('E3-02', 'Países (contraparte externa)', 'Medidas deficientes en LD/FT (GAFI)', 0.15::numeric, 3, 2),
  ('E3-03', 'Países (contraparte externa)', 'Alto nivel de corrupción', 0.10::numeric, 2, 3),
  ('E3-04', 'Países (contraparte externa)', 'Alto nivel de delincuencia', 0.15::numeric, 3, 4),
  ('E3-05', 'Países (contraparte externa)', 'Sancionados OFAC/ONU', 0.15::numeric, 3, 5),
  ('E3-06', 'Áreas geográficas nacionales (México)', 'Entidades de incidencia delictiva alta', 0.15::numeric, 3, 6),
  ('E3-07', 'Áreas geográficas nacionales (México)', 'Entidades con frontera y puertos internacionales', 0.15::numeric, 2, 7)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;

-- ============================
-- ELEMENTO 4 — Canales (peso 0.15, impacto 55%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E4_CANALES',
          'Canales de contratación, fondeo y retiro', 0.15, 55, 4)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E4-01', 'Alta no presencial (web/app)', 'Canales no presenciales', 0.30::numeric, 3, 1),
  ('E4-02', 'SPEI fiat in/out', 'Acceso inmediato a recursos', 0.25::numeric, 3, 2),
  ('E4-03', 'Retiro on-chain', 'Canales que permiten operaciones por montos altos', 0.25::numeric, 3, 3),
  ('E4-04', 'Retiro on-chain', 'Canales con exposición a wallets externas / cripto-nativas', 0.20::numeric, 3, 4)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;

-- ============================
-- ELEMENTO 5 — Transacciones (peso 0.30, impacto 70%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E5_TRANSACCIONES',
          'Transacciones (calibrado con Ops 2025)', 0.30, 70, 5)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E5-01', 'Compra fiat→cripto', 'Monto de las transacciones (ticket promedio)', 0.20::numeric, 2, 1),
  ('E5-02', 'Compra fiat→cripto', 'Volumen mensual acumulado', 0.20::numeric, 2, 2),
  ('E5-03', 'Venta cripto→fiat', 'Frecuencia transaccional', 0.15::numeric, 2, 3),
  ('E5-04', 'Compra + venta', 'Origen de las transacciones (fiat in)', 0.15::numeric, 2, 4),
  ('E5-05', 'Compra + venta', 'Destino de las transacciones (cripto out)', 0.15::numeric, 3, 5),
  ('E5-06', 'Compra + venta', 'Exposición on-chain (mixers, sanctioned, darknet)', 0.15::numeric, 3, 6)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;
