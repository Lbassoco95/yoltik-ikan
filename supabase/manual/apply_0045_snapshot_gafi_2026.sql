-- =====================================================================
-- Ikán · Aplicar migration 0045 en el SQL Editor
-- =====================================================================
-- QUÉ CARGA
--
-- El snapshot del GAFI del plenario de junio de 2026, de la fuente primaria:
--   · «Jurisdictions under Increased Monitoring — 19 June 2026»
--   · «High-Risk Jurisdictions subject to a Call for Action — 19 June 2026»
--   GAFI/FATF, París, 19 de junio de 2026.
--
-- Cierra el snapshot anterior —el corte de febrero de 2025 que selló la 0043—
-- y carga el nuevo en TODAS las organizaciones que tengan listas del GAFI.
--
-- La lista gris pasa de 16 a 22. No entran seis: entran ONCE y salen CINCO.
--
--   Salen:  Argelia, Burkina Faso, Croacia, Nigeria, Zimbabue.
--   Entran: Bolivia, Bosnia y Herzegovina, Irak, Islas Vírgenes (RU), Kuwait,
--           Lao PDR, Mónaco, Nepal, Papúa Nueva Guinea, Sudán del Sur, Vietnam.
--
-- La lista negra no cambia: Corea del Norte, Irán y Myanmar.
--
-- DOS COSAS QUE CUMPLIMIENTO TIENE QUE VER
--
-- 1. La Adenda 1 dice que hay VEINTIUNA jurisdicciones bajo monitoreo
--    intensificado. El documento del GAFI lista VEINTIDÓS, y coinciden su
--    bloque de metadatos y sus secciones de cuerpo. Se cargan las 22 de la
--    fuente; ajustar la lista a la cifra de la Adenda significaría quitar un
--    país a ojo. Hay que confirmar cuál cuenta corrige a la otra.
--
-- 2. Myanmar está en llamado a la acción pero el GAFI pide DILIGENCIA
--    REFORZADA y NO contramedidas —lo dice con esas palabras— y considerará
--    contramedidas si no hay avance para octubre de 2026. El indicador
--    GAFI_LLAMADO_ACCION de la matriz v3 describe su efecto como «conlleva
--    contramedidas», lo que para Myanmar sobrepasa lo pedido. El piso de banda
--    alta sigue siendo defendible para las tres, así que la matriz no se toca
--    aquí; el matiz queda en las notas de cada fila.
--
-- LO QUE NO HACE
--
-- No borra nada. El snapshot de 2025-02 se cierra con `vigente_hasta`: los
-- expedientes calificados con él tienen que poder explicarse con la lista que
-- se les aplicó.
--
-- ORDEN: después de la 0043. Puede aplicarse antes o después de desplegar el
-- front: la aplicación ya filtra por `vigente_hasta is null` y no necesita
-- cambios para ver el snapshot nuevo.
--
-- IDEMPOTENTE: si el snapshot ya está cargado devuelve 0 y no toca nada.
-- =====================================================================

begin;

