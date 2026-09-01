-- =====================================================================
-- Pruebas de comportamiento de la 0046 · efectivo declarado sin monto
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE, nunca contra el remoto: crea datos.
--
-- Lo que hay que demostrar es que el agujero está cerrado EN LA BASE, no en la
-- pantalla. La pantalla puede exigir lo que quiera; la tabla acepta escrituras
-- por API, importaciones y correcciones a mano, y ahí es donde el control tiene
-- que estar.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org  uuid := 'cccccccc-0000-0000-0000-000000000046';
  v_cli  uuid;
  v_msg  text;
  v_n    int;
begin
  insert into organizations (id, rfc, razon_social)
  values (v_org, 'EFE900101AB1', 'Notaría de prueba 0046')
    on conflict (id) do nothing;

  insert into client (organization_id, tipo_persona, nombre_razon_social)
  values (v_org, 'fisica', 'Compareciente 0046') returning id into v_cli;

  -- ------------------------------------------------------------------
  -- 1. El caso del hallazgo: efectivo declarado, monto ausente
  -- ------------------------------------------------------------------
  -- Antes se registraba sin error, sin bloqueo y sin marca.
  begin
    insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                           contraparte, forma_pago, efectivo_mxn)
    values (v_org, v_cli, 'otro', 10000000, now(),
            '{"tipo_acto":"transmision_inmueble"}'::jsonb, 'efectivo', null);
    insert into resultado values (1, 'Efectivo sin monto: se rechaza',
      'rechazado', 'SE ACEPTÓ', false);
  exception when others then
    insert into resultado values (1, 'Efectivo sin monto: se rechaza',
      'rechazado', 'rechazado', true);
  end;

  -- ------------------------------------------------------------------
  -- 2. Mixto sin monto, igual
  -- ------------------------------------------------------------------
  begin
    insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                           contraparte, forma_pago, efectivo_mxn)
    values (v_org, v_cli, 'otro', 500000, now(),
            '{"tipo_acto":"transmision_inmueble"}'::jsonb, 'mixto', null);
    insert into resultado values (2, 'Mixto sin monto: se rechaza',
      'rechazado', 'SE ACEPTÓ', false);
  exception when others then
    insert into resultado values (2, 'Mixto sin monto: se rechaza',
      'rechazado', 'rechazado', true);
  end;

  -- ------------------------------------------------------------------
  -- 3. Efectivo con monto CERO tampoco: es una contradicción
  -- ------------------------------------------------------------------
  begin
    insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                           contraparte, forma_pago, efectivo_mxn)
    values (v_org, v_cli, 'otro', 500000, now(),
            '{"tipo_acto":"transmision_inmueble"}'::jsonb, 'efectivo', 0);
    insert into resultado values (3, 'Efectivo con monto cero: se rechaza',
      'rechazado', 'SE ACEPTÓ', false);
  exception when others then
    insert into resultado values (3, 'Efectivo con monto cero: se rechaza',
      'rechazado', 'rechazado', true);
  end;

  -- ------------------------------------------------------------------
  -- 4. Bancarizado sin monto sí se registra: no hay efectivo que declarar
  -- ------------------------------------------------------------------
  insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                         contraparte, forma_pago, efectivo_mxn)
  values (v_org, v_cli, 'otro', 10000000, now(),
          '{"tipo_acto":"transmision_inmueble"}'::jsonb, 'bancarizado', null);
  insert into resultado values (4, 'Bancarizado sin monto: se registra',
    'se registró', 'se registró', true);

  -- ------------------------------------------------------------------
  -- 5. Efectivo con monto por DEBAJO del límite: se registra
  -- ------------------------------------------------------------------
  insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                         contraparte, forma_pago, efectivo_mxn)
  values (v_org, v_cli, 'otro', 200000, now(),
          '{"tipo_acto":"transmision_inmueble"}'::jsonb, 'efectivo', 100000);
  insert into resultado values (5, 'Efectivo bajo el límite: se registra',
    'se registró', 'se registró', true);

  -- ------------------------------------------------------------------
  -- 6. Efectivo POR ENCIMA del límite del art. 32: sigue bloqueando
  -- ------------------------------------------------------------------
  -- Que el arreglo de arriba no haya roto el candado que ya existía.
  begin
    insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                           contraparte, forma_pago, efectivo_mxn)
    values (v_org, v_cli, 'otro', 10000000, now(),
            '{"tipo_acto":"transmision_inmueble"}'::jsonb, 'efectivo', 9000000);
    insert into resultado values (6, 'Efectivo sobre el límite: se bloquea',
      'bloqueado', 'SE ACEPTÓ', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (6, 'Efectivo sobre el límite: se bloquea',
      'bloqueado', case when v_msg like '%artículo 32%' then 'bloqueado por art. 32'
                        else 'bloqueado: ' || left(v_msg, 40) end,
      v_msg like '%artículo 32%');
  end;

  -- ------------------------------------------------------------------
  -- 7. Un acto que NO cae en la prohibición se registra con efectivo alto
  -- ------------------------------------------------------------------
  -- El art. 32 nombra dos supuestos. Extenderlo por analogía sería inventar
  -- una prohibición sancionable que la ley no escribió.
  insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                         contraparte, forma_pago, efectivo_mxn)
  values (v_org, v_cli, 'otro', 10000000, now(),
          '{"tipo_acto":"otorgamiento_poder"}'::jsonb, 'efectivo', 9000000);
  insert into resultado values (7, 'Acto fuera del art. 32: se registra',
    'se registró', 'se registró', true);

  -- ------------------------------------------------------------------
  -- 8. La cadena de bitácora sigue íntegra
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  insert into resultado values (8, 'Ninguna cadena rota', '0', v_n::text, v_n = 0);

exception when others then
  get stacked diagnostics v_msg = message_text;
  insert into resultado values (99, 'La prueba corrió sin errores',
    'sin errores', v_msg, false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
