-- =====================================================================
-- 0042 · Matriz de fe pública v3: los factores que las RCG exigen
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 1 del 31/08/2026,
-- apartados 4 y 7. Instrucciones 6, 7 y 10 de su resumen.
--
-- Las tres instrucciones van en UNA sola versión, y no por comodidad: las tres
-- cambian el máximo de la escala, y la Adenda pide expresamente no recalibrar
-- dos veces. Publicar una v3 con el país y una v4 con el canal obligaría a
-- calibrar dos veces contra la misma muestra.
--
-- ---------------------------------------------------------------------
-- 1. El país deja de ser uno (instrucción 6)
-- ---------------------------------------------------------------------
-- Nacionalidad, residencia, jurisdicción de constitución y origen de los
-- recursos son cosas distintas que pueden divergir, y LA DIVERGENCIA ES LA
-- SEÑAL. La v2 tenía tres variables de país sueltas —residencia del
-- compareciente, jurisdicción de constitución y país de los fondos— que se
-- respondían por separado y sumaban por separado. Eso tiene dos defectos:
--
--   · La persona física no tenía dónde registrar el origen de los recursos como
--     riesgo país, porque `XII-REC-01` sumaba aparte y `XII-PF-01` sólo miraba
--     la residencia.
--   · La persona moral con constitución, residencia fiscal y fondos en el mismo
--     país de riesgo puntuaba DOS VECES por un solo hecho.
--
-- La v3 deja UNA variable de riesgo país por forma jurídica, que toma el valor
-- MÁS ALTO de los países capturados. No promedia: un promedio dejaría que dos
-- países limpios diluyeran al tercero, que es justo el que importa.
--
-- `XII-REC-01` desaparece por eso, no por recorte: su dato sigue capturándose
-- (0036) y sigue entrando a la calificación, ahora dentro del máximo.
--
-- ---------------------------------------------------------------------
-- 2. El llamado a la acción, aparte del puntaje (instrucción 7)
-- ---------------------------------------------------------------------
-- Para puntuar, agrupar lista gris y lista negra en «jurisdicción de riesgo» es
-- aceptable, y redondear hacia arriba es la dirección correcta. Queda escrito
-- aquí como decisión expresa: lo que hoy es una elección razonable, sin
-- constancia, mañana parece un descuido.
--
-- Para el FLUJO no es aceptable. Las jurisdicciones bajo llamado a la acción
-- conllevan CONTRAMEDIDAS, no simplemente diligencia reforzada. Por eso la
-- variable de puntaje queda con tres opciones y se añade un indicador booleano
-- independiente que levanta piso de banda alta.
--
-- De paso se arregla algo que la v2 dejó roto: su disparador `GAFI_NEGRA`
-- apuntaba a `XII-PM-01 >= 4`, y al colapsar esa variable a tres opciones el 4
-- deja de existir. Un disparador que no puede dispararse nunca es peor que no
-- tenerlo, porque en la plantilla se lee como si el control existiera.
--
-- ---------------------------------------------------------------------
-- 3. Canal, zona y perfil transaccional (instrucción 10)
-- ---------------------------------------------------------------------
-- CANAL DE DISTRIBUCIÓN. Uno de los cuatro factores obligatorios de las RCG y
-- el que más claramente aplica aquí, porque el onboarding es remoto. El canal
-- remoto suma riesgo, y así debe ser: es la contrapartida razonable de haber
-- resuelto la identificación con verificación digital, no un castigo.
--
-- ZONA GEOGRÁFICA NACIONAL. Zona geográfica no es país. Para una notaría que
-- opera enteramente en territorio nacional, el campo de país responde «México»
-- en el noventa y tantos por ciento de los expedientes. Lo que discrimina es
-- entidad federativa y municipio, del inmueble y del domicilio del cliente.
--
-- La variable entra con `requiere_catalogo`: la lista `zona_atencion` nace
-- vacía (0041) porque la determinación de qué zonas son de atención es de
-- Cumplimiento. Mientras esté vacía la variable NO PUNTÚA y queda fuera del
-- máximo y del mínimo. Las dos alternativas eran peores: responderla «sin
-- observaciones» daría la calificación más baja a cualquier ubicación del país
-- —el falso negativo silencioso de siempre—, y dejarla dentro de la escala con
-- todos en el mínimo comprimiría el índice de todos los expedientes por una
-- razón que no tiene que ver con su riesgo.
--
-- PERFIL TRANSACCIONAL. El Capítulo III Ter lo exige con monto, frecuencia,
-- ubicación, origen y destino de recursos y actividad económica; la matriz sólo
-- capturaba el monto de la operación aislada. La frecuencia esperada es la
-- única pieza que no se puede calcular: la observada sale de la misma ventana
-- móvil de seis meses del artículo 7 que ya usa el motor.
--
-- ---------------------------------------------------------------------
-- Reserva de Cumplimiento, otra vez y a propósito
-- ---------------------------------------------------------------------
-- La asignación de riesgo por tipo de acto, actividad, canal y zona es
-- METODOLOGÍA PROPIA de Kawiil, no clasificación oficial. Es defendible
-- mientras esté documentada, fundada y versionada conforme al Capítulo II
-- Quáter de las RCG, y deja de serlo si se aplica sin ese respaldo escrito.
--
-- Los cortes de 40 y 70 siguen SIN CALIBRAR. La v3 añade tres variables, así
-- que el máximo de la escala cambió otra vez: la calibración de la instrucción
-- 11 se hace contra ESTA versión, no contra la v2.
-- =====================================================================