-- =====================================================================
-- 0045 · El snapshot del GAFI, al plenario de junio de 2026
-- =====================================================================
-- Fuente PRIMARIA, no una paráfrasis:
--   · «Jurisdictions under Increased Monitoring — 19 June 2026», GAFI/FATF,
--     París, 19 de junio de 2026.
--   · «High-Risk Jurisdictions subject to a Call for Action — 19 June 2026»,
--     GAFI/FATF, París, 19 de junio de 2026.
--   · Plenario del 17-19 de junio de 2026 (presidencia de Elisa de Anda Madrazo).
--
-- La 0043 selló lo que había como `2025-02`, que era su corte real, y dejó
-- anotado que faltaba este snapshot. Esto lo cierra.
--
-- ---------------------------------------------------------------------
-- Lo que cambia respecto de febrero de 2025
-- ---------------------------------------------------------------------
-- La lista gris pasa de DIECISÉIS a VEINTIDÓS jurisdicciones. No es que hayan
-- entrado seis: entran ONCE y salen CINCO, con once que siguen. Un update en
-- sitio habría dejado a las cinco que salieron calificando gente año y medio
-- después de que el GAFI las quitó.
--
--   Salen:  Argelia, Burkina Faso, Croacia, Nigeria, Zimbabue.
--   Entran: Bolivia, Bosnia y Herzegovina, Irak, Islas Vírgenes (RU), Kuwait,
--           Lao PDR, Mónaco, Nepal, Papúa Nueva Guinea, Sudán del Sur, Vietnam.
--
-- La lista negra no cambia: Corea del Norte, Irán y Myanmar.
--
-- ---------------------------------------------------------------------
-- DISCREPANCIA CON LA ADENDA, anotada a propósito
-- ---------------------------------------------------------------------
-- La Adenda 1 de Cumplimiento (31/08/2026, apartado 4.2) dice que bajo
-- monitoreo intensificado hay VEINTIUNA jurisdicciones. El documento del GAFI
-- lista VEINTIDÓS, y coinciden su bloque de metadatos y sus secciones de
-- cuerpo.
--
-- Se cargan las veintidós, que es lo que dice la fuente. Ajustar la lista a la
-- cifra de la Adenda significaría quitar un país a ojo, y no hay ninguno que
-- sobre. Queda señalado para que Cumplimiento confirme cuál de las dos cuentas
-- corrige a la otra; el dato cargado no cambia con esa respuesta.
--
-- ---------------------------------------------------------------------
-- MYANMAR NO ESTÁ SUJETA A CONTRAMEDIDAS, y el matiz importa
-- ---------------------------------------------------------------------
-- Las tres jurisdicciones de la lista negra están bajo «llamado a la acción»,
-- pero el GAFI las separa expresamente:
--
--   · Corea del Norte e Irán: se pide aplicar CONTRAMEDIDAS.
--   · Myanmar: se pide DILIGENCIA REFORZADA, y el documento dice literalmente
--     «enhanced due diligence – and not countermeasures». El GAFI advierte que
--     considerará contramedidas si no hay avance para octubre de 2026.
--
-- El indicador `GAFI_LLAMADO_ACCION` de la matriz v3 describe su efecto como
-- «conlleva contramedidas». Para Myanmar eso hoy sobrepasa lo que el GAFI pide.
-- El piso de banda alta y la revisión del OC siguen siendo defendibles para las
-- tres, así que la matriz NO se toca aquí —cambiarla sería publicar una v4 por
-- una cuestión de redacción—, pero el matiz queda escrito en `notas` de cada
-- fila y señalado a Cumplimiento. Que el dato lo diga y la plantilla no es
-- mejor que perderlo.
--
-- ---------------------------------------------------------------------
-- Por qué las filas viejas se CIERRAN y no se borran
-- ---------------------------------------------------------------------
-- Los expedientes calificados contra la lista de febrero de 2025 tienen que
-- poder explicarse con la lista que se les aplicó. Si se borra, esas
-- evaluaciones quedan sin nada que las respalde ante una verificación, y una
-- reclasificación posterior parece un error en vez de una actualización.
--
-- Y hay dos fechas distintas que NO deben confundirse:
--
--   `plenario`      · qué publicación del GAFI es. '2026-06'.
--   `vigente_desde` · desde cuándo Ikán aplica esa publicación.
--
-- No coinciden, y decirlo es más honesto que fingir que sí: el GAFI publicó el
-- 19 de junio y este sistema siguió calificando contra febrero de 2025 hasta
-- hoy. Ese hueco existió y queda en el registro.
-- =====================================================================

