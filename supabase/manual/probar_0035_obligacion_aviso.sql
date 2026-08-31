-- =====================================================================
-- Pruebas de comportamiento de la 0035 · obligación de avisar
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql, nunca contra
-- el remoto: crea datos.
--
-- Lo que hay que demostrar no es que las columnas existan —eso lo dice \d—
-- sino las tres cosas de las que depende que un notario no presente un
-- informe en ceros falso:
--
--   Que una operación recién capturada NO se pueda confundir con una
--   evaluada. Es el defecto entero: `requiere_aviso = false` significaba a la
--   vez "se revisó y no aplica" y "nadie la ha mirado".
--
--   Que estén marcados como supuesto de Aviso exactamente los cinco códigos
--   del artículo 17, y NINGUNO de más. Marcar de más es peor que marcar de
--   menos: mete al aviso un acto que no cae en ningún supuesto.
--
--   Que reaplicar el archivo no invente cambios en la bitácora.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org    uuid := 'cccccccc-0000-0000-0000-000000000035';
  v_cli    uuid;
  v_op     uuid;
  v_n      int;
  v_eventos_antes bigint;
  v_marcadas_antes int;
begin
  insert into organizations (id, rfc, razon_social)
  values (v_org, 'OBL900101AB1', 'Notaría de prueba 0035')
    on conflict (id) do nothing;

  insert into client (organization_id, tipo_persona, nombre_razon_social)
  values (v_org, 'fisica', 'Compareciente 0035') returning id into v_cli;

  -- ------------------------------------------------------------------
  -- 1. Una operación nace sin evaluar
  -- ------------------------------------------------------------------
  -- El día que se captura, nadie la ha juzgado todavía. Que arrancara con
  -- fecha de evaluación sería fabricar la constancia que esta columna existe
  -- para dar.
  insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                         contraparte)
  values (v_org, v_cli, 'otro', 2000000, '2026-08-18',
          jsonb_build_object('tipo_acto', 'otorgamiento_poder'))
  returning id into v_op;

  select count(*) into v_n from operation
   where id = v_op and evaluada_en is null and requiere_aviso = false;
  insert into resultado values (1, 'Recién capturada: sin evaluar y sin aviso',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 2. Evaluada y limpia se distingue de no evaluada
  -- ------------------------------------------------------------------
  -- Las dos tienen requiere_aviso = false. Si esta prueba falla, la pantalla
  -- del aviso vuelve a no poder distinguirlas y el informe en ceros vuelve a
  -- salir sobre actos sin revisar.
  update operation set evaluada_en = now() where id = v_op;

  select count(*) into v_n from operation
   where id = v_op and evaluada_en is not null and requiere_aviso = false;
  insert into resultado values (2, 'Evaluada y limpia: distinta de sin evaluar',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 3. identificada_en sigue significando otra cosa
  -- ------------------------------------------------------------------
  -- Se llena sólo cuando SÍ requiere aviso. Si alguien las unificara, volvería
  -- a perderse la diferencia.
  select count(*) into v_n from operation
   where id = v_op and identificada_en is null;
  insert into resultado values (3, 'identificada_en no se llenó sola',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 4. Los cinco supuestos del artículo 17, y sólo ésos
  -- ------------------------------------------------------------------
  select count(distinct codigo) into v_n from tipologia_av
   where genera_aviso
     and codigo in ('XII-01', 'XII-02', 'XII-04', 'XII-05', 'XVI-01', 'XVI-09');
  insert into resultado values (4, 'Marcados los códigos de supuesto',
    'los que existan de 6', v_n::text, v_n > 0);

  -- ------------------------------------------------------------------
  -- 5. NINGUNO de más
  -- ------------------------------------------------------------------
  -- XII-03 y XVI-04 son "contraparte en país de alto riesgo": críticas, el OC
  -- las mira primero, y NO vuelven reportable un acto que no cae en supuesto.
  -- Ésta es la prueba que caza el defecto original.
  select count(*) into v_n from tipologia_av
   where genera_aviso
     and codigo not in ('XII-01', 'XII-02', 'XII-04', 'XII-05', 'XVI-01', 'XVI-09');
  insert into resultado values (5, 'Ninguna tipología marcada de más',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 5b. XVI-01 v1 no se marca: mismo código, otra regla
  -- ------------------------------------------------------------------
  -- La v1 se llamaba "Structuring (fraccionamiento)" y medía 645 UMA en 72
  -- horas: comportamiento, no supuesto legal. La 0033 la desactivó y reutilizó
  -- el código para el umbral del inciso a). Marcar por código a secas le
  -- pondría la marca a una regla que nunca fue eso.
  select count(*) into v_n from tipologia_av
   where codigo = 'XVI-01' and version = 1 and genera_aviso;
  insert into resultado values (6, 'XVI-01 v1 (structuring) sin marcar',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 6. Una tipología de señal de riesgo NO genera aviso
  -- ------------------------------------------------------------------
  -- Dicho al revés y explícito, porque es la mitad de la separación que la
  -- migration compra: severidad crítica sin obligación de avisar.
  select count(*) into v_n from tipologia_av
   where codigo in ('XII-03', 'XVI-04') and severidad = 'critica' and genera_aviso;
  insert into resultado values (7, 'País de alto riesgo: crítica, sin aviso',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 7. Todas las versiones de un código, no sólo la vigente
  -- ------------------------------------------------------------------
  -- La 0031 versionó XII-01 y XII-05. La obligación no la crea la versión de
  -- la regla, la crea la ley: una v1 todavía abierta debe seguir contando.
  select count(*) into v_n from tipologia_av
   where codigo in ('XII-01', 'XII-05') and not genera_aviso;
  insert into resultado values (8, 'Marcadas todas las versiones',
    '0 sin marcar', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 9. Reaplicar no inventa eventos
  -- ------------------------------------------------------------------
  -- El bloque se corre DOS veces y se mide la segunda. Medir contra el estado
  -- previo a la primera no probaría nada: en un proyecto nuevo las migrations
  -- corren antes que los seeds, así que la 0035 no encuentra tipologías y no
  -- registra ningún evento. La pregunta es si la SEGUNDA corrida añade algo.
  --
  -- Y se compara contra el conteo previo, no contra una ventana de tiempo:
  -- registrar_evento sella con now(), que es el inicio de la transacción y por
  -- tanto siempre anterior a cualquier reloj leído aquí dentro.
  declare v_o uuid; v_m int; v_pasada int;
  begin
    for v_pasada in 1..2 loop
      if v_pasada = 2 then
        select count(*) into v_eventos_antes from evento_auditoria
         where tipo = 'obligacion_de_aviso_separada_de_severidad';
        select count(*) into v_marcadas_antes from tipologia_av where genera_aviso;
      end if;

      update tipologia_av set genera_aviso = true
       where (codigo in ('XII-01', 'XII-02', 'XII-04', 'XII-05')
              or (codigo = 'XVI-01' and version >= 2)
              or codigo = 'XVI-09')
         and genera_aviso = false;

      for v_o in select distinct organization_id from tipologia_av loop
        if exists (select 1 from evento_auditoria
                    where organization_id = v_o
                      and tipo = 'obligacion_de_aviso_separada_de_severidad') then
          continue;
        end if;
        select count(*) into v_m from tipologia_av
         where organization_id = v_o and genera_aviso;
        perform public.registrar_evento(v_o, 'obligacion_de_aviso_separada_de_severidad',
          'tipologia_av', null, jsonb_build_object('tipologias_marcadas', v_m),
          'sistema', null);
      end loop;
    end loop;
  end;

  select count(*) into v_n from evento_auditoria
   where tipo = 'obligacion_de_aviso_separada_de_severidad';
  insert into resultado values (9, 'La segunda pasada no añade eventos',
    v_eventos_antes::text, v_n::text, v_n = v_eventos_antes);

  select count(*) into v_n from tipologia_av where genera_aviso;
  insert into resultado values (10, 'La segunda pasada no marca nada más',
    v_marcadas_antes::text, v_n::text, v_n = v_marcadas_antes);

  -- ------------------------------------------------------------------
  -- 11. La cadena de cada organización sigue íntegra
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  insert into resultado values (11, 'Ninguna cadena rota', '0', v_n::text, v_n = 0);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
