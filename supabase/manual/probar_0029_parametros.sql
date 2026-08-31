-- =====================================================================
-- Pruebas de comportamiento de la 0029 · parámetros editables
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql, nunca contra
-- el remoto: inserta y borra parámetros.
--
-- Lo que de verdad se está probando no es que se pueda cargar la UMA nueva
-- —eso es lo fácil—, sino que cargarla NO cambie con qué cifra se juzga lo ya
-- registrado. Esa es la propiedad que la 0011 compró guardando la vigencia y
-- la que un `update` abierto se llevaba por delante.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_kawiil  uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_cliente uuid := 'bbbbbbbb-0000-0000-0000-000000000009';
  v_org     uuid := 'cccccccc-0000-0000-0000-000000000009';
  v_id_2026 uuid;
  v_id_2027 uuid;
  v_futuro  uuid;
  v_msg     text;
  v_n       int;
  v_val     numeric;
begin
  insert into auth.users (id, email) values (v_kawiil, 'kawiil-p@prueba.mx') on conflict do nothing;
  insert into platform_admin (user_id, nombre) values (v_kawiil, 'Kawiil') on conflict do nothing;
  insert into organizations (id, rfc, razon_social)
    values (v_org, 'PAR900101AB1', 'Org de prueba') on conflict do nothing;
  insert into auth.users (id, email) values (v_cliente, 'cliente-p@prueba.mx') on conflict do nothing;
  insert into user_profile (id, organization_id, nombre, email)
    values (v_cliente, v_org, 'Cliente', 'cliente-p@prueba.mx') on conflict do nothing;

  -- ------------------------------------------------------------------
  -- 1. Un cliente no fija parámetros. Un umbral de ley no se cambia desde
  --    la consola de un sujeto obligado.
  -- ------------------------------------------------------------------
  perform set_config('ikan.uid', v_cliente::text, false);
  begin
    set local role probador;
    perform public.fijar_parametro('UMA_PRUEBA','UMA de prueba', 1.00, 'mxn',
      current_date, 'DOF inventado por el cliente');
    reset role;
    insert into resultado values (1,'Un cliente NO fija parámetros','excepción','pasó',false);
  exception when others then
    reset role;
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (1,'Un cliente NO fija parámetros','excepción',
      left(v_msg,55), v_msg like '%administrador de plataforma%');
  end;

  perform set_config('ikan.uid', v_kawiil::text, false);

  -- ------------------------------------------------------------------
  -- 2. Sin fuente no se siembra. Estaba escrito en el esquema de la 0011;
  --    faltaba que algo lo hiciera cumplir.
  -- ------------------------------------------------------------------
  begin
    perform public.fijar_parametro('UMA_PRUEBA','UMA de prueba', 117.31, 'mxn',
      date '2026-02-01', '  ');
    insert into resultado values (2,'Sin fuente no se siembra','excepción','pasó',false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (2,'Sin fuente no se siembra','excepción',
      left(v_msg,55), v_msg like '%fuente%');
  end;

  -- ------------------------------------------------------------------
  -- 3. Se carga la de 2026
  -- ------------------------------------------------------------------
  v_id_2026 := public.fijar_parametro('UMA_PRUEBA','UMA de prueba', 117.31, 'mxn',
    date '2026-02-01', 'DOF 10/01/2026, INEGI');
  insert into resultado values (3,'Se carga un parámetro','1 fila',
    (select count(*)::text from parametro_regulatorio where codigo='UMA_PRUEBA'),
    (select count(*) from parametro_regulatorio where codigo='UMA_PRUEBA') = 1);

  -- ------------------------------------------------------------------
  -- 4. Se carga la de 2027 y la de 2026 se cierra SOLA. Sin esto, la
  --    restricción de no-traslape revienta con un error de PostgreSQL que no
  --    le dice nada a quien está cargando.
  -- ------------------------------------------------------------------
  v_id_2027 := public.fijar_parametro('UMA_PRUEBA','UMA de prueba', 122.50, 'mxn',
    date '2027-02-01', 'DOF 09/01/2027, INEGI');
  select vigente_hasta into v_msg from parametro_regulatorio where id = v_id_2026;
  insert into resultado values (4,'Cargar la nueva cierra la anterior','2027-02-01',
    coalesce(v_msg,'sigue abierta'), v_msg = '2027-02-01');

  -- ------------------------------------------------------------------
  -- 5. LA PRUEBA QUE IMPORTA. Un acto de 2026 se sigue juzgando con la cifra
  --    de 2026 aunque ya esté cargada la de 2027.
  -- ------------------------------------------------------------------
  select public.parametro_vigente('UMA_PRUEBA', date '2026-06-15') into v_val;
  insert into resultado values (5,'Un acto de 2026 usa la UMA de 2026','117.3100',
    v_val::text, v_val = 117.31);

  select public.parametro_vigente('UMA_PRUEBA', date '2027-06-15') into v_val;
  insert into resultado values (6,'Un acto de 2027 usa la UMA de 2027','122.5000',
    v_val::text, v_val = 122.50);

  -- ------------------------------------------------------------------
  -- 7. Cargar hacia atrás de lo vigente cambiaría con qué cifra se juzgó lo
  --    ya hecho. Se dice, no se deja pasar.
  -- ------------------------------------------------------------------
  begin
    perform public.fijar_parametro('UMA_PRUEBA','UMA de prueba', 99.00, 'mxn',
      date '2025-02-01', 'DOF viejo');
    insert into resultado values (7,'No se carga hacia atrás','excepción','pasó',false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (7,'No se carga hacia atrás','excepción',
      left(v_msg,55), v_msg like '%hacia atrás%');
  end;

  -- ------------------------------------------------------------------
  -- 8. Dos valores que empiezan el mismo día: se explica en vez de dejar que
  --    reviente la restricción de exclusión.
  -- ------------------------------------------------------------------
  begin
    perform public.fijar_parametro('UMA_PRUEBA','UMA de prueba', 130.00, 'mxn',
      date '2027-02-01', 'DOF 09/01/2027, INEGI');
    insert into resultado values (8,'Mismo día: mensaje humano','excepción','pasó',false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (8,'Mismo día: mensaje humano','excepción',
      left(v_msg,55), v_msg like '%Ya hay un valor%');
  end;

  -- ------------------------------------------------------------------
  -- 9. Corregir lo que TODAVÍA no rige sí se puede: el motor nunca calculó
  --    con ese número, así que no hay nada que reescribir.
  -- ------------------------------------------------------------------
  v_futuro := public.fijar_parametro('OTRO_PRUEBA','Otro', 10.00, 'mxn',
    current_date + 30, 'DOF de prueba para el futuro');
  perform public.confirmar_parametro(v_futuro, 'Kawiil-Cumplimiento');
  perform public.corregir_parametro(v_futuro, 12.50, 'DOF de prueba, fe de erratas',
    'Se cargó 10.00 por un dedazo; el DOF dice 12.50');
  select valor_numerico into v_val from parametro_regulatorio where id = v_futuro;
  insert into resultado values (9,'Se corrige lo que no ha entrado en vigor','12.5000',
    v_val::text, v_val = 12.50);

  -- ------------------------------------------------------------------
  -- 10. Y corregir el valor invalida la confirmación: lo que se validó fue el
  --     número viejo.
  -- ------------------------------------------------------------------
  select count(*) into v_n from parametro_regulatorio
   where id = v_futuro and confirmado_por is null;
  insert into resultado values (10,'Corregir invalida la confirmación','1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 11. Lo que YA rige no se corrige. Es la línea entre corregir y reescribir
  --     la historia: durante ese tiempo el motor sí usó ese número.
  -- ------------------------------------------------------------------
  begin
    perform public.corregir_parametro(v_id_2026, 999.00, 'DOF cualquiera',
      'Quiero cambiar el pasado y ya');
    insert into resultado values (11,'Lo que ya rige NO se corrige','excepción','pasó',false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (11,'Lo que ya rige NO se corrige','excepción',
      left(v_msg,55), v_msg like '%ya entró en vigor%');
  end;

  -- ------------------------------------------------------------------
  -- 12. Y por la puerta de atrás tampoco: la escritura directa está cerrada.
  --     Es la mitad del valor de esta migration — con `update` abierto, todo
  --     lo de arriba se salta escribiendo una línea de SQL.
  -- ------------------------------------------------------------------
  perform set_config('ikan.uid', v_kawiil::text, false);
  begin
    set local role probador;
    update parametro_regulatorio set valor_numerico = 999 where id = v_id_2026;
    reset role;
    insert into resultado values (12,'Ni Kawiil puede hacer update directo','excepción','pasó',false);
  exception when others then
    reset role;
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (12,'Ni Kawiil puede hacer update directo','excepción',
      left(v_msg,55), v_msg ilike '%permission denied%' or v_msg ilike '%denegado%');
  end;

  -- 13. Ni insert.
  begin
    set local role probador;
    insert into parametro_regulatorio (codigo,nombre,valor_numerico,unidad,vigente_desde,fuente)
      values ('COLADO','Colado',1,'mxn',current_date,'ninguna');
    reset role;
    insert into resultado values (13,'Ni insert directo','excepción','pasó',false);
  exception when others then
    reset role;
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (13,'Ni insert directo','excepción',
      left(v_msg,55), v_msg ilike '%permission denied%' or v_msg ilike '%denegado%');
  end;

  -- 14. Pero SIGUE pudiendo leer: es un catálogo regulatorio común y el motor
  --     de cada organización lo necesita.
  begin
    set local role probador;
    select count(*) into v_n from parametro_regulatorio where codigo='UMA_PRUEBA';
    reset role;
    insert into resultado values (14,'La lectura sigue abierta','2', v_n::text, v_n = 2);
  exception when others then
    reset role;
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (14,'La lectura sigue abierta','2', left(v_msg,40), false);
  end;

  -- ------------------------------------------------------------------
  -- 15. Todo quedó en la cadena de plataforma, que es la de lo que Kawiil hace
  --     y afecta a todas las organizaciones.
  -- ------------------------------------------------------------------
  -- EXACTAMENTE cinco: tres altas, una confirmación y una corrección. El
  -- número exacto prueba dos cosas de una vez —que lo que se hizo quedó
  -- escrito, y que lo que se RECHAZÓ no—. Con «5 o más» un sexto evento
  -- pasaría inadvertido, y un sexto evento significaría que un intento
  -- abortado dejó rastro de algo que nunca ocurrió.
  select count(*) into v_n from evento_auditoria
   where organization_id = '00000000-0000-0000-0000-000000000000'
     and tipo in ('parametro_fijado','parametro_corregido','parametro_confirmado');
  insert into resultado values (15,'Queda rastro de lo hecho y de nada más','5 exactos',
    v_n::text, v_n = 5);

  select count(*) into v_n
    from public.verificar_cadena('00000000-0000-0000-0000-000000000000');
  insert into resultado values (16,'La cadena de plataforma sigue íntegra','0 roturas',
    v_n::text, v_n = 0);

  -- 17. Ninguna función abierta a anon.
  v_n := 0;
  if has_function_privilege('anon','public.fijar_parametro(text,text,numeric,text,date,text,text,text,text,text)','execute') then v_n := v_n+1; end if;
  if has_function_privilege('anon','public.corregir_parametro(uuid,numeric,text,text)','execute') then v_n := v_n+1; end if;
  if has_function_privilege('anon','public.confirmar_parametro(uuid,text)','execute') then v_n := v_n+1; end if;
  insert into resultado values (17,'anon no puede llamarlas','0', v_n::text, v_n = 0);

  perform set_config('ikan.uid','',false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
