-- =====================================================================
-- Pruebas de comportamiento de la 0041 y la 0042 · factores de las RCG
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql, nunca contra
-- el remoto: crea datos.
--
-- Lo que hay que demostrar:
--
--   · Que la lista de zonas de atención NACE VACÍA y sigue vacía. Es la prueba
--     más importante del par, y la que más fácil se rompería sin querer: una
--     lista sembrada con municipios elegidos por nosotros califica personas con
--     metodología que Cumplimiento no aprobó.
--
--   · Que el canal de distribución no admite valores fuera de los tres.
--
--   · Que la matriz v3 quedó activa, la v2 inactiva y NINGUNA borrada.
--
--   · Que ningún disparador apunta a un valor que su variable no puede
--     alcanzar. Es exactamente lo que le pasó a GAFI_NEGRA en la v2.
--
--   · Que la evaluación registra contra qué versiones se calculó.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org  uuid := '12121212-1212-1212-1212-121212121212';  -- Notaría Demo GDL
  v_cli  uuid;
  v_v3   uuid;
  v_n    int;
  v_txt  text;
  v_msg  text;
begin
  -- ------------------------------------------------------------------
  -- 1. La lista de zonas de atención está vacía
  -- ------------------------------------------------------------------
  -- No es un descuido: la determinación de qué zonas son de atención es de
  -- Kawiil-Cumplimiento. Con la lista vacía la variable no puntúa y queda fuera
  -- del máximo; responder «sin observaciones» a todo le daría la calificación
  -- más baja a cualquier ubicación del país.
  select count(*) into v_n from zona_atencion;
  insert into resultado values (1, 'La lista de zonas de atención nace vacía',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 2. El canal de distribución sólo admite los tres valores
  -- ------------------------------------------------------------------
  insert into client (organization_id, tipo_persona, nombre_razon_social,
                      canal_distribucion, municipio, frecuencia_esperada_anual)
  values (v_org, 'fisica', 'Compareciente 0042', 'remoto_estandar', 'Zapopan', 4)
  returning id into v_cli;
  insert into resultado values (2, 'Canal válido: se registra',
    'se registró', 'se registró', true);

  begin
    update client set canal_distribucion = 'por_correo' where id = v_cli;
    insert into resultado values (3, 'Canal inventado: se rechaza',
      'rechazado', 'se aceptó', false);
  exception when check_violation then
    insert into resultado values (3, 'Canal inventado: se rechaza',
      'rechazado', 'rechazado', true);
  end;

  -- Una frecuencia negativa no es una declaración, es un error de captura.
  begin
    update client set frecuencia_esperada_anual = -1 where id = v_cli;
    insert into resultado values (4, 'Frecuencia negativa: se rechaza',
      'rechazado', 'se aceptó', false);
  exception when check_violation then
    insert into resultado values (4, 'Frecuencia negativa: se rechaza',
      'rechazado', 'rechazado', true);
  end;

  -- ------------------------------------------------------------------
  -- 5. Una sola matriz XII activa, y es la v3
  -- ------------------------------------------------------------------
  -- Dos activas significarían que dos comparecientes idénticos pueden salir
  -- clasificados distinto según cuál se leyó.
  select count(*) into v_n
    from client_risk_template where organization_id = v_org and sector = 'XII' and activa;
  insert into resultado values (5, 'Una sola matriz XII activa',
    '1', v_n::text, v_n = 1);

  select id into v_v3
    from client_risk_template
   where organization_id = v_org and sector = 'XII' and activa;
  select version::text into v_txt from client_risk_template where id = v_v3;
  insert into resultado values (6, 'La activa es la v3', '3', v_txt, v_txt = '3');

  -- ------------------------------------------------------------------
  -- 7. Las versiones anteriores se conservan
  -- ------------------------------------------------------------------
  -- Las evaluaciones que produjeron tienen que poder explicarse con la
  -- plantilla que las calculó. Un expediente cuyo score no se reconstruye con
  -- ninguna configuración existente es el peor resultado ante una verificación.
  select count(*) into v_n
    from client_risk_template where organization_id = v_org and sector = 'XII';
  insert into resultado values (7, 'v1 y v2 se conservan inactivas',
    '3 versiones', v_n::text || ' versiones', v_n = 3);

  -- ------------------------------------------------------------------
  -- 8. La variable de zona declara su catálogo
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from client_risk_template t,
         jsonb_array_elements(t.configuracion -> 'elementos') e,
         jsonb_array_elements(e -> 'variables') v
   where t.id = v_v3 and v ->> 'requiere_catalogo' = 'zona_atencion';
  insert into resultado values (8, 'La variable de zona declara requiere_catalogo',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 9. Ningún disparador apunta a un valor inalcanzable
  -- ------------------------------------------------------------------
  -- El defecto de la v2: GAFI_NEGRA exigía XII-PM-01 >= 4 y esa variable pasó a
  -- tener tres opciones. Un disparador que no puede dispararse se lee en la
  -- plantilla como si el control existiera, que es peor que no tenerlo.
  select count(*) into v_n
    from client_risk_template t,
         jsonb_array_elements(t.configuracion -> 'triggers_alto_de_oficio') d
   where t.id = v_v3
     and d ? 'valor_minimo'
     and (d ->> 'valor_minimo')::int > coalesce((
           select max((o ->> 'valor')::int)
             from jsonb_array_elements(t.configuracion -> 'elementos') e,
                  jsonb_array_elements(e -> 'variables') v,
                  jsonb_array_elements(v -> 'opciones') o
            where v ->> 'codigo' = d ->> 'variable_codigo'), -1);
  insert into resultado values (9, 'Ningún disparador inalcanzable',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 10. El indicador booleano existe y su disparador lo referencia
  -- ------------------------------------------------------------------
  -- El puntaje agrupa gris y negra; el flujo no puede agruparlas, porque el
  -- llamado a la acción conlleva contramedidas y no diligencia reforzada.
  select count(*) into v_n
    from client_risk_template t,
         jsonb_array_elements(t.configuracion -> 'triggers_alto_de_oficio') d
   where t.id = v_v3 and d ->> 'indicador_codigo' = 'GAFI_LLAMADO_ACCION'
     and exists (select 1 from jsonb_array_elements(t.configuracion -> 'indicadores') i
                  where i ->> 'codigo' = 'GAFI_LLAMADO_ACCION' and i ->> 'efecto' = 'piso');
  insert into resultado values (10, 'El indicador de llamado a la acción es piso',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 11. La evaluación puede registrar contra qué versiones se calculó
  -- ------------------------------------------------------------------
  -- Sin ese registro, la reclasificación semestral del Cap. III Bis es
  -- indistinguible de una corrección de errores.
  insert into client_risk_assessment
    (client_id, template_id, respuestas, subtotales, score_total, clasificacion,
     snapshot_listas_plenario, metodologia_version)
  values (v_cli, v_v3, '{}'::jsonb, '{}'::jsonb, 0, 'bajo', '2026-06', 3);
  select snapshot_listas_plenario || ' / v' || metodologia_version into v_txt
    from client_risk_assessment where client_id = v_cli;
  insert into resultado values (11, 'La evaluación guarda plenario y versión de metodología',
    '2026-06 / v3', v_txt, v_txt = '2026-06 / v3');

  -- ------------------------------------------------------------------
  -- 12. La cadena de bitácora sigue íntegra
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  insert into resultado values (12, 'Ninguna cadena rota', '0', v_n::text, v_n = 0);

exception when others then
  get stacked diagnostics v_msg = message_text;
  insert into resultado values (99, 'La prueba corrió sin errores',
    'sin errores', v_msg, false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