do $$
declare
  v_org      uuid := '12121212-1212-1212-1212-121212121212';  -- Notaría Demo GDL
  v_v3       uuid := '44444444-0012-0000-0000-000000000003';
  v_config   jsonb;
  v_anterior jsonb;
  v_e2       jsonb;
  v_e3       jsonb;
begin
  if not exists (select 1 from public.organizations where id = v_org) then
    return;
  end if;

  -- Se parte de la v2 entera y se le cambia lo que la Adenda instruye.
  -- Reescribirla desde cero perdería los once actos, la escala relativa al
  -- umbral y los disparadores por clave, que no están en discusión.
  select configuracion into v_anterior
    from public.client_risk_template
   where organization_id = v_org and sector = 'XII' and version = 2;

  if v_anterior is null then
    return;
  end if;

  v_config := v_anterior;

  -- ------------------------------------------------------------------
  -- E2 · Persona física: una sola variable de riesgo país
  -- ------------------------------------------------------------------
  v_e2 := v_anterior #> '{elementos,1}';

  v_e2 := jsonb_set(
    v_e2,
    '{variables,0}',
    jsonb_build_object(
      'codigo', 'XII-PF-01',
      'pregunta', 'Riesgo país del compareciente',
      'criterio', 'El MÁS ALTO entre nacionalidad, país de residencia y país de origen de '
               || 'los recursos, contra el snapshot del GAFI versionado por plenario. '
               || 'Adenda 1, apartado 4.1. Lista gris y lista negra se agrupan para el '
               || 'puntaje —hacia arriba— y se separan para el flujo con el indicador '
               || 'GAFI_LLAMADO_ACCION.',
      'opciones', '[
        {"clave":"nacional","label":"México en los tres campos","valor":1},
        {"clave":"sin_observaciones","label":"Alguno extranjero, sin observaciones del GAFI","valor":2},
        {"clave":"riesgo","label":"Alguno en jurisdicción de riesgo del GAFI (gris o negra)","valor":3}
      ]'::jsonb
    )
  );

  v_config := jsonb_set(v_config, '{elementos,1}', v_e2);

  -- ------------------------------------------------------------------
  -- E3 · Persona moral: lo mismo, y de cuatro opciones a tres
  -- ------------------------------------------------------------------
  -- Cuatro opciones separaban gris de negra en el PUNTAJE. La Adenda 4.3 pide
  -- lo contrario: tres valores en la escala y un booleano en el flujo.
  v_e3 := v_anterior #> '{elementos,2}';

  v_e3 := jsonb_set(
    v_e3,
    '{variables,0}',
    jsonb_build_object(
      'codigo', 'XII-PM-01',
      'pregunta', 'Riesgo país de la persona moral',
      'criterio', 'El MÁS ALTO entre jurisdicción de constitución, país de residencia y '
               || 'país de origen de los recursos, contra el snapshot del GAFI versionado '
               || 'por plenario. Adenda 1, apartados 4.1 y 4.3.',
      'opciones', '[
        {"clave":"nacional","label":"México en los tres campos","valor":1},
        {"clave":"sin_observaciones","label":"Alguno extranjero, sin observaciones del GAFI","valor":2},
        {"clave":"riesgo","label":"Alguno en jurisdicción de riesgo del GAFI (gris o negra)","valor":3}
      ]'::jsonb
    )
  );

  v_config := jsonb_set(v_config, '{elementos,2}', v_e3);

  -- ------------------------------------------------------------------
  -- E4 · Se va el país de los fondos; se queda la moneda
  -- ------------------------------------------------------------------
  -- El país de origen de los recursos NO deja de contar: pasa a ser uno de los
  -- tres que alimentan la variable de riesgo país. Dejarlo también aquí lo
  -- contaría dos veces por un solo hecho.
  v_config := jsonb_set(
    v_config,
    '{elementos,3}',
    jsonb_build_object(
      'codigo', 'E4_RECURSOS',
      'nombre', 'Recursos de la operación',
      'variables', jsonb_build_array(v_anterior #> '{elementos,3,variables,1}')
    )
  );

  -- ------------------------------------------------------------------
  -- E5 · Canal, zona y perfil transaccional
  -- ------------------------------------------------------------------
  v_config := jsonb_set(
    v_config,
    '{elementos,4}',
    jsonb_build_object(
      'codigo', 'E5_CANAL_ZONA_PERFIL',
      'nombre', 'Canal, zona geográfica y perfil transaccional',
      'variables', jsonb_build_array(

        jsonb_build_object(
          'codigo', 'XII-CAN-01',
          'pregunta', 'Canal de distribución',
          'criterio', 'Factor obligatorio de las RCG. El canal remoto suma riesgo: es la '
                   || 'contrapartida de haber resuelto la identificación con verificación '
                   || 'digital. No se deduce de que exista una verificación de Didit —se '
                   || 'puede verificar a distancia a quien vino a la notaría—.',
          'opciones', '[
            {"clave":"presencial","label":"Presencial ante el fedatario","valor":1},
            {"clave":"remoto_verificacion_reforzada","label":"Remoto con verificación reforzada","valor":2},
            {"clave":"remoto_estandar","label":"Remoto estándar","valor":3}
          ]'::jsonb
        ),

        jsonb_build_object(
          'codigo', 'XII-ZON-01',
          'pregunta', 'Zona geográfica del inmueble y del domicilio del cliente',
          'criterio', 'Entidad federativa y municipio contra la lista interna de zonas de '
                   || 'atención, revisada semestralmente. Se toma la MÁS ALTA de las dos '
                   || 'ubicaciones. Adenda 1, apartados 4.4 y 7.',
          -- Mientras `zona_atencion` esté vacía esta variable no puntúa y queda
          -- fuera del máximo y del mínimo. Ver el encabezado.
          'requiere_catalogo', 'zona_atencion',
          'opciones', '[
            {"clave":"sin_observaciones","label":"Sin observaciones en la lista interna","valor":1},
            {"clave":"atencion","label":"Zona de atención","valor":2},
            {"clave":"atencion_prioritaria","label":"Zona de atención prioritaria","valor":3}
          ]'::jsonb
        ),

        jsonb_build_object(
          'codigo', 'XII-PTR-01',
          'pregunta', 'Frecuencia de operación frente a la declarada',
          'criterio', 'Operaciones de los últimos seis meses contra la mitad de la '
                   || 'frecuencia anual declarada al alta, redondeada hacia arriba. Misma '
                   || 'ventana móvil del art. 7 del Reglamento que usa el motor. '
                   || 'Cap. III Ter de las RCG.',
          'opciones', '[
            {"clave":"dentro","label":"Dentro de la frecuencia declarada","valor":1},
            {"clave":"sin_declaracion","label":"El cliente no declaró frecuencia esperada","valor":2},
            {"clave":"excede","label":"Excede la frecuencia declarada","valor":3}
          ]'::jsonb
        )
      )
    )
  );

  -- ------------------------------------------------------------------
  -- El indicador booleano
  -- ------------------------------------------------------------------
  v_config := jsonb_set(
    v_config,
    '{indicadores}',
    '[
      {
        "codigo": "GAFI_LLAMADO_ACCION",
        "pregunta": "¿Alguno de los países capturados está bajo llamado a la acción del GAFI?",
        "descripcion": "Llamado a la acción conlleva CONTRAMEDIDAS, no simplemente diligencia reforzada. El puntaje agrupa lista gris y lista negra; el flujo no puede agruparlas. Levanta piso de banda alta y revisión obligatoria del Oficial de Cumplimiento antes de continuar.",
        "efecto": "piso"
      }
    ]'::jsonb
  );

  -- ------------------------------------------------------------------
  -- Disparadores
  -- ------------------------------------------------------------------
  -- Los cuatro de la v2 que siguen vigentes, más el del indicador. `GAFI_NEGRA`
  -- sale porque apuntaba a `XII-PM-01 >= 4` y esa variable ya no tiene un 4: un
  -- disparador que no puede dispararse se lee en la plantilla como si el
  -- control existiera, que es peor que no tenerlo.
  --
  -- Se añade además el piso de beneficiario controlador no determinable, que el
  -- apartado 5.2 enumera y ninguna versión anterior implementó.
  v_config := jsonb_set(
    v_config,
    '{triggers_alto_de_oficio}',
    '[
      {"codigo":"PODER_IRREVOCABLE","descripcion":"Otorgamiento de poder irrevocable. Transfiere control efectivo sobre bienes sin cambio de titular registral.","variable_codigo":"XII-ACT-01","claves":["otorgamiento_poder"]},
      {"codigo":"FIDEICOMISO","descripcion":"Constitución o modificación de fideicomiso traslativo o de garantía. Opacidad del beneficiario.","variable_codigo":"XII-ACT-01","claves":["constitucion_modificacion_fideicomiso","cesion_derechos_fideicomitente_fideicomisario"]},
      {"codigo":"MUTUO_FUERA_SISTEMA_FINANCIERO","descripcion":"Mutuo o crédito con acreedor fuera del sistema financiero. Contraparte acreedora no supervisada.","variable_codigo":"XII-ACT-01","claves":["contrato_mutuo_credito"]},
      {"codigo":"PEP_EXTRANJERO","descripcion":"Compareciente PEP federal o extranjero, o su cónyuge, familiar hasta segundo grado o asociado cercano.","variable_codigo":"XII-PF-02","valor_minimo":3},
      {"codigo":"GAFI_LLAMADO_ACCION","descripcion":"País bajo llamado a la acción del GAFI. Conlleva contramedidas: revisión obligatoria del Oficial de Cumplimiento antes de continuar.","indicador_codigo":"GAFI_LLAMADO_ACCION"},
      {"codigo":"BENEFICIARIO_NO_DETERMINABLE","descripcion":"Beneficiario controlador no determinable tras agotar el orden de prelación de las RCG.","variable_codigo":"XII-PM-02","valor_minimo":3}
    ]'::jsonb
  );

  -- ------------------------------------------------------------------
  -- La escala
  -- ------------------------------------------------------------------
  -- Los cortes no cambian respecto de la v2 —siguen sin calibrar—, pero el
  -- máximo sí: tres variables nuevas y una que se fue. Por eso la calibración
  -- de la instrucción 11 se hace contra ESTA versión.
  v_config := v_config || jsonb_build_object(
    'escala_normalizada', true,
    'calibrada', false,
    'nota_calibracion',
      'Los cortes de 40 y 70 son un punto de partida técnicamente razonado, no una '
      || 'conclusión. La v3 cambió el máximo de la escala —entran canal, zona y perfil '
      || 'transaccional; sale el país de los fondos como variable propia—, así que la '
      || 'calibración se hace contra esta versión. Si más de una cuarta parte de los '
      || 'expedientes cae en alto, la banda no discrimina; si casi ninguno cae, la matriz '
      || 'no está detectando. Las RCG piden doce meses de datos históricos.'
  );

  -- ------------------------------------------------------------------
  -- Publicar la v3 y retirar la v2
  -- ------------------------------------------------------------------
  -- PRIMERO se retira la anterior: hay un índice único parcial que sólo admite
  -- una plantilla activa por organización y sector, y con la v2 todavía activa
  -- el insert de la v3 lo viola. Que exista ese índice es correcto —dos
  -- matrices activas significarían que dos clientes idénticos pueden salir
  -- clasificados distinto según cuál se leyó—.
  --
  -- La v2 no se borra, por lo mismo que no se borró la v1: las evaluaciones que
  -- produjo tienen que poder explicarse con la plantilla que las calculó.
  update public.client_risk_template
     set activa = false
   where organization_id = v_org and sector = 'XII' and version = 2 and activa;

  insert into public.client_risk_template
    (id, organization_id, sector, version, configuracion, activa, estado, notas_version)
  select v_v3, v_org, 'XII', 3, v_config, true, 'publicada',
         'Adenda 1 de Kawiil-Cumplimiento (31/08/2026), instrucciones 6, 7 y 10. Una sola '
         || 'variable de riesgo país por el MÁS ALTO de nacionalidad, residencia y origen '
         || 'de los recursos; indicador booleano de llamado a la acción separado del '
         || 'puntaje; canal de distribución, zona geográfica nacional y perfil '
         || 'transaccional. Escala normalizada, SIN CALIBRAR.'
   where not exists (select 1 from public.client_risk_template
                      where organization_id = v_org and sector = 'XII' and version = 3);

  -- ------------------------------------------------------------------
  -- Bitácora
  -- ------------------------------------------------------------------
  if not exists (select 1 from public.evento_auditoria
                  where organization_id = v_org and tipo = 'matriz_xii_v3_publicada') then
    perform public.registrar_evento(
      v_org, 'matriz_xii_v3_publicada', 'client_risk_template', v_v3,
      jsonb_build_object(
        'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 1 del 31/08/2026, '
               || 'instrucciones 6, 7 y 10.',
        'pais', 'De tres variables de país sueltas a UNA que toma el valor más alto de '
             || 'nacionalidad, residencia y origen de los recursos. La persona física no '
             || 'tenía dónde registrar el origen de los fondos como riesgo país, y la '
             || 'moral con los tres en la misma jurisdicción de riesgo puntuaba dos veces '
             || 'por un solo hecho.',
        'llamado_a_la_accion', 'Indicador booleano separado del puntaje: agrupar gris y '
                            || 'negra es aceptable para puntuar y no lo es para el flujo, '
                            || 'porque el llamado a la acción conlleva contramedidas.',
        'disparador_corregido', 'GAFI_NEGRA apuntaba a XII-PM-01 >= 4 y esa variable ya no '
                             || 'tiene un 4. Un disparador que no puede dispararse se lee '
                             || 'en la plantilla como si el control existiera.',
        'canal', 'Factor obligatorio de las RCG y el que más aplica aquí: el onboarding es '
              || 'remoto.',
        'zona', 'Zona geográfica no es país. Entra con requiere_catalogo: mientras '
             || 'zona_atencion esté vacía la variable NO puntúa y queda fuera del máximo y '
             || 'del mínimo. Responderla «sin observaciones» daría la calificación más '
             || 'baja a cualquier ubicación del país.',
        'perfil_transaccional', 'Cap. III Ter. Frecuencia declarada al alta contra la '
                             || 'observada en la ventana móvil de seis meses del art. 7.',
        'calibracion', 'El máximo de la escala cambió. La calibración de la instrucción 11 '
                    || 'se hace contra la v3, no contra la v2.'
      ),
      'sistema', null
    );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
revoke insert, update, delete on client_risk_template from anon;
