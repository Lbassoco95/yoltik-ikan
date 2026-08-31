-- =====================================================================
-- Seed 15 · Clave de actividad vulnerable de las organizaciones demo
-- =====================================================================
-- <clave_actividad> (campo 2.3 del layout) es una de las tres claves sin las
-- cuales el XML no pasa validación. Ya no hay que adivinarla: viene del
-- catálogo de actividades vulnerables que publica el SAT en la plantilla
-- 0InformeEnCeros.xlsm — "FEP, FE PUBLICA" y "AVI, OPERACIONES CON ACTIVOS
-- VIRTUALES" (ver seed 14).
--
-- clave_sujeto_obligado SÍ se deriva, y esta nota decía lo contrario. El
-- instructivo del layout lo fija en su regla VC22R1: «La clave del campo debe
-- ser el Registro Federal de Contribuyentes (RFC) con Homoclave del Sujeto
-- Obligado.» La pone la migration 0031 a partir del RFC de la organización.
--
-- El matiz que sí importa fuera de la demo: el sujeto obligado de la fracción
-- XII es el FEDATARIO, persona física, y su RFC es de 13 caracteres. Una
-- organización dada de alta con RFC de persona moral valida contra el patrón
-- igual, pero el RFC correcto para reportar es el del notario.
--
-- clave_entidad_colegiada sí se queda en null, y ahí el razonamiento original
-- se sostiene: sólo aplica cuando quien reporta es un colegio en nombre de sus
-- miembros (reglas VC22R2 y VC22R3), no se deriva de ningún dato que tengamos,
-- y ponerle un valor plausible sería fabricar bajo qué entidad se reporta.
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
