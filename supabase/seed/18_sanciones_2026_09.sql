-- =====================================================================
-- Seed 18 · Sanciones ONU y OFAC, lectura del 01/09/2026
-- =====================================================================
-- Las migrations 0053 y 0055 dejan el cargador y el modelo; nadie los llama.
-- Sin este seed, un proyecto nuevo acaba con las tablas de regímenes VACÍAS y
-- con `country_risk_list` sin una sola fila de sanciones —el mismo falso
-- negativo silencioso que la 0051 existe para cazar, sólo que en una base
-- recién creada, donde nadie lo va a estar buscando—.
--
-- Se llama a la función en vez de repetir los datos aquí. Dos copias de una
-- lista de sanciones se desincronizan en cuanto alguien corrige una, y la que
-- quede atrás no va a dar ninguna señal.
select * from public.cargar_regimenes_2026_09();
select * from public.proyectar_sanciones_a_paises();
