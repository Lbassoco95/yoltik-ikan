-- =====================================================================
-- Pruebas de comportamiento de la 0053 · regímenes ONU y OFAC
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql, migrations y
-- seeds. Nunca contra el remoto.
--
-- Lo que hay que demostrar:
--
--   · Que los programas PERSONALES no producen países. Es la respuesta central
--     de la Adenda 3: un programa de contraterrorismo designa personas, y
--     meterlas en la variable de país marca a quien no debe y deja de marcar a
--     quien sí. Si trece programas se colaran, el defecto sería invisible —más
--     países cargados se ve «mejor»— y estaría marcando gente por nacionalidad.
--
--   · Que el nivel de la adenda NO se confundió con el entero de
--     country_risk_list, que va al revés. Un país bajo embargo tiene que salir
--     con el número MÁS ALTO, no con el más bajo.
--
--   · Que lo anterior se cerró y no se borró: un expediente calificado contra
--     una lista tiene que poder explicarse después.
--
--   · Que un ISO2 mal escrito hace fallar la carga.
--
--   · Que un país alcanzado por dos autoridades lo dice, en vez de un booleano.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org    uuid;
  v_n      int;
  v_txt    text;
  v_msg    text;
begin
  perform set_config('ikan.uid', '', true);
  select id into v_org from organizations where razon_social like 'Notar%Demo%' limit 1;

  -- ------------------------------------------------------------------
  -- 1. Los 15 y los 37, tal como los enumeran las páginas
  -- ------------------------------------------------------------------
  select count(*) into v_n from regimen_sancion where autoridad = 'onu' and leido_en = date '2026-09-01';
  insert into resultado values (1, 'Los quince comités del Consejo de Seguridad', '15', v_n::text, v_n = 15);
  select count(*) into v_n from regimen_sancion where autoridad = 'ofac' and leido_en = date '2026-09-01';
  insert into resultado values (2, 'Los treinta y siete programas de OFAC', '37', v_n::text, v_n = 37);

  -- ------------------------------------------------------------------
  -- 3. Veinticuatro territoriales y trece personales
  -- ------------------------------------------------------------------
  select count(*) into v_n from regimen_sancion
   where autoridad = 'ofac' and leido_en = date '2026-09-01' and clase = 'territorial';
  -- 23 y no 24 desde la Adenda 4: PAARSS se reclasificó como personal porque
  -- la OE 14312 revocó las sanciones amplias sobre Siria.
  insert into resultado values (3, 'Veintitrés territoriales', '23', v_n::text, v_n = 23);
  select count(*) into v_n from regimen_sancion
   where autoridad = 'ofac' and leido_en = date '2026-09-01' and clase = 'personal';
  insert into resultado values (4, 'Catorce personales', '14', v_n::text, v_n = 14);

  -- ------------------------------------------------------------------
  -- 5. NINGÚN programa personal produce país
  -- ------------------------------------------------------------------
  -- La comprobación que más importa. Si fallara, el sistema estaría marcando
  -- clientes por su nacionalidad con una lista que designa personas.
  select count(*) into v_n
    from regimen_pais rp join regimen_sancion r on r.id = rp.regimen_id
   where r.clase in ('personal', 'tematico');
  insert into resultado values (5, 'Ningún régimen personal ni temático produce país',
    '0', v_n::text, v_n = 0);

  -- Y el 1267 en concreto, que es el temático de la ONU.
  select count(*) into v_n
    from regimen_pais rp join regimen_sancion r on r.id = rp.regimen_id
   where r.autoridad = 'onu' and r.clave = '1267';
  insert into resultado values (6, 'El comité 1267 (ISIL y Al-Qaida) no alimenta la variable de país',
    '0', v_n::text, v_n = 0);

  -- Pero el 1988 (Talibán) SÍ, mapeado a Afganistán: es mixto a propósito.
  select count(*) into v_n
    from regimen_pais rp join regimen_sancion r on r.id = rp.regimen_id
   where r.autoridad = 'onu' and r.clave = '1988' and rp.iso2 = 'AF';
  insert into resultado values (7, 'El 1988 sí mapea a Afganistán, por mixto',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 8. El nivel no se invirtió
  -- ------------------------------------------------------------------
  -- La Adenda 3 llama «nivel 1» a la prohibición; country_risk_list llama 3 a
  -- lo peor. Cuba tiene que salir con 3, no con 1.
  select nivel into v_n from country_risk_list
   where organization_id = v_org and iso2 = 'CU' and fuente = 'ofac_sancionado'
     and vigente_hasta is null;
  insert into resultado values (8, 'Cuba, en prohibición, sale con el entero MÁS ALTO',
    '3', coalesce(v_n::text, '(sin fila)'), v_n = 3);

  select nivel into v_n from country_risk_list
   where organization_id = v_org and iso2 = 'VE' and fuente = 'ofac_sancionado'
     and vigente_hasta is null;
  insert into resultado values (9, 'Venezuela, en riesgo alto, sale con 2',
    '2', coalesce(v_n::text, '(sin fila)'), v_n = 2);

  -- ------------------------------------------------------------------
  -- 10. La unión, y no una de las dos
  -- ------------------------------------------------------------------
  select count(distinct iso2) into v_n from country_risk_list
   where organization_id = v_org and vigente_hasta is null
     and fuente in ('onu', 'ofac_sancionado', 'manual');
  -- 33 desde la Adenda 4. La derivación, para que el número no sea magia: 14 de
  -- la ONU más 30 de OFAC —23 territoriales, con las ocho de Balcanes y sin
  -- Siria— menos 12 que están en ambas, más Siria por el catálogo de atención.
  insert into resultado values (10, 'La unión de las fuentes, muy por encima de uno o de seis',
    '33', v_n::text, v_n = 33);

  -- ------------------------------------------------------------------
  -- 11. Un país bajo dos autoridades lo dice, no un booleano
  -- ------------------------------------------------------------------
  select count(distinct r.autoridad) into v_n
    from regimen_pais rp join regimen_sancion r on r.id = rp.regimen_id
   where rp.iso2 = 'IR' and r.leido_en = date '2026-09-01';
  insert into resultado values (11, 'Irán está alcanzado por la ONU Y por OFAC, y se puede ver',
    '2', v_n::text, v_n = 2);

  select notas into v_txt from country_risk_list
   where organization_id = v_org and iso2 = 'IR' and fuente = 'onu' and vigente_hasta is null;
  insert into resultado values (12, 'La fila dice QUÉ régimen la produjo',
    'la resolución 1737', coalesce(v_txt, '(nulo)'), v_txt like '%1737%');

  -- ------------------------------------------------------------------
  -- 13. Lo pendiente queda a la vista, no enterrado
  -- ------------------------------------------------------------------
  -- Antes reportaba Balkans-Related, que estaba cargado sin países porque no se
  -- sabía cuáles. La Adenda 4 los resolvió, así que ahora no debe quedar
  -- ninguno: un régimen territorial sin jurisdicción no marca a nadie.
  select count(*) into v_n from public.regimenes_sin_jurisdiccion();
  insert into resultado values (13, 'Ningún régimen territorial se quedó sin jurisdicción',
    '0', v_n::text, v_n = 0);

  select count(*) into v_n from public.paises_sancionados_sin_catalogo();
  insert into resultado values (14, 'Sudán del Sur, sancionado y sin clave en el catálogo UIF, se reporta',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 15. Volver a cargar no duplica
  -- ------------------------------------------------------------------
  select count(*) into v_n from regimen_sancion;
  perform public.cargar_regimenes_2026_09();
  insert into resultado values (15, 'Volver a cargar no añade regímenes',
    v_n::text, (select count(*)::text from regimen_sancion),
    v_n = (select count(*) from regimen_sancion));

  select count(*) into v_n from country_risk_list where organization_id = v_org;
  perform public.proyectar_sanciones_a_paises();
  insert into resultado values (16, 'Volver a proyectar no añade filas',
    v_n::text, (select count(*)::text from country_risk_list where organization_id = v_org),
    v_n = (select count(*) from country_risk_list where organization_id = v_org));

  -- ------------------------------------------------------------------
  -- 17. Un ISO2 mal escrito hace fallar la carga
  -- ------------------------------------------------------------------
  -- Sin esto, una fila con un código inventado existiría, no marcaría a nadie
  -- nunca, y el conteo saldría en verde.
  insert into regimen_pais (regimen_id, iso2)
  select id, 'XX' from regimen_sancion
   where autoridad = 'onu' and clave = '2713' and leido_en = date '2026-09-01';
  begin
    perform public.cargar_regimenes_2026_09();
    insert into resultado values (17, 'Un ISO2 fuera del catálogo hace fallar la carga',
      'excepción', 'no falló', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (17, 'Un ISO2 fuera del catálogo hace fallar la carga',
      'excepción', 'excepción', v_msg like '%XX%');
  end;
  delete from regimen_pais where iso2 = 'XX';

  -- ------------------------------------------------------------------
  -- 18. La cadena de bitácora sigue íntegra
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  insert into resultado values (18, 'Ninguna cadena rota', '0', v_n::text, v_n = 0);

exception when others then
  get stacked diagnostics v_msg = message_text;
  insert into resultado values (99, 'La prueba corrió sin errores',
    'sin errores', v_msg, false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