-- ---------------------------------------------------------------------
-- La carga vive en una FUNCIÓN, no en un bloque anónimo
-- ---------------------------------------------------------------------
-- Porque tiene que llamarse desde dos sitios: esta migration —para los
-- proyectos donde los datos ya existen, como el remoto— y el seed 17, para los
-- proyectos nuevos, donde las migrations corren ANTES que los seeds y esta no
-- encontraría nada que actualizar.
--
-- El precedente del repo (seed 16) resuelve ese mismo problema copiando el
-- contenido de las migrations. Aquí no: son veinticinco jurisdicciones, y dos
-- copias de una lista de países se desincronizan en cuanto alguien actualiza
-- una y no la otra. La que quede atrás seguiría calificando gente en silencio.
create or replace function public.cargar_snapshot_gafi_2026_06()
returns int
language plpgsql
as $fn$
declare
  v_corte date;
  v_filas int := 0;
  v_org   uuid;
  v_gris  int;
  v_negra int;
  -- Las veintidós de monitoreo intensificado, en el orden del documento.
  v_gris_lista constant text[][] := array[
    ['AO','Angola'], ['BO','Bolivia'], ['BA','Bosnia y Herzegovina'],
    ['BG','Bulgaria'], ['CM','Camerún'], ['CI','Costa de Marfil'],
    ['CD','República Democrática del Congo'], ['HT','Haití'], ['IQ','Irak'],
    ['KE','Kenia'], ['KW','Kuwait'], ['LA','Lao (RDP)'], ['LB','Líbano'],
    ['MC','Mónaco'], ['NP','Nepal'], ['PG','Papúa Nueva Guinea'],
    ['SS','Sudán del Sur'], ['SY','Siria'], ['VE','Venezuela'],
    ['VN','Vietnam'], ['VG','Islas Vírgenes (Reino Unido)'], ['YE','Yemen']
  ];
  -- Las tres de llamado a la acción, con la medida que el GAFI pide para cada una.
  v_negra_lista constant text[][] := array[
    ['KP','Corea del Norte (RPDC)','contramedidas'],
    ['IR','Irán','contramedidas'],
    ['MM','Myanmar','diligencia reforzada, NO contramedidas']
  ];
  v_par text[];
