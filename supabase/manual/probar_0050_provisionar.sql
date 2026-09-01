-- =====================================================================
-- Pruebas de comportamiento de la 0050 · provisionar una organización
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql, nunca contra
-- el remoto.
--
-- Lo que hay que demostrar:
--
--   · Que una organización recién provisionada NO arranca ciega. Los tres
--     huecos —sin matriz, sin GAFI, sin tipologías— se ven todos iguales desde
--     la aplicación (verde), así que la única forma de saber que se taparon es
--     preguntárselo a la base.
--
--   · Que la matriz que hereda es la VIGENTE de la referencia y entra como su
--     versión 1: su historial empieza en ella, no hereda el ajeno.
--
--   · Que las tipologías entran SIN aprobación del OC. La que dio el Oficial de
--     Cumplimiento de la referencia no vale por el de esta organización, y
--     copiarla haría pasar por aprobado algo que nadie aprobó.
--
--   · Que una organización real NO queda marcada como demostración. El banner
--     ámbar le diría al notario que lo que captura no cuenta, y sí cuenta.
--
--   · Que correrla dos veces no duplica nada.
--
--   · Que sin organización de referencia FALLA en vez de crear una a medias y
--     devolverla como si estuviera lista.
--
--   · Que sólo Kawiil puede llamarla.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_admin     uuid := '99999999-0000-0000-0000-000000000001';
  v_ref       uuid;
  v_nueva     uuid;
  v_otra      uuid;
  v_n         int;
  v_m         int;
  v_txt       text;
  v_bool      boolean;
  v_msg       text;
