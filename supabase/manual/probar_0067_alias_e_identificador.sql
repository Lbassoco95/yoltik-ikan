-- =====================================================================
-- Pruebas de comportamiento · Migration 0067
-- =====================================================================
-- La prueba 1 es la que sostiene el diseño: si alguien hiciera que la
-- resolución de identidad mirara alias, dos entidades distintas que comparten
-- un a.k.a. se fusionarían. Con 33,495 alias en los archivos reales, eso pasa.
-- =====================================================================

\set ON_ERROR_STOP on
\pset pager off

do $probar$
declare
  v_ofac uuid;
  v_onu uuid;
  v_sat uuid;
  v_carga uuid;
  v_carga2 uuid;
  v_n int;
  v_txt text;
  v_como text;
begin
  select id into v_ofac from lista_fuente where codigo = 'ofac_sdn';
  select id into v_onu  from lista_fuente where codigo = 'onu_consolidada';
  select id into v_sat  from lista_fuente where codigo = 'sat_69b';

  -- -------------------------------------------------------------------
  -- Poner operativas las fuentes de esta prueba, a propósito y a la vista
  -- -------------------------------------------------------------------
  -- Desde la 0073 el barrido sólo consulta fuentes OPERATIVAS, y hoy ninguna
  -- lo es: la compuerta del corroborante (instrucciones 327 a 330) no existe
  -- todavía y la 298 lo impide. Sin esto, `coincidencias_en_listas` devuelve
  -- cero siempre y estas catorce pruebas pasarían a no comprobar nada — que es
  -- peor que fallar, porque no se nota.
  --
  -- Se desactiva el candado con el trigger nombrado, y se restaura al final.
  -- No es un atajo que la aplicación pueda tomar: `disable trigger` exige ser
  -- dueño de la tabla y el rol con que corre la app no lo es. Si alguien copia
  -- estas dos líneas a código de producto, no van a funcionar, y así debe ser.
  alter table lista_fuente disable trigger fuente_operativa_exige_cotejo;
  update lista_fuente set modo_operacion = 'operativa'
   where codigo in ('ofac_sdn', 'onu_consolidada', 'sat_69b');

  insert into lista_carga (fuente_id, tipo, estado, alcance, fecha_publicacion_fuente)
  values (v_ofac, 'archivo', 'aplicada', 'completa', '2026-07-27')
  returning id into v_carga;

  -- -------------------------------------------------------------------
  -- 1. Dos entidades que COMPARTEN UN ALIAS no se fusionan
  -- -------------------------------------------------------------------
  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, identificador_fuente, nombres_alternos)
  values
    (v_carga, 'alta', 'empresa', 'PRIMERA SA', '1001', array['COMERCIAL DEL NORTE']),
    (v_carga, 'alta', 'empresa', 'SEGUNDA SA', '1002', array['COMERCIAL DEL NORTE']);

  select count(*) into v_n from lista_registro where fuente_id = v_ofac;
  if v_n <> 2 then
    raise exception
      'PRUEBA 1 FALLA: dos entidades con el mismo alias se fusionaron en %. La resolución de '
      'identidad NO debe mirar alias.', v_n;
  end if;
  raise notice 'PRUEBA  1 OK · dos entidades con el mismo alias siguen siendo dos';

  -- -------------------------------------------------------------------
  -- 2. El identificador de fuente manda sobre el nombre
  -- -------------------------------------------------------------------
  -- Una republicación puede traer el nombre con otra grafía. Si se resolviera
  -- por nombre, crearía un registro nuevo y el viejo quedaría vivo y obsoleto.
  --
  -- Va en una carga NUEVA porque eso es una republicación. Dentro de la misma
  -- carga manda el no-retroceso de la 0065, que para una fuente sin fecha de
  -- situación escala el caso: un identificador repetido en UN archivo de OFAC
  -- no es una corrección, es un archivo mal formado.
  insert into lista_carga (fuente_id, tipo, estado, alcance, fecha_publicacion_fuente)
  values (v_ofac, 'archivo', 'aplicada', 'completa', '2026-08-27')
  returning id into v_carga2;

  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, identificador_fuente, nombres_alternos)
  values (v_carga2, 'alta', 'empresa', 'PRIMERA, S.A. DE C.V.', '1001', array['PRIMERA SA']);

  select count(*) into v_n from lista_registro where fuente_id = v_ofac;
  if v_n <> 2 then
    raise exception
      'PRUEBA 2 FALLA: el cambio de grafía creó un registro nuevo. Quedaron %.', v_n;
  end if;
  select nombre into v_txt from lista_registro
   where fuente_id = v_ofac and identificador_fuente = '1001';
  if v_txt <> 'PRIMERA, S.A. DE C.V.' then
    raise exception 'PRUEBA 2 FALLA: no se actualizó el nombre. Quedó "%".', v_txt;
  end if;
  raise notice 'PRUEBA  2 OK · el identificador resuelve aunque cambie la grafía del nombre';

  -- -------------------------------------------------------------------
  -- 3. Los alias se reemplazan, no se acumulan
  -- -------------------------------------------------------------------
  -- La fuente republica su estado completo: un alias que ya no viene es un
  -- alias que la autoridad retiró.
  select array_length(nombres_alternos, 1) into v_n from lista_registro
   where fuente_id = v_ofac and identificador_fuente = '1001';
  if v_n <> 1 then
    raise exception 'PRUEBA 3 FALLA: los alias se acumularon; hay %.', v_n;
  end if;
  raise notice 'PRUEBA  3 OK · los alias se reemplazan con la republicación';

  -- -------------------------------------------------------------------
  -- 4. El barrido SÍ encuentra por alias
  -- -------------------------------------------------------------------
  -- Sólo queda una: la republicación de la prueba 2 reemplazó los alias de
  -- 1001, así que ya no lleva «COMERCIAL DEL NORTE». Eso es lo correcto —un
  -- alias que la fuente retiró deja de cotejar— y aquí se comprueba la
  -- consecuencia, no sólo la causa.
  select count(*) into v_n from public.coincidencias_en_listas('COMERCIAL DEL NORTE');
  if v_n <> 1 then
    raise exception
      'PRUEBA 4 FALLA: sólo 1002 conserva ese alias, así que esperaba 1 y hubo %.', v_n;
  end if;
  select nombre, coincide_por into v_txt, v_como
    from public.coincidencias_en_listas('COMERCIAL DEL NORTE') limit 1;
  if v_txt <> 'SEGUNDA SA' then
    raise exception 'PRUEBA 4 FALLA: la que conserva el alias es SEGUNDA SA, y salió "%".', v_txt;
  end if;
  if v_como <> 'alias' then
    raise exception 'PRUEBA 4 FALLA: debía decir que coincidió por alias, y dijo "%".', v_como;
  end if;
  raise notice 'PRUEBA  4 OK · el barrido encuentra por alias, lo dice, y respeta el retiro';

  -- -------------------------------------------------------------------
  -- 5. El barrido normaliza: acentos, puntuación y mayúsculas
  -- -------------------------------------------------------------------
  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, identificador_fuente, nombres_alternos)
  values (v_carga2, 'alta', 'persona', 'MUÑOZ HERNÁNDEZ, José', '1003',
          array['MUNOZ HERNANDEZ Jose Luis']);

  if (select count(*) from public.coincidencias_en_listas('muñoz hernandez, jose')) = 0 then
    raise exception 'PRUEBA 5 FALLA: el cotejo debe ignorar acentos, puntuación y mayúsculas.';
  end if;
  raise notice 'PRUEBA  5 OK · el cotejo normaliza acentos y puntuación';

  -- -------------------------------------------------------------------
  -- 6. Un alias débil se marca como débil, y se puede excluir
  -- -------------------------------------------------------------------
  -- El registro trae fecha de nacimiento porque desde la 0074 una coincidencia
  -- por alias débil sólo se muestra si un campo corroborante la confirma. Sin
  -- la fecha, el barrido la suprimiría —correctamente— y esta prueba dejaría de
  -- comprobar lo que dice comprobar. Los tres desenlaces de la compuerta se
  -- prueban en la 0074; aquí sólo hace falta que la coincidencia sobreviva.
  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, identificador_fuente,
     nombres_alternos, nombres_alternos_debiles, identificadores)
  values (v_carga2, 'alta', 'persona', 'IVANOV, Ivan', '1004',
          array['IVANOV Ivan Petrovich'], array['IVANOFF Ivan'],
          '{"fechas_nacimiento_exactas": ["1970-05-04"]}'::jsonb);

  select coincide_por into v_txt
    from public.coincidencias_en_listas('IVANOFF Ivan', null, true, date '1970-05-04');
  if v_txt is distinct from 'alias_debil' then
    raise exception 'PRUEBA 6 FALLA: un cotejo por alias débil debe decirlo. Dijo "%".', v_txt;
  end if;

  select count(*) into v_n
    from public.coincidencias_en_listas('IVANOFF Ivan', null, false, date '1970-05-04');
  if v_n <> 0 then
    raise exception 'PRUEBA 6 FALLA: con los débiles excluidos no debía encontrar nada, y hubo %.', v_n;
  end if;
  raise notice 'PRUEBA  6 OK · el alias débil se marca, y se puede excluir a propósito';

  -- -------------------------------------------------------------------
  -- 7. El barrido devuelve el EFECTO declarado de la fuente
  -- -------------------------------------------------------------------
  -- OFAC eleva la diligencia; no impide. Es la instrucción 242, y aquí se
  -- comprueba de punta a punta: del catálogo al resultado del barrido.
  select efecto::text into v_txt from public.coincidencias_en_listas('IVANOV, Ivan');
  if v_txt <> 'eleva_diligencia' then
    raise exception
      'PRUEBA 7 FALLA: una coincidencia en OFAC eleva la diligencia, no impide. Dijo "%".', v_txt;
  end if;
  raise notice 'PRUEBA  7 OK · el barrido entrega el efecto que declaró la fuente';

  -- -------------------------------------------------------------------
  -- 8. La ONU impide, y sale primero
  -- -------------------------------------------------------------------
  declare v_carga_onu uuid;
  begin
    insert into lista_carga (fuente_id, tipo, estado, alcance, fecha_publicacion_fuente)
    values (v_onu, 'archivo', 'aplicada', 'completa', '2026-09-07')
    returning id into v_carga_onu;

    -- El mismo nombre en las dos listas: la ONU tiene que salir primero.
    insert into lista_movimiento
      (carga_id, accion, tipo_entidad, nombre, identificador_fuente)
    values (v_carga_onu, 'alta', 'persona', 'IVANOV, Ivan', 'RUi.001');
  end;

  select fuente into v_txt from public.coincidencias_en_listas('IVANOV, Ivan') limit 1;
  if v_txt <> 'onu_consolidada' then
    raise exception
      'PRUEBA 8 FALLA: con coincidencia en la ONU y en OFAC, la ONU va primero porque impide. '
      'Salió primero "%".', v_txt;
  end if;
  raise notice 'PRUEBA  8 OK · el impedimento se presenta antes que la elevación';

  -- -------------------------------------------------------------------
  -- 9. El RFC gana a cualquier cotejo por nombre
  -- -------------------------------------------------------------------
  declare v_carga_sat uuid;
  begin
    insert into lista_carga (fuente_id, tipo, estado, alcance, fecha_publicacion_fuente)
    values (v_sat, 'archivo', 'aplicada', 'completa', '2026-07-31')
    returning id into v_carga_sat;

    insert into lista_movimiento
      (carga_id, accion, tipo_entidad, nombre, rfc, situacion, fecha_situacion)
    values (v_carga_sat, 'alta', 'empresa', 'EFOS SA', 'EFO110101AA1', 'definitivo', '2024-01-01');
  end;

  select coincide_por into v_txt
    from public.coincidencias_en_listas('cualquier otro nombre', 'EFO110101AA1');
  if v_txt <> 'rfc' then
    raise exception 'PRUEBA 9 FALLA: con RFC debe coincidir por rfc. Dijo "%".', v_txt;
  end if;
  raise notice 'PRUEBA  9 OK · el RFC es la llave fuerte y se reporta como tal';

  -- -------------------------------------------------------------------
  -- 10. Un registro dado de baja no coincide
  -- -------------------------------------------------------------------
  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, identificador_fuente, oficio_numero)
  values (v_carga2, 'baja', 'persona', 'IVANOV, Ivan', '1004', 'retiro-1');

  select count(*) into v_n
    from public.coincidencias_en_listas('IVANOV Ivan Petrovich');
  if v_n <> 0 then
    raise exception
      'PRUEBA 10 FALLA: un registro inactivo no debe coincidir, y coincidió % veces.', v_n;
  end if;
  raise notice 'PRUEBA 10 OK · una baja deja de coincidir, pero el rastro queda';

  -- -------------------------------------------------------------------
  -- 11. …y su historial sigue en la bitácora
  -- -------------------------------------------------------------------
  select count(*) into v_n from lista_movimiento
   where carga_id = v_carga2 and identificador_fuente = '1004';
  if v_n <> 2 then
    raise exception 'PRUEBA 11 FALLA: la bitácora debe tener el alta y la baja, y tiene %.', v_n;
  end if;
  raise notice 'PRUEBA 11 OK · el alta y la baja quedan asentadas';

  -- -------------------------------------------------------------------
  -- 12. El identificador es único por fuente
  -- -------------------------------------------------------------------
  -- Dos fuentes pueden usar el mismo identificador sin chocar; la misma fuente
  -- no puede tener dos registros con el mismo.
  begin
    insert into lista_registro (fuente_id, tipo_entidad, nombre, identificador_fuente)
    values (v_ofac, 'empresa', 'DUPLICADA', '1001');
    raise exception 'PRUEBA 12 FALLA: se permitió un identificador repetido en la misma fuente.';
  exception when unique_violation then
    null;
  end;
  raise notice 'PRUEBA 12 OK · el identificador de fuente es único por fuente';

  -- -------------------------------------------------------------------
  -- 13. Sin nombre ni RFC no devuelve el mundo entero
  -- -------------------------------------------------------------------
  -- Un barrido con los dos parámetros vacíos tiene que devolver cero, no todo:
  -- lo segundo se vería como «coincide con todas las listas».
  select count(*) into v_n from public.coincidencias_en_listas(null, null);
  if v_n <> 0 then
    raise exception
      'PRUEBA 13 FALLA: sin nombre ni RFC debe devolver cero, y devolvió %.', v_n;
  end if;
  raise notice 'PRUEBA 13 OK · un barrido sin datos devuelve cero, no todo';

  -- -------------------------------------------------------------------
  -- 14. Un alta y una baja en la MISMA carga cotejan
  -- -------------------------------------------------------------------
  -- Regresión que la 0065 introdujo y que ninguna prueba cazaba: el
  -- no-retroceso frenaba también las bajas, así que este par no hacía nada en
  -- silencio. Es el flujo de la Lista de Personas Bloqueadas de la UIF, y el
  -- contrato que `registrarCarga` documenta desde la 0012. `probar_0012` no lo
  -- detecta porque usa una carga por oficio.
  declare
    v_uif uuid;
    v_carga_uif uuid;
    v_activo boolean;
  begin
    select id into v_uif from lista_fuente where codigo = 'uif_bloqueadas';

    insert into lista_carga (fuente_id, tipo, estado, fecha_publicacion_fuente)
    values (v_uif, 'captura_manual', 'aplicada', '2026-09-08')
    returning id into v_carga_uif;

    insert into lista_movimiento (carga_id, accion, tipo_entidad, nombre, rfc, oficio_numero, oficio_fecha)
    values (v_carga_uif, 'alta', 'persona', 'BLOQUEADO PRUEBA', 'BPR800101XX1',
            'oficio-alta-1', '2026-05-01');

    insert into lista_movimiento (carga_id, accion, tipo_entidad, nombre, rfc, oficio_numero, oficio_fecha)
    values (v_carga_uif, 'baja', 'persona', 'BLOQUEADO PRUEBA', 'BPR800101XX1',
            'oficio-baja-1', '2026-08-01');

    select activo into v_activo from lista_registro
     where fuente_id = v_uif and rfc = 'BPR800101XX1';

    if v_activo is not false then
      raise exception
        'PRUEBA 14 FALLA: la baja en la misma carga no se aplicó. El no-retroceso no debe '
        'frenar una baja: es una instrucción con oficio, no una situación que compita.';
    end if;

    select count(*) into v_n from lista_movimiento where carga_id = v_carga_uif;
    if v_n <> 2 then
      raise exception 'PRUEBA 14 FALLA: la bitácora debe tener los dos movimientos, y tiene %.', v_n;
    end if;
  end;
  raise notice 'PRUEBA 14 OK · un alta y una baja en la misma carga cotejan (regresión de la 0065)';

  -- -------------------------------------------------------------------
  -- Restaurar: las fuentes vuelven a validación y el candado se rearma
  -- -------------------------------------------------------------------
  -- Si esta prueba falla antes de llegar aquí, el rollback de la transacción
  -- deshace las dos cosas igual. Se restaura explícitamente para el caso en
  -- que pase, que es el que no tiene rollback.
  update lista_fuente set modo_operacion = 'validacion'
   where codigo in ('ofac_sdn', 'onu_consolidada', 'sat_69b');
  alter table lista_fuente enable trigger fuente_operativa_exige_cotejo;

  raise notice '--- 0067: 14 de 14 ---';
end
$probar$;