begin
  -- Si el snapshot ya está cargado, no hay nada que hacer.
  --
  -- Esta guarda NO es decorativa: sin ella la segunda corrida recalculaba la
  -- fecha de corte contando las filas que la primera acababa de insertar, salía
  -- un día después, y el `on conflict (…, vigente_desde)` dejaba de atrapar
  -- nada. El resultado eran las veinticinco jurisdicciones DUPLICADAS, cada
  -- país dos veces en la lista vigente. Se detectó corriendo la migration dos
  -- veces, que es justo para lo que se corre dos veces.
  if exists (select 1 from country_risk_list where plenario = '2026-06') then
    return 0;
  end if;

  -- La fecha de corte: hoy, salvo que alguna fila vigente se haya sembrado hoy
  -- mismo o después, en cuyo caso el día siguiente. El check de la tabla exige
  -- `vigente_hasta > vigente_desde`, y las filas del seed nacieron con
  -- `default current_date`, así que en un proyecto recién sembrado esa fecha es
  -- hoy. Sin esto, la migration truena justo en el entorno más nuevo.
  select greatest(current_date, max(vigente_desde) + 1)
    into v_corte
    from country_risk_list
   where fuente in ('gafi_gris', 'gafi_negra') and vigente_hasta is null;

  if v_corte is null then
    v_corte := current_date;   -- no había nada que cerrar
  end if;

  -- ------------------------------------------------------------------
  -- Cerrar el snapshot anterior
  -- ------------------------------------------------------------------
  update country_risk_list
     set vigente_hasta = v_corte
   where fuente in ('gafi_gris', 'gafi_negra')
     and vigente_hasta is null
     and coalesce(plenario, '') <> '2026-06';

  -- ------------------------------------------------------------------
  -- Cargar el snapshot de junio de 2026 en cada organización
  -- ------------------------------------------------------------------
  -- En TODAS las que ya tenían listas del GAFI: si una se quedara con el
  -- snapshot cerrado y sin el nuevo, sus comparecientes extranjeros volverían
  -- todos como «sin observaciones», que es el falso negativo que la 0043
  -- existió para cerrar.
  for v_org in
    select distinct organization_id from country_risk_list
     where fuente in ('gafi_gris', 'gafi_negra')
  loop
    foreach v_par slice 1 in array v_gris_lista loop
      insert into country_risk_list
        (organization_id, iso2, nombre, nivel, fuente, vigente_desde, plenario, notas)
      values (v_org, v_par[1], v_par[2], 3, 'gafi_gris', v_corte, '2026-06',
              'Jurisdicción bajo monitoreo intensificado. GAFI, «Jurisdictions under '
              || 'Increased Monitoring», París, 19 de junio de 2026. El GAFI NO pide '
              || 'diligencia reforzada por estar en esta lista: pide enfoque basado en '
              || 'riesgo, y advierte expresamente contra el derisking de clases enteras '
              || 'de clientes.')
      on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;
      v_filas := v_filas + 1;
    end loop;

    foreach v_par slice 1 in array v_negra_lista loop
      insert into country_risk_list
        (organization_id, iso2, nombre, nivel, fuente, vigente_desde, plenario, notas)
      values (v_org, v_par[1], v_par[2], 3, 'gafi_negra', v_corte, '2026-06',
              'Jurisdicción de alto riesgo sujeta a llamado a la acción. GAFI, '
              || '«High-Risk Jurisdictions subject to a Call for Action», París, 19 de '
              || 'junio de 2026. Medida que pide el GAFI: ' || v_par[3] || '.')
      on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;
      v_filas := v_filas + 1;
    end loop;
  end loop;

  -- ------------------------------------------------------------------
  -- Bitácora
  -- ------------------------------------------------------------------
  for v_org in
    select distinct organization_id from country_risk_list
     where fuente in ('gafi_gris', 'gafi_negra') and plenario = '2026-06'
  loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org and tipo = 'snapshot_gafi_2026_06') then
      continue;
    end if;

    select count(*) filter (where fuente = 'gafi_gris'),
           count(*) filter (where fuente = 'gafi_negra')
      into v_gris, v_negra
      from country_risk_list
     where organization_id = v_org and vigente_hasta is null
       and fuente in ('gafi_gris', 'gafi_negra');

    perform public.registrar_evento(
      v_org, 'snapshot_gafi_2026_06', 'country_risk_list', null,
      jsonb_build_object(
        'fuente', 'GAFI/FATF, plenario del 17-19 de junio de 2026, París. Publicaciones '
               || '«Jurisdictions under Increased Monitoring» y «High-Risk Jurisdictions '
               || 'subject to a Call for Action», ambas del 19 de junio de 2026.',
        'monitoreo_intensificado', v_gris,
        'llamado_a_la_accion', v_negra,
        'altas', 'Bolivia, Bosnia y Herzegovina, Irak, Islas Vírgenes (RU), Kuwait, '
              || 'Lao PDR, Mónaco, Nepal, Papúa Nueva Guinea, Sudán del Sur, Vietnam.',
        'bajas', 'Argelia, Burkina Faso, Croacia, Nigeria, Zimbabue. Salieron de la lista '
              || 'y dejan de calificar: con un update en sitio habrían seguido sumando '
              || 'riesgo año y medio después de que el GAFI las quitó.',
        'discrepancia_con_la_adenda', 'La Adenda 1 (31/08/2026, apartado 4.2) cuenta 21 '
              || 'jurisdicciones bajo monitoreo intensificado; el documento del GAFI lista '
              || '22, y coinciden su bloque de metadatos y sus secciones de cuerpo. Se '
              || 'cargan las 22 de la fuente. Cumplimiento debe confirmar cuál cuenta '
              || 'corrige a la otra; el dato cargado no cambia con esa respuesta.',
        'myanmar', 'Está en llamado a la acción pero el GAFI pide DILIGENCIA REFORZADA y '
              || 'no contramedidas —lo dice literalmente— y considerará contramedidas si '
              || 'no hay avance para octubre de 2026. El indicador GAFI_LLAMADO_ACCION de '
              || 'la matriz v3 describe su efecto como «conlleva contramedidas», lo que '
              || 'para Myanmar sobrepasa lo pedido. El piso de banda alta sigue siendo '
              || 'defendible para las tres; el matiz queda en las notas de cada fila.',
        'hueco', 'El GAFI publicó el 19 de junio de 2026 y este sistema siguió calificando '
              || 'contra el corte de febrero de 2025 hasta la fecha de esta carga. Las dos '
              || 'fechas se registran por separado: `plenario` dice qué publicación es, '
              || '`vigente_desde` desde cuándo Ikán la aplica.',
        'anterior', 'El snapshot 2025-02 se cierra con vigente_hasta, no se borra: los '
                 || 'expedientes calificados con él tienen que poder explicarse con la '
                 || 'lista que se les aplicó.'
      ),
      'sistema', null
    );
  end loop;

  return v_filas;
