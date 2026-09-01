-- =====================================================================
-- 0037 · Matriz de fe pública v2: los once actos y la escala relativa
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 1 del 31/08/2026,
-- apartados 1.2 a 1.4 y 2.2. Instrucciones 1, 3 y 4 de su resumen.
--
-- El diagnóstico de Cumplimiento sobre la v1 es más duro que el nuestro y
-- conviene copiarlo aquí: no era una matriz de fe pública con parámetros
-- equivocados, era una matriz de ACTIVOS VIRTUALES con la etiqueta cambiada.
-- Los tramos de 645 y 3,210 UMA, los cuatro tipos de acto con nombres viejos y
-- el anclaje por posición son síntomas del mismo origen.
--
-- ---------------------------------------------------------------------
-- Qué cambia del elemento E1
-- ---------------------------------------------------------------------
-- TIPO DE ACTO. Cuatro opciones con los nombres anteriores a la migration 0031
-- pasan a los ONCE del catálogo del layout, cada una con su CLAVE ESTABLE y con
-- el riesgo base de su supuesto legal.
--
-- El anclaje por posición era el defecto de fondo: el valor de riesgo se
-- guardaba como lugar en el arreglo, así que al crecer el catálogo el poder
-- irrevocable ocupó el sitio del fideicomiso y empezó a disparar su alerta. No
-- fallaba: respondía mal, que en una matriz de riesgo es peor porque nadie va a
-- ir a buscarlo.
--
-- VALOR DE LA OPERACIÓN. Los tramos absolutos de 645 y 3,210 UMA pasan a una
-- escala RELATIVA al umbral del acto. La razón no es de precisión sino de
-- imposibilidad: la fracción XII tiene tres umbrales y cinco supuestos sin
-- umbral, y ningún juego de cifras absolutas puede ser correcto para los once
-- actos a la vez —8,000 UMA es el 100 % del umbral en una transmisión de
-- inmuebles y el 200 % en un fideicomiso—.
--
-- El corte alto queda en 150 % y no en 100 % a propósito: pone la frontera de
-- la escala de riesgo donde el legislador NO la puso. Con el corte en 100 % la
-- escala volvería a ser una copia del umbral de Aviso con otro nombre.
--
-- ---------------------------------------------------------------------
-- Por qué una versión nueva y no una corrección en sitio
-- ---------------------------------------------------------------------
-- Las evaluaciones ya guardadas se calcularon con la v1, y tienen que poder
-- explicarse con la plantilla que las produjo. Corregir en sitio dejaría
-- expedientes cuyo score no se puede reconstruir con ninguna configuración
-- existente: el peor resultado posible ante una verificación.
--
-- La v1 se marca inactiva y se queda. La v2 nace publicada.
--
-- ---------------------------------------------------------------------
-- Reserva de Cumplimiento, copiada aquí para que no se pierda
-- ---------------------------------------------------------------------
-- La asignación de riesgo por tipo de acto es METODOLOGÍA PROPIA de Kawiil, no
-- clasificación oficial. Es defendible mientras esté documentada, fundada y
-- versionada conforme al Capítulo II Quáter de las RCG, y deja de serlo si se
-- aplica sin ese respaldo escrito. Los cortes de tramo son un punto de partida
-- técnicamente razonado que requiere calibración contra datos reales; ninguno
-- debe presentarse a un cliente como cifra definitiva antes de esa calibración.
-- =====================================================================

do $$
declare
  v_org      uuid := '12121212-1212-1212-1212-121212121212';  -- Notaría Demo GDL
  v_v2       uuid := '44444444-0012-0000-0000-000000000002';
  v_config   jsonb;
  v_anterior jsonb;
