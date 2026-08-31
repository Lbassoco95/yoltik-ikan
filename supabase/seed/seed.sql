-- =====================================================================
-- Ikán · Entrypoint de seeds
-- =====================================================================
-- Aplica todos los seeds en orden. Ejecutar después de las migrations.
--
-- Contra el remoto cibpguwwggwzdhhpdomz:
--   export DB_URL='postgresql://postgres.cibpguwwggwzdhhpdomz:<PW>@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
--   psql "$DB_URL" -f supabase/seed/01_organization_ixim_pay.sql
--   ... (y los otros 5 en orden)
--
-- Localmente con `supabase start` (opcional):
--   psql "$SUPABASE_DB_URL" -f supabase/seed/seed.sql
--
-- ORDEN:
--   1. Organización (Ixim Pay)
--   2. Metodología EBR XVI
--   3. Tipologías XVI (catálogo del motor)
--   4. Catálogos auxiliares (países GAFI/OFAC, entidades MX, señales on-chain)
--   5. Plantilla matriz de cliente XVI
--   6. Cliente Juan Pérez Ejemplo (demo)
--   7. Operaciones DEMO de Juan Pérez (para que el Motor PLD genere hallazgos)
--   8. Demo Notarías (org XII, comparecientes, actos, tipologías XII)
--   9. Plantilla matriz de cliente XII
--  10. Parámetros regulatorios (UMA y umbrales, con su fuente)
--  11. Listas y fuentes
--  12. Situaciones del 69-B
--  13. Catálogos del layout de fe pública
--  14. Catálogos de la UIF (actividades vulnerables, alertas)
--  15. Clave de actividad y clave del padrón de las organizaciones demo
--  16. Régimen vigente: lo que las migrations no pudieron aplicar
--
-- POR QUÉ EXISTE EL 16
--
-- Las migrations corren ANTES que los seeds. Las que corrigen datos —la 0033
-- con los umbrales de activos virtuales, la 0035 con los supuestos de Aviso—
-- no encuentran nada que corregir en un proyecto nuevo, y el proyecto arranca
-- con el régimen anterior a la reforma. El 16 aplica esas correcciones cuando
-- los datos ya existen. Es idempotente y en producción no cambia nada.
--
-- Los seeds 09 a 15 estuvieron fuera de esta lista y se aplicaron a mano al
-- proyecto remoto. Un proyecto nuevo arrancaba sin UMA y sin un solo umbral,
-- y el Motor PLD se niega a correr sin UMA vigente: no fallaba a medias,
-- no arrancaba.
-- =====================================================================

\i 01_organization_ixim_pay.sql
\i 02_metodologia_ebr_xvi.sql
\i 03_tipologias_xvi.sql
\i 04_catalogos_paises_entidades.sql
\i 05_plantilla_matriz_cliente_xvi.sql
\i 06_juan_perez_demo.sql
\i 07_operaciones_demo.sql
-- Requiere migration 0006 (enum 'XII' + perfil_actividad) ya aplicada:
\i 08_notarias_demo.sql
\i 09_plantilla_matriz_cliente_xii.sql
\i 10_parametros_regulatorios.sql
\i 11_listas_fuentes.sql
\i 12_situaciones_69b.sql
\i 13_catalogos_fep.sql
-- El 15 comprueba sus claves contra el catálogo que siembra el 14: en ese orden.
\i 14_catalogos_uif.sql
\i 15_clave_actividad_demos.sql
\i 16_regimen_vigente.sql
