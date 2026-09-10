-- =====================================================================
-- Seed 23 · La matriz de fe pública, al día en un proyecto nuevo
-- =====================================================================
-- Es la misma trampa de la 0075 y del seed 22, y ya van cinco veces: en un
-- proyecto nuevo las migrations corren ANTES que los seeds. La matriz de riesgo
-- de la fracción XII la crea el seed 09; las migrations 0037, 0042 y 0054 —que
-- la suben de la v1 a la v4— corren antes de que exista, no encuentran nada y
-- se retiran en silencio. El proyecto queda con la v1.
--
-- Y la v1 no es una versión vieja e inofensiva: le faltan dos controles que la
-- Célula de Cumplimiento pidió expresamente.
--
--   · La variable de zona geográfica sin `requiere_catalogo`, así que no se
--     ata a la lista de zonas de atención (Adenda 1, apartados 4.4 y 7).
--   · Sin el indicador GAFI_LLAMADO_ACCION como PISO. El puntaje agrupa lista
--     gris y lista negra, y el flujo no puede agruparlas: un llamado a la
--     acción conlleva contramedidas, no diligencia reforzada (Adenda 1,
--     instrucción 7). Sin el indicador, un país bajo llamado a la acción se
--     diluye entre las demás respuestas y el expediente puede salir en banda
--     media.
--
-- Producción está bien: tiene la v4 activa con los dos controles. Lo que estaba
-- roto era levantar un entorno desde cero, y lo cazó `probar_0041_0042`.
--
-- ---------------------------------------------------------------------
-- Por qué un seed y no otra migration
-- ---------------------------------------------------------------------
-- Una migration nueva tendría el mismo problema: corre antes que el seed 09.
-- Esto tiene que vivir DESPUÉS de que la matriz exista, y eso es un seed.
--
-- La configuración de abajo no está inventada ni reconstruida: es la que hoy
-- tiene publicada producción como v4, leída de la base. Las migrations 0037,
-- 0042 y 0054 siguen siendo el registro de POR QUÉ es así —cada una explica su
-- adenda y su instrucción— y este archivo sólo asienta el resultado para quien
-- arranca de cero.
--
-- La versión que publica no será la 4 en un proyecto nuevo: será la siguiente a
-- la que haya. El número de versión cuenta publicaciones de ESA base, no es un
-- identificador del contenido, y por eso `probar_0041_0042` comprueba que la
-- activa sea la más nueva y no que sea «la v4».

do $$
declare
  v_tpl     record;
  v_config  jsonb;
  v_nueva   int;
  v_tocadas int := 0;