begin
  if not exists (select 1 from public.organizations where id = v_org) then
    return;
  end if;

  -- La configuración de la v1 se conserva entera y se le cambia lo que la
  -- Adenda instruye. Reescribirla desde cero perdería los elementos que no
  -- están en discusión —compareciente, origen de recursos— y sus pesos.
  select configuracion into v_anterior
    from public.client_risk_template
   where organization_id = v_org and sector = 'XII' and version = 1;

  if v_anterior is null then
    return;
  end if;

  v_config := v_anterior;

  -- ------------------------------------------------------------------
  -- E1 · Tipo de acto y operación, reescrito
  -- ------------------------------------------------------------------
  v_config := jsonb_set(
    v_config,
    '{elementos,0}',
    jsonb_build_object(
      'codigo', 'E1_ACTO',
      'nombre', 'Tipo de acto y operación',
      'variables', jsonb_build_array(

        -- Los once actos del layout con su clave estable y el riesgo base de
        -- su supuesto (Adenda 1, apartado 2.2). `supuesto` viaja en cada
        -- opción para que un auditor vea de qué inciso sale el número sin
        -- tener que cruzar dos documentos.
        jsonb_build_object(
          'codigo', 'XII-ACT-01',
          'pregunta', 'Tipo de acto que se instrumenta',
          'criterio', 'Catálogo del layout de fe pública (rama 3.6.1.3). Riesgo base por '
                   || 'supuesto del art. 17 fr. XII, Adenda 1 de Cumplimiento 31/08/2026.',
          'opciones', '[
            {"clave":"transmision_inmueble","label":"Transmisión o constitución de derechos reales sobre inmuebles","valor":3,"supuesto":"XII.A.a"},
            {"clave":"otorgamiento_poder","label":"Otorgamiento de poder irrevocable","valor":4,"supuesto":"XII.A.b"},
            {"clave":"constitucion_personas_morales","label":"Constitución de personas morales","valor":3,"supuesto":"XII.A.c"},
            {"clave":"modificacion_patrimonial","label":"Modificación patrimonial (aumento o disminución de capital)","valor":3,"supuesto":"XII.A.c"},
            {"clave":"fusion","label":"Fusión","valor":3,"supuesto":"XII.A.c"},
            {"clave":"escision","label":"Escisión","valor":3,"supuesto":"XII.A.c"},
            {"clave":"compra_venta_acciones","label":"Compra o venta de acciones o partes sociales","valor":3,"supuesto":"XII.A.c"},
            {"clave":"constitucion_modificacion_fideicomiso","label":"Constitución o modificación de fideicomiso traslativo de dominio o garantía","valor":4,"supuesto":"XII.A.d"},
            {"clave":"cesion_derechos_fideicomitente_fideicomisario","label":"Cesión de derechos de fideicomitente o fideicomisario","valor":4,"supuesto":"XII.B.c"},
            {"clave":"contrato_mutuo_credito","label":"Contrato de mutuo o crédito, con o sin garantía","valor":4,"supuesto":"XII.A.e"},
            {"clave":"avaluo","label":"Realización de avalúos","valor":2,"supuesto":"XII.B.a"}
          ]'::jsonb
        ),

        -- La magnitud, relativa al umbral del acto. Los tramos absolutos de
        -- respaldo —para los cinco actos que se avisan siempre— están anclados
        -- en 3,210 y 8,025 UMA, los límites de efectivo del artículo 32, para
        -- que los cortes tengan lectura defendible ante una verificación en vez
        -- de ser cifras elegidas a ojo.
        jsonb_build_object(
          'codigo', 'XII-ACT-02',
          'pregunta', 'Valor de la operación',
          'criterio', 'Proporción del umbral de Aviso del acto. Sin umbral (actos que se '
                   || 'avisan siempre), tramos absolutos anclados en el art. 32. '
                   || 'Adenda 1, apartados 1.2 y 1.4.',
          'opciones', '[
            {"clave":"T1","label":"Menor al 25 % del umbral del acto","valor":1},
            {"clave":"T2","label":"Del 25 % al 75 % del umbral","valor":2},
            {"clave":"T3","label":"Del 75 % al 150 % del umbral","valor":3},
            {"clave":"T4","label":"Igual o mayor al 150 % del umbral","valor":4}
          ]'::jsonb
        ),

        -- Se conserva tal cual: la Adenda no la cambia, y desde la 0036 se
        -- captura en el acto.
        v_anterior #> '{elementos,0,variables,2}'
      )
    )
  );

  -- ------------------------------------------------------------------
  -- Disparadores por clave, no por posición
  -- ------------------------------------------------------------------
  -- Los cuatro actos que entran con piso en la banda alta (Adenda 1, 2.2).
  -- Los otros dos supuestos altos —mutuo mercantil y facilitadores MASC— no
  -- tienen tipo de acto propio en el layout, así que no aparecen aquí.
  --
  -- La constitución de personas morales NO está, y es deliberado: es el acto de
  -- mayor volumen ordinario, y marcarlo alto de oficio llevaría a que la
  -- mayoría de los expedientes caiga en la banda alta, con lo que la banda deja
  -- de discriminar y la diligencia reforzada se vuelve rutina desatendida
  -- (Adenda 1, apartado 2.3).
  v_config := jsonb_set(
    v_config,
    '{triggers_alto_de_oficio}',
    '[
      {"codigo":"PODER_IRREVOCABLE","descripcion":"Otorgamiento de poder irrevocable. Transfiere control efectivo sobre bienes sin cambio de titular registral.","variable_codigo":"XII-ACT-01","claves":["otorgamiento_poder"]},
      {"codigo":"FIDEICOMISO","descripcion":"Constitución o modificación de fideicomiso traslativo o de garantía. Opacidad del beneficiario.","variable_codigo":"XII-ACT-01","claves":["constitucion_modificacion_fideicomiso","cesion_derechos_fideicomitente_fideicomisario"]},
      {"codigo":"MUTUO_FUERA_SISTEMA_FINANCIERO","descripcion":"Mutuo o crédito con acreedor fuera del sistema financiero. Contraparte acreedora no supervisada.","variable_codigo":"XII-ACT-01","claves":["contrato_mutuo_credito"]},
      {"codigo":"PEP_EXTRANJERO","descripcion":"Compareciente PEP federal o extranjero.","variable_codigo":"XII-PF-02","valor_minimo":3},
      {"codigo":"GAFI_NEGRA","descripcion":"Persona moral constituida en jurisdicción de lista negra GAFI.","variable_codigo":"XII-PM-01","valor_minimo":4}
    ]'::jsonb
  );

  -- ------------------------------------------------------------------
  -- La escala, normalizada a 0-100
  -- ------------------------------------------------------------------
  -- Con máximos distintos por forma jurídica y una banda alta común, la persona
  -- moral llegaba a «alto» con menos porcentaje de su puntaje posible que la
  -- física, sin que ninguna decisión de política lo dispusiera. Y el problema
  -- reaparecería con cada variable nueva.
  --
  -- Los cortes de 40 y 70 son un PUNTO DE PARTIDA. Hasta calibrarlos contra una
  -- muestra real, la clasificación se presenta como provisional.
  v_config := jsonb_set(
    v_config,
    '{escala_cliente}',
    '{
      "bajo":  {"min":0,  "max":39,  "acciones":"Diligencia simplificada dentro de los límites de la Ley. Reevaluación semestral ordinaria."},
      "medio": {"min":40, "max":69,  "acciones":"Diligencia estándar. Expediente completo."},
      "alto":  {"min":70, "max":100, "acciones":"Medidas reforzadas de origen y destino de recursos. Aprobación de un directivo antes de operar. Seguimiento intensificado."}
    }'::jsonb
  );

  v_config := v_config || jsonb_build_object(
    'escala_normalizada', true,
    'calibrada', false,
    'nota_calibracion',
      'Los cortes de 40 y 70 son un punto de partida técnicamente razonado, no una '
      || 'conclusión. Requieren calibración contra una muestra real: si más de una cuarta '
      || 'parte de los expedientes cae en alto, la banda no discrimina; si casi ninguno cae, '
      || 'la matriz no está detectando. Las RCG piden doce meses de datos históricos.'
  );

  -- ------------------------------------------------------------------
  -- Publicar la v2 y retirar la v1
  -- ------------------------------------------------------------------
  -- PRIMERO se retira la v1 y DESPUÉS entra la v2, no al revés: hay un índice
  -- único parcial que sólo admite una plantilla activa por organización y
  -- sector, y con la v1 todavía activa el insert de la v2 lo viola. Que exista
  -- ese índice es correcto —dos matrices activas a la vez significarían que dos
  -- clientes idénticos pueden salir clasificados distinto según cuál se leyó—.
  --
  -- La v1 no se borra: las evaluaciones que produjo tienen que poder explicarse
  -- con la plantilla que las calculó. Un expediente cuyo score no se reconstruye
  -- con ninguna configuración existente es el peor resultado posible ante una
  -- verificación.
  update public.client_risk_template
     set activa = false
   where organization_id = v_org and sector = 'XII' and version = 1 and activa;

  insert into public.client_risk_template
    (id, organization_id, sector, version, configuracion, activa, estado, notas_version)
  select v_v2, v_org, 'XII', 2, v_config, true, 'publicada',
         'Adenda 1 de Kawiil-Cumplimiento (31/08/2026), instrucciones 1, 3 y 4. Once actos '
         || 'con clave estable y riesgo base por supuesto; escala de magnitud relativa al '
         || 'umbral del acto; disparadores anclados por clave; escala normalizada a 0-100 '
         || 'sin calibrar.'
   where not exists (select 1 from public.client_risk_template
                      where organization_id = v_org and sector = 'XII' and version = 2);

  -- ------------------------------------------------------------------
  -- Bitácora
  -- ------------------------------------------------------------------
  if not exists (select 1 from public.evento_auditoria
                  where organization_id = v_org and tipo = 'matriz_xii_v2_publicada') then
    perform public.registrar_evento(
      v_org, 'matriz_xii_v2_publicada', 'client_risk_template', v_v2,
      jsonb_build_object(
        'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 1 del 31/08/2026.',
        'diagnostico', 'La v1 no era una matriz de fe pública con parámetros equivocados: '
                    || 'era una matriz de activos virtuales con la etiqueta cambiada.',
        'tipos_de_acto', 'De 4 con nombres anteriores a la 0031, a los 11 del layout con '
                      || 'clave estable y riesgo base por supuesto legal.',
        'anclaje', 'Los disparadores apuntaban a la POSICIÓN de la opción: al crecer el '
                || 'catálogo, el poder irrevocable ocupó el lugar del fideicomiso y '
                || 'disparaba su alerta. Ahora apuntan a la clave.',
        'magnitud', 'De tramos absolutos de 645 y 3,210 UMA —umbrales de activos virtuales '
                 || 'derogados— a proporción del umbral del acto, con corte alto en 150 %.',
        'escala', 'Normalizada a 0-100. SIN CALIBRAR: los cortes de 40 y 70 son punto de '
               || 'partida y la clasificación se presenta como provisional.',
        'v1', 'Se conserva inactiva. Las evaluaciones que produjo deben poder explicarse '
           || 'con la plantilla que las calculó.'
      ),
      'sistema', null
    );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
revoke insert, update, delete on client_risk_template from anon;
