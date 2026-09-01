-- =====================================================================
-- 0054 · El piso de banda alta por país sancionado
-- =====================================================================
-- Fuente: Adenda 3 de Kawiil-Cumplimiento (01/09/2026), instrucción 28,
-- apartado 3.2. La 0053 cargó los regímenes; esto es lo que hace que sirvan
-- para algo dentro de la matriz.
--
-- ---------------------------------------------------------------------
-- Los tres niveles, y por qué sólo uno de ellos entra aquí
-- ---------------------------------------------------------------------
--   Nivel 1 · prohibición  → BLOQUEO y escalamiento. «No se resuelve con
--                            puntos», dice la adenda, y por eso NO entra en la
--                            matriz: un piso deja el expediente en banda alta y
--                            permite continuar, que es justo lo contrario de lo
--                            que procede. Vive en la pantalla, como detención.
--   Nivel 2 · riesgo alto  → PISO de banda alta. Es esto.
--   Nivel 3 · atención     → suma puntos sin piso. No sale de estas fuentes:
--                            es una lista interna revisada cada semestre que
--                            todavía no existe. Cuando exista entra por
--                            `zona_atencion`, que es donde viven los criterios
--                            propios.
--
-- ---------------------------------------------------------------------
-- Por qué es un indicador y no una variable más
-- ---------------------------------------------------------------------
-- Una variable suma puntos y se diluye con el resto: un país sancionado podría
-- quedar compensado por diez respuestas buenas, y la banda saldría media. El
-- apartado 5.2 de la Adenda 1 dice lo contrario —piso, no suma—, y el mecanismo
-- de indicadores de la 0042 es el que ya existe para eso.
--
-- Y va SEPARADO del llamado a la acción del GAFI aunque los dos levanten el
-- mismo piso, porque significan cosas distintas: el GAFI evalúa la solidez del
-- régimen PLD de una jurisdicción, y una sanción no dice nada sobre eso. Un
-- país puede tener un régimen impecable y estar bajo embargo. Con un solo
-- indicador, el OC no podría saber cuál de los dos se disparó.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Versión nueva, no edición en sitio
-- ---------------------------------------------------------------------
-- Una versión publicada de la matriz es INMUTABLE: la 0010 lo impone con un
-- trigger, y tiene razón. Cambiar la metodología con la que se calificó un
-- expediente, sin dejar rastro de que cambió, haría que dos expedientes
-- calificados con criterios distintos se vieran calificados con el mismo.
--
-- Así que entra como versión nueva y la anterior se retira. Lo que NO cambia es
-- el máximo de la escala: no se añaden variables ni se mueven pesos, sólo una
-- condición de flujo. Por eso la calibración pendiente de la instrucción 11 de
-- la Adenda 1 sigue siendo válida contra esta versión, y así queda dicho en
-- `notas_version` para que nadie la dé por caducada al ver el número nuevo.
do $$
declare
  v_tpl     record;
  v_config  jsonb;
  v_ind     jsonb;
  v_trg     jsonb;
  v_nueva   int;
  v_tocadas int := 0;