begin
  -- ------------------------------------------------------------------
  -- Montaje: un admin de Kawiil y una organización de referencia XII con
  -- lo que una organización necesita para operar.
  -- ------------------------------------------------------------------
  insert into auth.users (id) values (v_admin) on conflict do nothing;
  insert into platform_admin (user_id, nombre) values (v_admin, 'Prueba Kawiil') on conflict do nothing;
  perform set_config('ikan.uid', v_admin::text, true);

  insert into organizations (rfc, razon_social, sectores, perfil_actividad, es_referencia)
  values ('REF010101AAA', 'Notaría de referencia', array['XII']::sector_av[], 'notarias', true)
  returning id into v_ref;

  insert into client_risk_template (organization_id, sector, version, configuracion, activa, estado)
  values (v_ref, 'XII', 7,
          '{"elementos":[{"codigo":"E1","nombre":"Identificación","variables":[{"codigo":"XII-PF-01","pregunta":"Riesgo país","opciones":[{"valor":1,"label":"Nacional","clave":"nacional"}]}]}],"escala_cliente":{"bajo":{"min":0,"max":1,"acciones":"Anual"},"medio":{"min":2,"max":3,"acciones":"Semestral"},"alto":{"min":4,"max":5,"acciones":"Trimestral"}}}'::jsonb,
          true, 'publicada');

  insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente, plenario)
  values (v_ref, 'IR', 'Irán', 3, 'gafi_negra', 'junio 2026'),
         (v_ref, 'MM', 'Myanmar', 3, 'gafi_negra', 'junio 2026'),
         (v_ref, 'BO', 'Bolivia', 2, 'gafi_gris', 'junio 2026');
  -- Una que YA salió de la lista: no debe heredarse.
  insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente, vigente_desde, vigente_hasta, plenario)
  values (v_ref, 'AL', 'Albania', 2, 'gafi_gris', current_date - 400, current_date - 30, 'febrero 2025');

  insert into tipologia_av (organization_id, sector, codigo, nombre, descripcion,
                            regla_dsl, severidad, activa, aprobada_por_oc_en, aprobada_por_oc)
  values (v_ref, 'XII', 'XII-01', 'Fraccionamiento', 'Actos partidos bajo el umbral',
          '{"tipo":"umbral"}'::jsonb, 'alta', true, now(), v_admin),
         (v_ref, 'XII', 'XII-02', 'País de alto riesgo', 'Contraparte en jurisdicción listada',
          '{"tipo":"pais"}'::jsonb, 'alta', true, now(), v_admin);

  -- ------------------------------------------------------------------
  -- 1. Antes de provisionar, el diagnóstico ve los huecos
  -- ------------------------------------------------------------------
  insert into organizations (rfc, razon_social, sectores, perfil_actividad)
  values ('CIE010101BBB', 'Notaría a ciegas', array['XII']::sector_av[], 'notarias')
  returning id into v_otra;

  select count(*) into v_n
    from public.diagnostico_organizacion(v_otra)
   where not listo;
  insert into resultado values (1, 'Una organización sin provisionar sale con huecos',
    'al menos 3', v_n::text, v_n >= 3);

  -- ------------------------------------------------------------------
  -- 2. Provisionar deja la organización sin huecos operativos
  -- ------------------------------------------------------------------
  v_nueva := public.provisionar_organizacion(
    'NUE010101CCC', 'Notaría Pública 42', 'XII', 'notarias',
    'Av. Vallarta 100, Guadalajara', 'Lic. Quien Sea');

  select count(*) into v_n
    from public.diagnostico_organizacion(v_nueva)
   where not listo and concepto <> 'Usuarios con rol';
  insert into resultado values (2, 'Provisionada, no quedan huecos salvo los usuarios',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 3. Los usuarios SIGUEN faltando, y el diagnóstico lo dice
  -- ------------------------------------------------------------------
  -- No es un olvido: crear usuarios es de Supabase Auth, no de SQL. Lo que no
  -- puede pasar es que el diagnóstico calle y la organización parezca lista.
  select listo into v_bool
    from public.diagnostico_organizacion(v_nueva)
   where concepto = 'Usuarios con rol';
  insert into resultado values (3, 'Sin usuarios, el diagnóstico no la da por lista',
    'false', v_bool::text, v_bool = false);

  -- ------------------------------------------------------------------
  -- 4. La matriz es la vigente de la referencia, y entra como versión 1
  -- ------------------------------------------------------------------
  select version into v_n from client_risk_template
   where organization_id = v_nueva and sector = 'XII' and activa;
  insert into resultado values (4, 'Su matriz empieza en la versión 1, no hereda el historial ajeno',
    '1', v_n::text, v_n = 1);

  select count(*) into v_n from client_risk_template t
   where t.organization_id = v_nueva
     and t.configuracion = (select configuracion from client_risk_template
                             where organization_id = v_ref and activa);
  insert into resultado values (5, 'La configuración es la misma que la vigente de la referencia',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 6. El GAFI: hereda las vigentes y NO la que ya había salido
  -- ------------------------------------------------------------------
  select count(*) into v_n from country_risk_list
   where organization_id = v_nueva and vigente_hasta is null;
  insert into resultado values (6, 'Hereda las tres jurisdicciones vigentes',
    '3', v_n::text, v_n = 3);

  select count(*) into v_n from country_risk_list
   where organization_id = v_nueva and iso2 = 'AL';
  insert into resultado values (7, 'NO hereda la que el GAFI ya había quitado',
    '0', v_n::text, v_n = 0);

  select plenario into v_txt from country_risk_list
   where organization_id = v_nueva and iso2 = 'IR';
  insert into resultado values (8, 'Se conserva el plenario con que se calificó',
    'junio 2026', coalesce(v_txt, '(nulo)'), v_txt = 'junio 2026');

  -- ------------------------------------------------------------------
  -- 9. Las tipologías entran SIN la aprobación del OC ajeno
  -- ------------------------------------------------------------------
  select count(*) into v_n from tipologia_av
   where organization_id = v_nueva and activa;
  insert into resultado values (9, 'Hereda las dos tipologías activas',
    '2', v_n::text, v_n = 2);

  select count(*) into v_n from tipologia_av
   where organization_id = v_nueva and aprobada_por_oc_en is not null;
  insert into resultado values (10, 'Ninguna llega aprobada: la del OC ajeno no vale aquí',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 11. Una organización real no es demostración
  -- ------------------------------------------------------------------
  select es_demostracion into v_bool from organizations where id = v_nueva;
  insert into resultado values (11, 'No queda marcada como demostración',
    'false', v_bool::text, v_bool = false);

  -- ------------------------------------------------------------------
  -- 12. Las claves del padrón quedan puestas
  -- ------------------------------------------------------------------
  select clave_sujeto_obligado || '/' || clave_actividad into v_txt
    from organizations where id = v_nueva;
  insert into resultado values (12, 'Clave de sujeto obligado del RFC y clave de actividad del sector',
    'NUE010101CCC/FEP', coalesce(v_txt, '(nulo)'), v_txt = 'NUE010101CCC/FEP');

  -- ------------------------------------------------------------------
  -- 13. Correrla otra vez no duplica nada
  -- ------------------------------------------------------------------
  select count(*) into v_n from country_risk_list where organization_id = v_nueva;
  select count(*) into v_m from tipologia_av where organization_id = v_nueva;
  perform public.provisionar_organizacion(
    'NUE010101CCC', 'Notaría Pública 42', 'XII', 'notarias');
  insert into resultado values (13, 'Segunda corrida: mismas jurisdicciones',
    v_n::text, (select count(*)::text from country_risk_list where organization_id = v_nueva),
    v_n = (select count(*) from country_risk_list where organization_id = v_nueva));
  insert into resultado values (14, 'Segunda corrida: mismas tipologías',
    v_m::text, (select count(*)::text from tipologia_av where organization_id = v_nueva),
    v_m = (select count(*) from tipologia_av where organization_id = v_nueva));

  select count(*) into v_n from organizations where upper(rfc) = 'NUE010101CCC';
  insert into resultado values (15, 'Segunda corrida: una sola organización',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 16. Sin referencia para el sector, FALLA
  -- ------------------------------------------------------------------
  -- Lo importante no es que falle: es que NO cree la organización a medias y
  -- la devuelva como si estuviera lista. Ese sería el mismo error, con la
  -- apariencia de haberlo arreglado.
  begin
    perform public.provisionar_organizacion(
      'XVI010101DDD', 'Exchange sin referencia', 'XVI', 'activos_virtuales');
    insert into resultado values (16, 'Sin referencia del sector, se niega',
      'excepción', 'no falló', false);
  exception when others then
    select count(*) into v_n from organizations where upper(rfc) = 'XVI010101DDD';
    insert into resultado values (16, 'Sin referencia del sector, se niega y no deja nada a medias',
      'excepción y 0 organizaciones', 'excepción y ' || v_n || ' organizaciones', v_n = 0);
  end;

  -- ------------------------------------------------------------------
  -- 17. Sólo Kawiil puede provisionar
  -- ------------------------------------------------------------------
  perform set_config('ikan.uid', '88888888-0000-0000-0000-000000000001', true);
  begin
    perform public.provisionar_organizacion(
      'AJE010101EEE', 'Alguien ajeno', 'XII', 'notarias');
    insert into resultado values (17, 'Quien no es de Kawiil no puede provisionar',
      'excepción', 'no falló', false);
  exception when others then
    insert into resultado values (17, 'Quien no es de Kawiil no puede provisionar',
      'excepción', 'excepción', true);
  end;
  perform set_config('ikan.uid', v_admin::text, true);

  -- ------------------------------------------------------------------
  -- 18. Queda en la bitácora
  -- ------------------------------------------------------------------
  select count(*) into v_n from evento_auditoria
   where organization_id = v_nueva and tipo = 'organizacion_provisionada';
  insert into resultado values (18, 'La provisión queda asentada en la bitácora',
    'al menos 1', v_n::text, v_n >= 1);

  -- ------------------------------------------------------------------
  -- 19. La cadena de bitácora sigue íntegra
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  insert into resultado values (19, 'Ninguna cadena rota', '0', v_n::text, v_n = 0);

exception when others then
  get stacked diagnostics v_msg = message_text;
  insert into resultado values (99, 'La prueba corrió sin errores',
    'sin errores', v_msg, false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
