-- =====================================================================
-- Pruebas de comportamiento de la 0058 · subdivisión territorial
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql.
--
-- Lo que hay que demostrar, y las dos primeras son las que justifican que la
-- dimensión exista:
--
--   · Que un compareciente de Crimea sale en PROHIBICIÓN aunque Ucrania como
--     país sea sólo riesgo alto. Sin subdivisión, la operación con la región
--     ocupada pasaba como riesgo alto y seguía adelante.
--
--   · Que un compareciente de Leópolis NO sale en prohibición. Poner Ucrania
--     entera en nivel 1 habría sobrebloqueado a un país completo.
--
--   · Que la subdivisión nunca REBAJA. Un óblast tranquilo dentro de un país
--     sancionado sigue estando en un país sancionado.
--
--   · Que falta la subdivisión se ve, y se ve sin impedir guardar: en una
--     notaría el compareciente está delante y el expediente se completa en
--     pasos.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org  uuid;
  v_cli  uuid;
  v_txt  text;
  v_det  text;
  v_n    int;
  v_msg  text;
begin
  perform set_config('ikan.uid', '', true);
  select id into v_org from organizations where 'XII' = any(sectores) order by creada_en limit 1;

  -- Ucrania tiene que estar en la lista del país, en riesgo alto: es la
  -- premisa de todo lo demás.
  select nivel into v_n from country_risk_list
   where organization_id = v_org and iso2 = 'UA' and vigente_hasta is null
   order by nivel desc limit 1;
  insert into resultado values (1, 'Ucrania está como país en riesgo alto, no en prohibición',
    '2', coalesce(v_n::text, '(sin fila)'), v_n = 2);

  -- ------------------------------------------------------------------
  -- 2. Crimea: prohibición, aunque el país sea riesgo alto
  -- ------------------------------------------------------------------
  insert into client (organization_id, tipo_persona, nombre_razon_social,
                      pais_residencia_iso2, subdivision_clave)
  values (v_org, 'fisica', 'Compareciente de Crimea', 'UA', 'UA-43')
  returning id into v_cli;

  select nivel, origen into v_txt, v_det
    from public.nivel_territorial_del_expediente(v_cli);
  insert into resultado values (2, 'Un compareciente de Crimea sale en PROHIBICIÓN',
    'prohibicion', coalesce(v_txt, '(nada)'), v_txt = 'prohibicion');
  insert into resultado values (3, 'Y el origen dice que fue la subdivisión',
    'subdivisión UA-43', coalesce(v_det, '(nada)'), v_det = 'subdivisión UA-43');

  -- ------------------------------------------------------------------
  -- 4. Leópolis: riesgo alto, no prohibición
  -- ------------------------------------------------------------------
  -- La otra mitad. Poner Ucrania entera en nivel 1 habría marcado a este
  -- compareciente igual que al de Crimea.
  update client set subdivision_clave = null where id = v_cli;
  select nivel, origen into v_txt, v_det
    from public.nivel_territorial_del_expediente(v_cli);
  insert into resultado values (4, 'Sin subdivisión, Ucrania es riesgo alto y no prohibición',
    'riesgo_alto', coalesce(v_txt, '(nada)'), v_txt = 'riesgo_alto');
  insert into resultado values (5, 'Y el origen dice que fue el país',
    'país UA', coalesce(v_det, '(nada)'), v_det = 'país UA');

  -- ------------------------------------------------------------------
  -- 6. La subdivisión no rebaja
  -- ------------------------------------------------------------------
  -- Se le pone a Irán —prohibición como país— una subdivisión de riesgo alto
  -- inventada para la prueba. El expediente tiene que seguir en prohibición.
  insert into subdivision_riesgo (clave, pais_iso2, nombre, nivel_territorial, derivacion)
  values ('IR-07', 'IR', 'Provincia de prueba', 'riesgo_alto',
          'Fila de prueba: comprueba que una subdivisión menos severa no rebaja el país.')
    on conflict (clave) do nothing;
  update client set pais_residencia_iso2 = 'IR', subdivision_clave = 'IR-07' where id = v_cli;
  select nivel, origen into v_txt, v_det
    from public.nivel_territorial_del_expediente(v_cli);
  insert into resultado values (6, 'Una subdivisión menos severa NO rebaja el país',
    'prohibicion', coalesce(v_txt, '(nada)'), v_txt = 'prohibicion');

  -- ------------------------------------------------------------------
  -- 7. Falta la subdivisión: se ve, pero deja guardar
  -- ------------------------------------------------------------------
  update client set pais_residencia_iso2 = 'UA', subdivision_clave = null where id = v_cli;
  select count(*) into v_n from public.subdivision_pendiente(v_cli);
  insert into resultado values (7, 'Con país Ucrania y sin subdivisión, sale como pendiente',
    '1', v_n::text, v_n = 1);

  select motivo into v_txt from public.subdivision_pendiente(v_cli);
  insert into resultado values (8, 'Y el pendiente dice por qué, no sólo que falta',
    'menciona las regiones', coalesce(left(v_txt, 40), '(nulo)'), v_txt like '%Crimea%');

  -- Con la subdivisión puesta deja de estar pendiente.
  update client set subdivision_clave = 'UA-43' where id = v_cli;
  select count(*) into v_n from public.subdivision_pendiente(v_cli);
  insert into resultado values (9, 'Con la subdivisión puesta, deja de estar pendiente',
    '0', v_n::text, v_n = 0);

  -- Y un país que no la exige no la pide.
  update client set pais_residencia_iso2 = 'ES', subdivision_clave = null where id = v_cli;
  select count(*) into v_n from public.subdivision_pendiente(v_cli);
  insert into resultado values (10, 'Un país que no la exige no la pide',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 10 bis. «Ninguna de las listadas» es una respuesta, no una omisión
  -- ------------------------------------------------------------------
  -- Sin esta distinción el aviso no se puede quitar contestando, y un aviso
  -- que no se puede quitar enseña a ignorarlo.
  update client set pais_residencia_iso2 = 'UA', subdivision_clave = null,
                    subdivision_fuera_de_lista = true
   where id = v_cli;
  select count(*) into v_n from public.subdivision_pendiente(v_cli);
  insert into resultado values (15, 'Contestar «fuera de las listadas» quita el pendiente',
    '0', v_n::text, v_n = 0);

  -- Y las dos cosas a la vez no se admiten: si se elige una región, la
  -- respuesta anterior tiene que apagarse.
  begin
    update client set subdivision_clave = 'UA-43' where id = v_cli;
    insert into resultado values (16, 'No se puede estar «fuera de la lista» Y en una región',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (16, 'No se puede estar «fuera de la lista» Y en una región',
      'excepción', 'excepción', true);
  end;
  update client set subdivision_fuera_de_lista = false, subdivision_clave = null where id = v_cli;

  -- ------------------------------------------------------------------
  -- 11. Las pendientes de confirmación se distinguen
  -- ------------------------------------------------------------------
  update client set pais_residencia_iso2 = 'UA', subdivision_clave = 'UA-65' where id = v_cli;
  select detalle into v_txt from public.nivel_territorial_del_expediente(v_cli);
  insert into resultado values (11, 'Jersón se marca como pendiente de confirmación documental',
    'lo dice', coalesce(left(v_txt, 60), '(nulo)'), v_txt like '%pendiente de confirmación%');

  select detalle into v_txt from public.nivel_territorial_del_expediente(v_cli);
  update client set subdivision_clave = 'UA-43' where id = v_cli;
  select detalle into v_txt from public.nivel_territorial_del_expediente(v_cli);
  insert into resultado values (12, 'Crimea, que sí está confirmada, no lleva esa marca',
    'sin marca', coalesce(left(v_txt, 60), '(nulo)'), v_txt not like '%pendiente%');

  -- ------------------------------------------------------------------
  -- 13. Una subdivisión sin derivación no entra
  -- ------------------------------------------------------------------
  begin
    insert into subdivision_riesgo (clave, pais_iso2, nombre, nivel_territorial, derivacion)
    values ('XX-01', 'XX', 'Sin fundamento', 'prohibicion', '   ');
    insert into resultado values (13, 'Una subdivisión sin derivación escrita se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (13, 'Una subdivisión sin derivación escrita se rechaza',
      'excepción', 'excepción', true);
  end;

  -- Y una clave que no sea ISO 3166-2 tampoco.
  begin
    insert into subdivision_riesgo (clave, pais_iso2, nombre, nivel_territorial, derivacion)
    values ('crimea', 'UA', 'Mal escrita', 'prohibicion', 'Motivo cualquiera.');
    insert into resultado values (14, 'Una clave que no es ISO 3166-2 se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (14, 'Una clave que no es ISO 3166-2 se rechaza',
      'excepción', 'excepción', true);
  end;

  delete from client where id = v_cli;
  delete from subdivision_riesgo where clave = 'IR-07';

exception when others then
  get stacked diagnostics v_msg = message_text;
  insert into resultado values (99, 'La prueba corrió sin errores',
    'sin errores', v_msg, false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
