-- =====================================================================
-- Pruebas de comportamiento de la 0056 · excepción del beneficiario controlador
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql.
--
-- Lo que hay que demostrar:
--
--   · Que la excepción por ANEXO ya no se admite. Era un clic que eximía de
--     identificar al beneficiario controlador sin ningún catálogo detrás que
--     comprobar, resuelto a criterio de quien captura.
--
--   · Que la de bolsa NO es automática por cotizar: sin clave de pizarra el
--     artículo no exime, y el check lo impone en vez de confiar en la pantalla.
--
--   · Que retirar la excepción borra la clave. Una clave huérfana se leería la
--     próxima vez como si la excepción siguiera fundada.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_cli  uuid;
  v_org  uuid;
  v_txt  text;
  v_msg  text;
begin
  perform set_config('ikan.uid', '', true);
  select id into v_org from organizations where es_referencia and 'XII' = any(sectores) limit 1;

  insert into client (organization_id, tipo_persona, nombre_razon_social)
  values (v_org, 'moral', 'Emisora de prueba, S.A.B. de C.V.')
  returning id into v_cli;

  -- ------------------------------------------------------------------
  -- 1. La rama por anexo está cerrada
  -- ------------------------------------------------------------------
  begin
    update client set bc_exencion = 'anexo_regla' where id = v_cli;
    insert into resultado values (1, 'La excepción por anexo se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (1, 'La excepción por anexo se rechaza',
      'excepción', 'excepción', true);
  end;

  -- ------------------------------------------------------------------
  -- 2. Bolsa SIN clave de pizarra tampoco
  -- ------------------------------------------------------------------
  -- Es la mitad que más fácil se olvida: la excepción no es automática por
  -- cotizar, el texto la condiciona a que el cliente proporcione la clave.
  begin
    update client set bc_exencion = 'bolsa_de_valores', clave_pizarra = null where id = v_cli;
    insert into resultado values (2, 'Bolsa sin clave de pizarra se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (2, 'Bolsa sin clave de pizarra se rechaza',
      'excepción', 'excepción', true);
  end;

  -- Y una clave en blanco no cuenta como clave.
  begin
    update client set bc_exencion = 'bolsa_de_valores', clave_pizarra = '   ' where id = v_cli;
    insert into resultado values (3, 'Una clave en blanco no cuenta como clave',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (3, 'Una clave en blanco no cuenta como clave',
      'excepción', 'excepción', true);
  end;

  -- ------------------------------------------------------------------
  -- 4. Con clave, sí
  -- ------------------------------------------------------------------
  update client set bc_exencion = 'bolsa_de_valores', clave_pizarra = 'PRUEBA' where id = v_cli;
  insert into resultado values (4, 'Con clave de pizarra, la excepción aplica',
    'true', public.bc_exento(v_cli)::text, public.bc_exento(v_cli) = true);

  -- ------------------------------------------------------------------
  -- 5. Sin excepción declarada, no está exento
  -- ------------------------------------------------------------------
  update client set bc_exencion = null, clave_pizarra = null where id = v_cli;
  insert into resultado values (5, 'Sin excepción declarada no está exento',
    'false', public.bc_exento(v_cli)::text, public.bc_exento(v_cli) = false);

  -- ------------------------------------------------------------------
  -- 6. Una clave huérfana no exime por sí sola
  -- ------------------------------------------------------------------
  -- El caso que importa: alguien retira la excepción y la clave se queda. Si
  -- `bc_exento` mirara sólo la clave, el expediente seguiría pareciendo exento.
  update client set clave_pizarra = 'HUERFANA' where id = v_cli;
  insert into resultado values (6, 'Una clave sin excepción declarada no exime',
    'false', public.bc_exento(v_cli)::text, public.bc_exento(v_cli) = false);

  -- ------------------------------------------------------------------
  -- 7. Y la regla vive en un solo sitio
  -- ------------------------------------------------------------------
  select count(*)::text into v_txt from pg_proc where proname = 'bc_exento';
  insert into resultado values (7, 'La regla de exención está en una función, no repartida',
    '1', v_txt, v_txt = '1');

  delete from client where id = v_cli;

exception when others then
  get stacked diagnostics v_msg = message_text;
  insert into resultado values (99, 'La prueba corrió sin errores',
    'sin errores', v_msg, false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
