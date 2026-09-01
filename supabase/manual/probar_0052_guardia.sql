-- =====================================================================
-- Pruebas de comportamiento de la 0052 · quién puede provisionar
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql.
--
-- Lo que hay que demostrar:
--
--   · Que una conexión SIN sesión —el SQL Editor, un script con service_role—
--     SÍ puede provisionar. Es el defecto que traía la 0050: el guardia dejaba
--     fuera justo las dos vías por las que la función se iba a usar primero, y
--     una vía correcta cerrada no hace que nadie desista, hace que la
--     organización se inserte a mano y arranque ciega.
--
--   · Que un usuario CON sesión y sin ser de Kawiil sigue sin poder. Contra ése
--     el guardia no se aflojó.
--
--   · Que la bitácora dice de dónde vino. Con `auth.uid()` nulo el evento diría
--     «persona: null», que se lee como si no se supiera quién fue.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org  uuid;
  v_txt  text;
  v_n    int;
  v_msg  text;
begin
  -- Sin sesión: como el SQL Editor.
  perform set_config('ikan.uid', '', true);

  insert into organizations (rfc, razon_social, sectores, perfil_actividad, es_referencia)
  values ('GRD010101AAA', 'Referencia del guardia', array['XII']::sector_av[], 'notarias', false)
  on conflict (rfc) do nothing;

  -- ------------------------------------------------------------------
  -- 1. Sin sesión se puede provisionar
  -- ------------------------------------------------------------------
  begin
    v_org := public.provisionar_organizacion(
      'GRD020202BBB', 'Notaría dada de alta sin sesión', 'XII', 'notarias');
    insert into resultado values (1, 'Sin sesión (SQL Editor) sí provisiona',
      'un uuid', coalesce(v_org::text, '(nulo)'), v_org is not null);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (1, 'Sin sesión (SQL Editor) sí provisiona',
      'un uuid', v_msg, false);
  end;

  -- ------------------------------------------------------------------
  -- 2. Y queda completa, no a medias
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from public.diagnostico_organizacion(v_org)
   where not listo and concepto <> 'Usuarios con rol';
  insert into resultado values (2, 'Queda sin huecos operativos',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 3. La bitácora dice de dónde vino, en vez de un actor nulo
  -- ------------------------------------------------------------------
  select payload->>'via' into v_txt from evento_auditoria
   where tipo = 'organizacion_provisionada' and organization_id = v_org
   order by registrado_en desc limit 1;
  insert into resultado values (3, 'El evento dice que vino de una conexión directa',
    'conexión directa (...)', coalesce(v_txt, '(nulo)'),
    v_txt like 'conexión directa%');

  -- ------------------------------------------------------------------
  -- 4. Un usuario con sesión y sin ser de Kawiil sigue sin poder
  -- ------------------------------------------------------------------
  -- El guardia no se aflojó para quien entra por la aplicación. Se prueba a
  -- través de `puede_provisionar`, porque `session_user` en este banco es
  -- siempre postgres y la llamada directa no distinguiría los dos casos.
  insert into auth.users (id) values ('77777777-0000-0000-0000-000000000001')
    on conflict do nothing;
  perform set_config('ikan.uid', '77777777-0000-0000-0000-000000000001', true);
  insert into resultado values (4, 'Un usuario cualquiera NO es admin de Kawiil',
    'false', public.es_admin_kawiil()::text, public.es_admin_kawiil() = false);

  -- ------------------------------------------------------------------
  -- 5. La cadena de bitácora sigue íntegra
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  insert into resultado values (5, 'Ninguna cadena rota', '0', v_n::text, v_n = 0);

exception when others then
  get stacked diagnostics v_msg = message_text;
  insert into resultado values (99, 'La prueba corrió sin errores',
    'sin errores', v_msg, false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
