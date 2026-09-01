-- =====================================================================
-- Pruebas de comportamiento de la 0039 · candado del artículo 32
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql, nunca contra
-- el remoto: crea datos.
--
-- Lo que hay que demostrar es que el candado IMPIDE, no que califica. Todas las
-- demás variables de la matriz suman puntos; ésta detiene la operación, porque
-- el artículo 32 no es un factor de riesgo sino una prohibición cuya omisión se
-- sanciona con un porcentaje sobre el valor del acto.
--
-- Y que vive en la base: una validación que sólo existiera en la pantalla la
-- saltaría cualquiera con la API, y aquí lo que se saltaría es la ley.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org uuid := 'cccccccc-0000-0000-0000-000000000039';
  v_cli uuid;
  v_op  uuid;
  v_n   int;
  v_msg text;
  v_uma numeric;
  v_limite_inmueble numeric;
  v_limite_acciones numeric;
begin
  insert into organizations (id, rfc, razon_social)
  values (v_org, 'ART900101AB1', 'Notaría de prueba 0039')
    on conflict (id) do nothing;

  insert into client (organization_id, tipo_persona, nombre_razon_social)
  values (v_org, 'fisica', 'Compareciente 0039') returning id into v_cli;

  select valor_numerico into v_uma from parametro_regulatorio
   where codigo = 'uma_diaria' and vigente_hasta is null;
  v_limite_inmueble := 8025 * v_uma;
  v_limite_acciones := 3210 * v_uma;

  -- ------------------------------------------------------------------
  -- 1. Efectivo por debajo del límite: pasa
  -- ------------------------------------------------------------------
  insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                         contraparte, forma_pago, efectivo_mxn)
  values (v_org, v_cli, 'otro', v_limite_inmueble * 2, current_date,
          '{"tipo_acto":"transmision_inmueble"}'::jsonb, 'mixto', v_limite_inmueble - 1000)
  returning id into v_op;
  insert into resultado values (1, 'Efectivo bajo el límite: se registra',
    'se registró', 'se registró', true);

  -- ------------------------------------------------------------------
  -- 2. Efectivo AL límite: se impide
  -- ------------------------------------------------------------------
  -- El artículo dice «a partir de», no «por encima de».
  begin
    insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                           contraparte, forma_pago, efectivo_mxn)
    values (v_org, v_cli, 'otro', v_limite_inmueble * 2, current_date,
            '{"tipo_acto":"transmision_inmueble"}'::jsonb, 'efectivo', v_limite_inmueble);
    insert into resultado values (2, 'Efectivo AL límite: se impide',
      'excepción', 'se registró', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (2, 'Efectivo AL límite: se impide',
      'excepción', left(v_msg, 40), v_msg like '%artículo 32%');
  end;

  -- ------------------------------------------------------------------
  -- 3. Cada supuesto con SU límite
  -- ------------------------------------------------------------------
  -- Lo que en un inmueble pasa, en acciones se impide: el límite es más bajo.
  begin
    insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                           contraparte, forma_pago, efectivo_mxn)
    values (v_org, v_cli, 'otro', v_limite_inmueble, current_date,
            '{"tipo_acto":"compra_venta_acciones"}'::jsonb, 'efectivo', v_limite_acciones);
    insert into resultado values (3, 'Acciones: límite propio, más bajo',
      'excepción', 'se registró', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (3, 'Acciones: límite propio, más bajo',
      'excepción', 'impedido', v_msg like '%artículo 32%');
  end;

  -- ------------------------------------------------------------------
  -- 4. Un acto fuera de los dos supuestos NO se impide
  -- ------------------------------------------------------------------
  -- Extender la prohibición por analogía sería inventar un supuesto
  -- sancionable que la ley no escribió.
  insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                         contraparte, forma_pago, efectivo_mxn)
  values (v_org, v_cli, 'otro', v_limite_inmueble * 10, current_date,
          '{"tipo_acto":"constitucion_personas_morales"}'::jsonb, 'efectivo',
          v_limite_inmueble * 5);
  insert into resultado values (4, 'Acto fuera del supuesto: no se impide',
    'se registró', 'se registró', true);

  -- ------------------------------------------------------------------
  -- 5. El candado también actúa al ACTUALIZAR
  -- ------------------------------------------------------------------
  -- Sin esto se registraría el acto con cero efectivo y se corregiría después.
  begin
    update operation set efectivo_mxn = v_limite_inmueble, forma_pago = 'efectivo'
     where id = v_op;
    insert into resultado values (5, 'También al actualizar', 'excepción', 'se actualizó', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (5, 'También al actualizar', 'excepción', 'impedido',
      v_msg like '%artículo 32%');
  end;

  -- ------------------------------------------------------------------
  -- 6. Bancarizado con efectivo encima es una contradicción
  -- ------------------------------------------------------------------
  -- Dejarla pasar haría que la matriz clasificara con un dato y la prohibición
  -- se midiera con otro.
  begin
    insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                           contraparte, forma_pago, efectivo_mxn)
    values (v_org, v_cli, 'otro', 1000000, current_date,
            '{"tipo_acto":"otorgamiento_poder"}'::jsonb, 'bancarizado', 50000);
    insert into resultado values (6, 'Bancarizado con efectivo: se rechaza',
      'excepción', 'se registró', false);
  exception when check_violation then
    insert into resultado values (6, 'Bancarizado con efectivo: se rechaza',
      'excepción', 'rechazada', true);
  end;

  -- ------------------------------------------------------------------
  -- 7. El efectivo no puede exceder el valor del acto
  -- ------------------------------------------------------------------
  begin
    insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                           contraparte, forma_pago, efectivo_mxn)
    values (v_org, v_cli, 'otro', 100000, current_date,
            '{"tipo_acto":"otorgamiento_poder"}'::jsonb, 'efectivo', 200000);
    insert into resultado values (7, 'Efectivo mayor que el acto: se rechaza',
      'excepción', 'se registró', false);
  exception when check_violation then
    insert into resultado values (7, 'Efectivo mayor que el acto: se rechaza',
      'excepción', 'rechazada', true);
  end;

  -- ------------------------------------------------------------------
  -- 8. Sin efectivo declarado nada se impide
  -- ------------------------------------------------------------------
  insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                         contraparte, forma_pago)
  values (v_org, v_cli, 'otro', v_limite_inmueble * 5, current_date,
          '{"tipo_acto":"transmision_inmueble"}'::jsonb, 'bancarizado');
  insert into resultado values (8, 'Sin efectivo: se registra',
    'se registró', 'se registró', true);

  -- ------------------------------------------------------------------
  -- 9. La cadena sigue íntegra
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  insert into resultado values (9, 'Ninguna cadena rota', '0', v_n::text, v_n = 0);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
