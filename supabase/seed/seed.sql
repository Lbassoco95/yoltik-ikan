-- =====================================================================
-- Ikán · Entrypoint de seeds
-- =====================================================================
-- Aplica todos los seeds en orden. Ejecutar después de las migrations.
--
-- Contra el remoto cibpguwwggwzdhhpdomz:
--   export DB_URL='postgresql://postgres.cibpguwwggwzdhhpdomz:<PW>@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
--   psql "$DB_URL" -f supabase/seed/01_organization_fiatcoin.sql
--   ... (y los otros 5 en orden)
--
-- Localmente con `supabase start` (opcional):
--   psql "$SUPABASE_DB_URL" -f supabase/seed/seed.sql
--
-- ORDEN:
--   1. Organización (FIATCOIN)
--   2. Metodología EBR XVI
--   3. Tipologías XVI (catálogo del motor)
--   4. Catálogos auxiliares (países GAFI/OFAC, entidades MX, señales on-chain)
--   5. Plantilla matriz de cliente XVI
--   6. Cliente Juan Pérez Ejemplo (demo)
--   7. Operaciones DEMO de Juan Pérez (para que el Motor PLD genere hallazgos)
-- =====================================================================

\i 01_organization_fiatcoin.sql
\i 02_metodologia_ebr_xvi.sql
\i 03_tipologias_xvi.sql
\i 04_catalogos_paises_entidades.sql
\i 05_plantilla_matriz_cliente_xvi.sql
\i 06_juan_perez_demo.sql
\i 07_operaciones_demo.sql
