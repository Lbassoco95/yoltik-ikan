-- =====================================================================
-- Ikán · Asentar en la bitácora una edición hecha fuera de la aplicación
-- =====================================================================
-- El 31/08/2026 se editaron los campos de trazabilidad de `uma_diaria` 2026
-- (fuente, url_fuente y notas) con un `update` directo en el SQL Editor, para
-- dejar constancia de que el valor se cotejó contra la API del INEGI. El valor
-- numérico NO cambió: sigue en 117.3100.
--
-- El problema no es el cambio, es que no dejó rastro. Quien entra al SQL
-- Editor lo hace como `postgres`, dueño de la tabla, y se salta la RLS y los
-- `revoke` de la 0029; por ahí no se pasa por `registrar_evento`. El
-- diagnóstico lo confirmó: cero eventos de parámetros en la cadena de
-- plataforma.
--
-- Este archivo no deshace nada ni reescribe el pasado. Asienta el hecho, que
-- es lo único honesto que se puede hacer con un hueco de constancia: la 0021
-- dice que una corrección es un asiento nuevo, nunca la edición de uno viejo,
-- y eso vale igual cuando lo que hay que corregir es la ausencia de asiento.
--
-- Dice también lo que NO se sabe. El contenido anterior de `fuente` y `notas`
-- se perdió al sobrescribirse, así que el evento registra el estado posterior
-- y declara que el anterior no es recuperable. Un asiento que fingiera saberlo
-- sería peor que no tenerlo.
-- =====================================================================

begin;

do $$
declare
  v_p      record;
  v_evento uuid;
begin
  select id, codigo, valor_numerico, vigente_desde, fuente, url_fuente,
         length(coalesce(notas, '')) as largo_notas, confirmado_por
    into v_p
    from public.parametro_regulatorio
   where codigo = 'uma_diaria' and sector = '*' and vigente_desde = date '2026-02-01';

  if not found then
    raise exception 'No existe uma_diaria 2026-02-01. Revisa el catálogo antes de asentar nada.';
  end if;

  -- Si el valor no es el que se espera, algo más pasó y este asiento contaría
  -- una historia que no es. Mejor parar.
  if v_p.valor_numerico <> 117.31 then
    raise exception 'uma_diaria 2026 vale % y se esperaba 117.31. Párate: este '
                    'asiento describe una edición que NO tocó el valor.', v_p.valor_numerico;
  end if;

  v_evento := public.registrar_evento(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'parametro_editado_fuera_de_la_aplicacion',
    'parametro_regulatorio',
    v_p.id,
    jsonb_build_object(
      'codigo',          v_p.codigo,
      'vigente_desde',   v_p.vigente_desde,
      'cuando',          '2026-08-31',
      'via',             'update directo en el SQL Editor de Supabase, como el rol postgres',
      'quien',           'Devin, ejecutando una tarea de investigación de la API del INEGI',
      'campos_tocados',  'fuente, url_fuente, notas',
      'valor_numerico',  v_p.valor_numerico,
      'valor_cambio',    false,
      'estado_posterior', jsonb_build_object(
        'fuente',      v_p.fuente,
        'url_fuente',  v_p.url_fuente,
        'notas_largo', v_p.largo_notas,
        'confirmado_por', v_p.confirmado_por
      ),
      'estado_anterior', 'no recuperable: los campos se sobrescribieron sin copia previa',
      'por_que_no_hubo_rastro',
        'La migration 0029 revoca insert/update/delete a authenticated y quita la '
        || 'política de escritura, así que desde la aplicación esto no es posible. El '
        || 'SQL Editor entra como postgres, dueño de la tabla, y se salta ambas cosas. '
        || 'La 0029 protege a la aplicación, no a quien tiene la llave de la base.',
      'que_habria_pasado_por_la_via_correcta',
        'corregir_parametro() habría RECHAZADO este cambio: uma_diaria 2026 entró en '
        || 'vigor el 01/02/2026 y la función sólo corrige lo que todavía no rige. La '
        || 'vía correcta para cambiar algo de un parámetro vigente es abrir una '
        || 'vigencia nueva, no editar la que ya rigió.',
      'asentado_por', 'supabase/manual/asentar_edicion_fuera_de_la_app.sql'
    ),
    'sistema',
    null
  );

  raise notice 'Asentado como evento %.', v_evento;
end $$;

-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
do $$
declare v_n bigint;
begin
  select count(*) into v_n from public.evento_auditoria
   where organization_id = '00000000-0000-0000-0000-000000000000'
     and tipo = 'parametro_editado_fuera_de_la_aplicacion';
  if v_n <> 1 then
    raise exception 'FALLA: se esperaba 1 asiento y hay %. Si es más de uno, este '
                    'archivo se corrió dos veces: revísalo antes de seguir.', v_n;
  end if;

  select count(*) into v_n from public.verificar_cadena('00000000-0000-0000-0000-000000000000');
  if v_n <> 0 then raise exception 'FALLA: la cadena de plataforma quedó rota'; end if;
end $$;

select 'edición asentada' as bundle,
       (select count(*)::text from public.evento_auditoria
         where organization_id = '00000000-0000-0000-0000-000000000000')
         || ' evento(s) en la cadena de plataforma' as cadena,
       (select public.parametro_vigente('uma_diaria')::text) as uma_vigente,
       'la cadena sigue íntegra' as verificacion;

commit;