begin
  -- La configuración vigente, tal cual la tiene producción.
  v_config := $cfg${
    "calibrada": false,
    "elementos": [
      {
        "codigo": "E1_ACTO",
        "nombre": "Tipo de acto y operación",
        "variables": [
          {
            "codigo": "XII-ACT-01",
            "criterio": "Catálogo del layout de fe pública (rama 3.6.1.3). Riesgo base por supuesto del art. 17 fr. XII, Adenda 1 de Cumplimiento 31/08/2026.",
            "opciones": [
              {"clave": "transmision_inmueble", "label": "Transmisión o constitución de derechos reales sobre inmuebles", "valor": 3, "supuesto": "XII.A.a"},
              {"clave": "otorgamiento_poder", "label": "Otorgamiento de poder irrevocable", "valor": 4, "supuesto": "XII.A.b"},
              {"clave": "constitucion_personas_morales", "label": "Constitución de personas morales", "valor": 3, "supuesto": "XII.A.c"},
              {"clave": "modificacion_patrimonial", "label": "Modificación patrimonial (aumento o disminución de capital)", "valor": 3, "supuesto": "XII.A.c"},
              {"clave": "fusion", "label": "Fusión", "valor": 3, "supuesto": "XII.A.c"},
              {"clave": "escision", "label": "Escisión", "valor": 3, "supuesto": "XII.A.c"},
              {"clave": "compra_venta_acciones", "label": "Compra o venta de acciones o partes sociales", "valor": 3, "supuesto": "XII.A.c"},
              {"clave": "constitucion_modificacion_fideicomiso", "label": "Constitución o modificación de fideicomiso traslativo de dominio o garantía", "valor": 4, "supuesto": "XII.A.d"},
              {"clave": "cesion_derechos_fideicomitente_fideicomisario", "label": "Cesión de derechos de fideicomitente o fideicomisario", "valor": 4, "supuesto": "XII.B.c"},
              {"clave": "contrato_mutuo_credito", "label": "Contrato de mutuo o crédito, con o sin garantía", "valor": 4, "supuesto": "XII.A.e"},
              {"clave": "avaluo", "label": "Realización de avalúos", "valor": 2, "supuesto": "XII.B.a"}
            ],
            "pregunta": "Tipo de acto que se instrumenta"
          },
          {
            "codigo": "XII-ACT-02",
            "criterio": "Proporción del umbral de Aviso del acto. Sin umbral (actos que se avisan siempre), tramos absolutos anclados en el art. 32. Adenda 1, apartados 1.2 y 1.4.",
            "opciones": [
              {"clave": "T1", "label": "Menor al 25 % del umbral del acto", "valor": 1},
              {"clave": "T2", "label": "Del 25 % al 75 % del umbral", "valor": 2},
              {"clave": "T3", "label": "Del 75 % al 150 % del umbral", "valor": 3},
              {"clave": "T4", "label": "Igual o mayor al 150 % del umbral", "valor": 4}
            ],
            "pregunta": "Valor de la operación"
          },
          {
            "codigo": "XII-ACT-03",
            "opciones": [
              {"label": "Bancarizado (transferencia o cheque nominativo)", "valor": 1},
              {"label": "Mixto (parte en efectivo)", "valor": 2},
              {"label": "Efectivo", "valor": 3}
            ],
            "pregunta": "Forma de pago"
          }
        ]
      },
      {
        "codigo": "E2_COMPARECIENTE_PF",
        "nombre": "Compareciente persona física",
        "aplica_si": "tipo_persona == 'fisica'",
        "variables": [
          {
            "codigo": "XII-PF-01",
            "criterio": "El MÁS ALTO entre nacionalidad, país de residencia y país de origen de los recursos, contra el snapshot del GAFI versionado por plenario. Adenda 1, apartado 4.1. Lista gris y lista negra se agrupan para el puntaje —hacia arriba— y se separan para el flujo con el indicador GAFI_LLAMADO_ACCION.",
            "opciones": [
              {"clave": "nacional", "label": "México en los tres campos", "valor": 1},
              {"clave": "sin_observaciones", "label": "Alguno extranjero, sin observaciones del GAFI", "valor": 2},
              {"clave": "riesgo", "label": "Alguno en jurisdicción de riesgo del GAFI (gris o negra)", "valor": 3}
            ],
            "pregunta": "Riesgo país del compareciente"
          },
          {
            "codigo": "XII-PF-02",
            "opciones": [
              {"label": "No es PEP", "valor": 1},
              {"label": "PEP nacional (estatal o municipal)", "valor": 2},
              {"label": "PEP federal o PEP extranjero", "valor": 3}
            ],
            "pregunta": "Condición de PEP"
          },
          {
            "codigo": "XII-PF-03",
            "opciones": [
              {"label": "Actividad de riesgo bajo", "valor": 1},
              {"label": "Actividad de riesgo medio", "valor": 2},
              {"label": "Actividad de riesgo alto (intensiva en efectivo)", "valor": 3}
            ],
            "pregunta": "Actividad o profesión"
          }
        ]
      },
      {
        "codigo": "E3_COMPARECIENTE_PM",
        "nombre": "Compareciente persona moral",
        "aplica_si": "tipo_persona == 'moral'",
        "variables": [
          {
            "codigo": "XII-PM-01",
            "criterio": "El MÁS ALTO entre jurisdicción de constitución, país de residencia y país de origen de los recursos, contra el snapshot del GAFI versionado por plenario. Adenda 1, apartados 4.1 y 4.3.",
            "opciones": [
              {"clave": "nacional", "label": "México en los tres campos", "valor": 1},
              {"clave": "sin_observaciones", "label": "Alguno extranjero, sin observaciones del GAFI", "valor": 2},
              {"clave": "riesgo", "label": "Alguno en jurisdicción de riesgo del GAFI (gris o negra)", "valor": 3}
            ],
            "pregunta": "Riesgo país de la persona moral"
          },
          {
            "codigo": "XII-PM-02",
            "opciones": [
              {"label": "Sí, identificado y documentado", "valor": 1},
              {"label": "Identificado parcialmente", "valor": 2},
              {"label": "No identificado", "valor": 3}
            ],
            "pregunta": "Beneficiario controlador identificado"
          },
          {
            "codigo": "XII-PM-03",
            "opciones": [
              {"label": "Giro de riesgo bajo", "valor": 1},
              {"label": "Giro de riesgo medio", "valor": 2},
              {"label": "Giro de riesgo alto", "valor": 3}
            ],
            "pregunta": "Giro de la sociedad"
          }
        ]
      },
      {
        "codigo": "E4_RECURSOS",
        "nombre": "Recursos de la operación",
        "variables": [
          {
            "codigo": "XII-REC-02",
            "opciones": [
              {"label": "No, solo moneda nacional", "valor": 1},
              {"label": "Moneda extranjera", "valor": 2},
              {"label": "Activos virtuales", "valor": 3}
            ],
            "pregunta": "¿Involucra moneda extranjera o activos virtuales?"
          }
        ]
      },
      {
        "codigo": "E5_CANAL_ZONA_PERFIL",
        "nombre": "Canal, zona geográfica y perfil transaccional",
        "variables": [
          {
            "codigo": "XII-CAN-01",
            "criterio": "Factor obligatorio de las RCG. El canal remoto suma riesgo: es la contrapartida de haber resuelto la identificación con verificación digital. No se deduce de que exista una verificación de Didit —se puede verificar a distancia a quien vino a la notaría—.",
            "opciones": [
              {"clave": "presencial", "label": "Presencial ante el fedatario", "valor": 1},
              {"clave": "remoto_verificacion_reforzada", "label": "Remoto con verificación reforzada", "valor": 2},
              {"clave": "remoto_estandar", "label": "Remoto estándar", "valor": 3}
            ],
            "pregunta": "Canal de distribución"
          },
          {
            "codigo": "XII-ZON-01",
            "criterio": "Entidad federativa y municipio contra la lista interna de zonas de atención, revisada semestralmente. Se toma la MÁS ALTA de las dos ubicaciones. Adenda 1, apartados 4.4 y 7.",
            "opciones": [
              {"clave": "sin_observaciones", "label": "Sin observaciones en la lista interna", "valor": 1},
              {"clave": "atencion", "label": "Zona de atención", "valor": 2},
              {"clave": "atencion_prioritaria", "label": "Zona de atención prioritaria", "valor": 3}
            ],
            "pregunta": "Zona geográfica del inmueble y del domicilio del cliente",
            "requiere_catalogo": "zona_atencion"
          },
          {
            "codigo": "XII-PTR-01",
            "criterio": "Operaciones de los últimos seis meses contra la mitad de la frecuencia anual declarada al alta, redondeada hacia arriba. Misma ventana móvil del art. 7 del Reglamento que usa el motor. Cap. III Ter de las RCG.",
            "opciones": [
              {"clave": "dentro", "label": "Dentro de la frecuencia declarada", "valor": 1},
              {"clave": "sin_declaracion", "label": "El cliente no declaró frecuencia esperada", "valor": 2},
              {"clave": "excede", "label": "Excede la frecuencia declarada", "valor": 3}
            ],
            "pregunta": "Frecuencia de operación frente a la declarada"
          }
        ]
      }
    ],
    "indicadores": [
      {
        "codigo": "GAFI_LLAMADO_ACCION",
        "efecto": "piso",
        "pregunta": "¿Alguno de los países capturados está bajo llamado a la acción del GAFI?",
        "descripcion": "Llamado a la acción conlleva CONTRAMEDIDAS, no simplemente diligencia reforzada. El puntaje agrupa lista gris y lista negra; el flujo no puede agruparlas. Levanta piso de banda alta y revisión obligatoria del Oficial de Cumplimiento antes de continuar."
      },
      {
        "codigo": "PAIS_SANCIONADO",
        "efecto": "piso",
        "pregunta": "¿Alguno de los países capturados está bajo régimen de sanciones de la ONU o de OFAC?",
        "descripcion": "Sanción y deficiencia técnica no son lo mismo: el GAFI evalúa la solidez del régimen PLD de una jurisdicción y una sanción no dice nada sobre eso —un país puede tener un régimen impecable y estar bajo embargo—. Levanta piso de banda alta. Las resoluciones del Consejo de Seguridad vinculan a México; OFAC es derecho extranjero y pesa como exposición a sanciones secundarias y valor indiciario, no como ley aplicable. El nivel de prohibición NO se resuelve aquí: bloquea y escala."
      }
    ],
    "escala_cliente": {
      "alto": {"max": 100, "min": 70, "acciones": "Medidas reforzadas de origen y destino de recursos. Aprobación de un directivo antes de operar. Seguimiento intensificado."},
      "bajo": {"max": 39, "min": 0, "acciones": "Diligencia simplificada dentro de los límites de la Ley. Reevaluación semestral ordinaria."},
      "medio": {"max": 69, "min": 40, "acciones": "Diligencia estándar. Expediente completo."}
    },
    "nota_calibracion": "Los cortes de 40 y 70 son un punto de partida técnicamente razonado, no una conclusión. La v3 cambió el máximo de la escala —entran canal, zona y perfil transaccional; sale el país de los fondos como variable propia—, así que la calibración se hace contra esta versión. Si más de una cuarta parte de los expedientes cae en alto, la banda no discrimina; si casi ninguno cae, la matriz no está detectando. Las RCG piden doce meses de datos históricos.",
    "escala_normalizada": true,
    "triggers_alto_de_oficio": [
      {"claves": ["otorgamiento_poder"], "codigo": "PODER_IRREVOCABLE", "descripcion": "Otorgamiento de poder irrevocable. Transfiere control efectivo sobre bienes sin cambio de titular registral.", "variable_codigo": "XII-ACT-01"},
      {"claves": ["constitucion_modificacion_fideicomiso", "cesion_derechos_fideicomitente_fideicomisario"], "codigo": "FIDEICOMISO", "descripcion": "Constitución o modificación de fideicomiso traslativo o de garantía. Opacidad del beneficiario.", "variable_codigo": "XII-ACT-01"},
      {"claves": ["contrato_mutuo_credito"], "codigo": "MUTUO_FUERA_SISTEMA_FINANCIERO", "descripcion": "Mutuo o crédito con acreedor fuera del sistema financiero. Contraparte acreedora no supervisada.", "variable_codigo": "XII-ACT-01"},
      {"codigo": "PEP_EXTRANJERO", "descripcion": "Compareciente PEP federal o extranjero, o su cónyuge, familiar hasta segundo grado o asociado cercano.", "valor_minimo": 3, "variable_codigo": "XII-PF-02"},
      {"codigo": "GAFI_LLAMADO_ACCION", "descripcion": "País bajo llamado a la acción del GAFI. Conlleva contramedidas: revisión obligatoria del Oficial de Cumplimiento antes de continuar.", "indicador_codigo": "GAFI_LLAMADO_ACCION"},
      {"codigo": "BENEFICIARIO_NO_DETERMINABLE", "descripcion": "Beneficiario controlador no determinable tras agotar el orden de prelación de las RCG.", "valor_minimo": 3, "variable_codigo": "XII-PM-02"},
      {"codigo": "PAIS_SANCIONADO", "descripcion": "País del compareciente, de constitución o de origen de los recursos bajo régimen de sanciones de la ONU o de OFAC. Piso de banda alta conforme al apartado 3.2 de la Adenda 3.", "indicador_codigo": "PAIS_SANCIONADO"}
    ]
  }$cfg$::jsonb;

  for v_tpl in
    select id, organization_id, sector, version, configuracion
      from client_risk_template
     where sector = 'XII' and activa
  loop
    -- Si la activa ya trae los dos controles, no hay nada que publicar. Es lo
    -- que hace que este archivo sea inofensivo en una base que ya está al día:
    -- se comprueba el CONTENIDO, no el número de versión, porque el número
    -- depende de cuántas publicaciones lleve esa base.
    if exists (
         select 1
           from jsonb_array_elements(v_tpl.configuracion -> 'elementos') e,
                jsonb_array_elements(e -> 'variables') v
          where v ->> 'requiere_catalogo' = 'zona_atencion')
       and exists (
         select 1 from jsonb_array_elements(v_tpl.configuracion -> 'indicadores') i
          where i ->> 'codigo' = 'GAFI_LLAMADO_ACCION' and i ->> 'efecto' = 'piso')
    then
      continue;
    end if;

    select coalesce(max(version), 0) + 1 into v_nueva
      from client_risk_template
     where organization_id = v_tpl.organization_id and sector = v_tpl.sector;

    -- PRIMERO se retira la anterior: hay un índice único parcial que sólo
    -- admite una plantilla activa por organización y sector. Mismo orden que
    -- usa la 0054, y por la misma razón.
    update client_risk_template set activa = false where id = v_tpl.id;

    insert into client_risk_template
      (organization_id, sector, version, configuracion, activa, estado, notas_version)
    values (
      v_tpl.organization_id, v_tpl.sector, v_nueva, v_config, true, 'publicada',
      'Pone la matriz de fe pública al día en un proyecto nuevo. Las migrations 0037, 0042 y '
      || '0054 la suben de la v1 a la v4, pero en un proyecto nuevo corren ANTES que el seed 09 '
      || 'que la crea, así que no encuentran nada y el proyecto se queda en la v1 —sin el '
      || 'catálogo de zonas de atención y sin el indicador de llamado a la acción como piso—. '
      || 'Esta versión asienta el contenido vigente. Sustituye a la v' || v_tpl.version || '.'
    );
    v_tocadas := v_tocadas + 1;
  end loop;

  if v_tocadas > 0 then
    raise notice 'Matriz de fe pública puesta al día en % plantilla(s).', v_tocadas;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Comprobación
-- ---------------------------------------------------------------------
-- Que ninguna matriz XII activa se quede sin los dos controles. Si esto
-- revienta, el proyecto nacería clasificando clientes con una matriz a la que
-- le faltan controles que Cumplimiento pidió, y eso no se ve en pantalla.
do $comprobar$
declare v_malas text;
begin
  select string_agg(organization_id::text || ' v' || version, ', ') into v_malas
    from client_risk_template t
   where t.sector = 'XII' and t.activa
     and (not exists (
            select 1
              from jsonb_array_elements(t.configuracion -> 'elementos') e,
                   jsonb_array_elements(e -> 'variables') v
             where v ->> 'requiere_catalogo' = 'zona_atencion')
       or not exists (
            select 1 from jsonb_array_elements(t.configuracion -> 'indicadores') i
             where i ->> 'codigo' = 'GAFI_LLAMADO_ACCION' and i ->> 'efecto' = 'piso'));
  if v_malas is not null then
    raise exception 'Matrices XII activas sin los controles de la Adenda 1: %', v_malas;
  end if;
end $comprobar$;