begin
  -- Sobre TODAS las plantillas activas, de cualquier organización y sector.
  -- Un piso que sólo existiera en la matriz de la notaría demo dejaría a las
  -- demás calificando países sancionados como si no lo estuvieran, y eso no se
  -- vería en ninguna pantalla.
  for v_tpl in
    select id, organization_id, sector, version, configuracion, notas_version
      from client_risk_template
     where activa
  loop
    v_config := v_tpl.configuracion;

    -- Si ya lo tiene, no se toca: la migration es idempotente y volver a
    -- correrla no debe generar una versión por corrida.
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_config -> 'indicadores', '[]'::jsonb)) i
       where i ->> 'codigo' = 'PAIS_SANCIONADO'
    ) and exists (
      select 1 from jsonb_array_elements(coalesce(v_config -> 'triggers_alto_de_oficio', '[]'::jsonb)) t
       where t ->> 'codigo' = 'PAIS_SANCIONADO'
    ) then
      continue;
    end if;

    v_ind := jsonb_build_object(
      'codigo', 'PAIS_SANCIONADO',
      'pregunta', '¿Alguno de los países capturados está bajo régimen de sanciones de la ONU o de OFAC?',
      'descripcion',
        'Sanción y deficiencia técnica no son lo mismo: el GAFI evalúa la solidez del régimen '
        || 'PLD de una jurisdicción y una sanción no dice nada sobre eso —un país puede tener un '
        || 'régimen impecable y estar bajo embargo—. Levanta piso de banda alta. Las resoluciones '
        || 'del Consejo de Seguridad vinculan a México; OFAC es derecho extranjero y pesa como '
        || 'exposición a sanciones secundarias y valor indiciario, no como ley aplicable. El '
        || 'nivel de prohibición NO se resuelve aquí: bloquea y escala.',
      'efecto', 'piso'
    );
    v_trg := jsonb_build_object(
      'codigo', 'PAIS_SANCIONADO',
      'descripcion',
        'País del compareciente, de constitución o de origen de los recursos bajo régimen de '
        || 'sanciones de la ONU o de OFAC. Piso de banda alta conforme al apartado 3.2 de la '
        || 'Adenda 3.',
      'indicador_codigo', 'PAIS_SANCIONADO'
    );

    v_config := jsonb_set(
      v_config, '{indicadores}',
      coalesce(v_config -> 'indicadores', '[]'::jsonb) || jsonb_build_array(v_ind)
    );
    v_config := jsonb_set(
      v_config, '{triggers_alto_de_oficio}',
      coalesce(v_config -> 'triggers_alto_de_oficio', '[]'::jsonb) || jsonb_build_array(v_trg)
    );

    select coalesce(max(version), 0) + 1 into v_nueva
      from client_risk_template
     where organization_id = v_tpl.organization_id and sector = v_tpl.sector;

    -- PRIMERO se retira la anterior: hay un índice único parcial que sólo
    -- admite una plantilla activa por organización y sector, y con dos activas
    -- dos clientes idénticos podrían salir con bandas distintas.
    update client_risk_template
       set activa = false
     where id = v_tpl.id;

    insert into client_risk_template
      (organization_id, sector, version, configuracion, activa, estado, notas_version)
    values (
      v_tpl.organization_id, v_tpl.sector, v_nueva, v_config, true, 'publicada',
      'Incorpora el indicador PAIS_SANCIONADO (Adenda 3, instrucción 28, apartado 3.2). '
      || 'NO cambia el máximo de la escala: no entran variables ni se mueven pesos, sólo una '
      || 'condición de flujo, así que la calibración pendiente de la instrucción 11 de la '
      || 'Adenda 1 sigue siendo válida contra esta versión. Sustituye a la v' || v_tpl.version || '.'
    );
    v_tocadas := v_tocadas + 1;

    perform public.registrar_evento(
      v_tpl.organization_id, 'indicador_matriz_incorporado', 'client_risk_template', v_tpl.id,
      jsonb_build_object(
        'indicador', 'PAIS_SANCIONADO',
        'sector', v_tpl.sector,
        'version_anterior', v_tpl.version,
        'version_nueva', v_nueva,
        'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 3 del 01/09/2026, instrucción 28, '
               || 'apartado 3.2.',
        'efecto', 'Piso de banda alta. NO suma puntos: una variable se diluiría con el resto y '
               || 'un país sancionado podría quedar compensado por diez respuestas buenas.',
        'separado_del_gafi', 'Va aparte del llamado a la acción aunque levanten el mismo piso: '
                          || 'el GAFI evalúa la solidez del régimen PLD y una sanción no dice '
                          || 'nada sobre eso. Con un solo indicador no se sabría cuál se disparó.',
        'nivel_1_no_incluido', 'La prohibición no entra en la matriz: no se resuelve con puntos. '
                            || 'Un piso permite continuar en banda alta y lo que procede es '
                            || 'detenerse y escalar, así que vive en la pantalla como bloqueo.',
        'escala_sin_cambio', 'El máximo no se mueve, así que la calibración pendiente de la '
                          || 'instrucción 11 sigue siendo válida contra esta versión.'
      ),
      'sistema', null
    );
  end loop;

  raise notice 'Indicador PAIS_SANCIONADO incorporado en % plantilla(s).', v_tocadas;
end $$;