end
$fn$;

comment on function public.cargar_snapshot_gafi_2026_06() is
  'Carga el snapshot del GAFI del plenario de junio de 2026 y cierra el anterior. '
  'Idempotente: si ya está cargado, no hace nada y devuelve 0. La llaman la migration '
  '0045 y el seed 17, porque en un proyecto nuevo las migrations corren antes que los '
  'seeds y no encontrarían datos que actualizar.';

-- Catálogo de plataforma: lo mantiene Kawiil, no un usuario de la aplicación.
revoke execute on function public.cargar_snapshot_gafi_2026_06() from anon, authenticated;

-- ---------------------------------------------------------------------
-- Aplicarla ahora
-- ---------------------------------------------------------------------
-- En el proyecto remoto los datos ya existen, así que esto hace el trabajo. En
-- uno nuevo no encuentra nada y es el seed 17 el que la vuelve a llamar.
select public.cargar_snapshot_gafi_2026_06();

revoke insert, update, delete on country_risk_list from anon;

-- ---------------------------------------------------------------------
-- Comprobación antes de confirmar
-- ---------------------------------------------------------------------

-- 1. Cada organización con 22 grises y 3 negras vigentes, todas al plenario
--    2026-06, y el snapshot anterior cerrado.
select organization_id, fuente, plenario,
       count(*) filter (where vigente_hasta is null)     as vigentes,
       count(*) filter (where vigente_hasta is not null) as cerradas
  from country_risk_list
 where fuente in ('gafi_gris', 'gafi_negra')
 group by 1, 2, 3
 order by 1, 2, 3;

-- 2. Ningún país duplicado en la lista VIGENTE. Debe salir vacío.
--    Es la comprobación que cazó un defecto de idempotencia de esta misma
--    migration: al correrla dos veces recalculaba la fecha de corte contando
--    las filas que acababa de insertar, y entraban otra vez con otra fecha.
select organization_id, iso2, fuente, count(*)
  from country_risk_list
 where fuente in ('gafi_gris', 'gafi_negra') and vigente_hasta is null
 group by 1, 2, 3
having count(*) > 1;

-- 3. Los cinco que el GAFI quitó ya no califican. Debe salir vacío.
select iso2, nombre, organization_id
  from country_risk_list
 where iso2 in ('DZ', 'BF', 'HR', 'NG', 'ZW')
   and fuente in ('gafi_gris', 'gafi_negra')
   and vigente_hasta is null;

-- 4. Las once altas están, en las dos organizaciones.
select iso2, count(distinct organization_id) as organizaciones
  from country_risk_list
 where iso2 in ('BO','BA','IQ','VG','KW','LA','MC','NP','PG','SS','VN')
   and fuente = 'gafi_gris' and vigente_hasta is null
 group by 1
 order by 1;

-- 5. Ninguna fila del GAFI vigente sin plenario.
select count(*) as gafi_vigente_sin_plenario
  from country_risk_list
 where fuente in ('gafi_gris', 'gafi_negra')
   and vigente_hasta is null and plenario is null;

-- 6. La bitácora quedó sellada.
select organization_id, count(*)
  from evento_auditoria
 where tipo = 'snapshot_gafi_2026_06'
 group by 1;

commit;
