-- =====================================================================
-- Seed 15 · Clave de actividad vulnerable de las organizaciones demo
-- =====================================================================
-- <clave_actividad> (campo 2.3 del layout) es una de las tres claves sin las
-- cuales el XML no pasa validación. Ya no hay que adivinarla: viene del
-- catálogo de actividades vulnerables que publica el SAT en la plantilla
-- 0InformeEnCeros.xlsm — "FEP, FE PUBLICA" y "AVI, OPERACIONES CON ACTIVOS
-- VIRTUALES" (ver seed 14).
--
-- Las otras dos —clave_sujeto_obligado y clave_entidad_colegiada— NO se
-- siembran: el SAT las asigna a cada sujeto obligado al inscribirse en el
-- padrón, no se derivan de nada, y ponerles un valor plausible sería fabricar
-- la identidad con la que se reporta. Se quedan en null y la pantalla de
-- pendientes las reclama.
-- =====================================================================

update organizations
   set clave_actividad = 'FEP'
 where id = '12121212-1212-1212-1212-121212121212'
   and clave_actividad is null;

update organizations
   set clave_actividad = 'AVI'
 where id = '11111111-1111-1111-1111-111111111111'
   and clave_actividad is null;

-- Comprobación: las claves sembradas existen en el catálogo.
do $$
begin
  if exists (
    select 1 from organizations o
    where o.clave_actividad is not null
      and not public.clave_valida_en_catalogo('actividades_vulnerables', o.clave_actividad)
  ) then
    raise exception 'Alguna organización quedó con una clave_actividad fuera del catálogo';
  end if;
end $$;
