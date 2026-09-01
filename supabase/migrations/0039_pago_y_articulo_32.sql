-- =====================================================================
-- 0039 · Detalle del pago y la prohibición del artículo 32
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 1 del 31/08/2026,
-- apartado 6.2. Segunda mitad de la instrucción 9.
--
-- La 0036 añadió la forma de pago, que era lo mínimo para que la matriz
-- cerrara. Esto añade lo que la ley pide de verdad, y por una razón distinta:
--
-- EL ARTICULO 32 NO ES UNA VARIABLE DE RIESGO, ES UNA PROHIBICION
--
-- Prohíbe liquidar en efectivo la constitución o transmisión de derechos reales
-- sobre inmuebles desde 8,025 UMA, y la transmisión de acciones o partes
-- sociales desde 3,210 UMA. El fedatario debe identificar la forma de pago y
-- dejar constancia, y la omisión se sanciona con un PORCENTAJE SOBRE EL VALOR
-- DE LA OPERACIÓN, no con multa fija.
--
-- Todas las demás variables de la matriz califican; ésta impide. Un acto que
-- cae en el supuesto no debe poder registrarse como si nada. Por eso el
-- bloqueo vive también en la base y no sólo en la pantalla: una validación que
-- sólo existe en el front la salta cualquiera con la API, y aquí lo que se
-- salta es una prohibición legal.
--
-- ---------------------------------------------------------------------
-- El pago de tercero
-- ---------------------------------------------------------------------
-- Cumplimiento lo pide aparte y con razón: que alguien distinto del cliente
-- pague es una señal POR SI MISMA, con independencia del monto y de si hubo
-- efectivo. No es un detalle del pago, es un hecho sobre quién está detrás de
-- la operación.
--
-- ---------------------------------------------------------------------
-- Una duda que se levanta y no se resuelve aquí
-- ---------------------------------------------------------------------
-- La adenda pide registrar «institución financiera y cuenta ordenante cuando
-- aplique». La cuenta ordenante es un dato bancario de una persona, y la
-- conservación de la fracción XII es de diez años: lo que se guarde hoy se
-- guarda una década. La columna queda, porque es lo que instruyeron, pero
-- conviene que Cumplimiento confirme si hace falta la cuenta COMPLETA o basta
-- la institución más los últimos dígitos. Mientras tanto es de captura
-- opcional y nada la exige.
-- =====================================================================

alter table operation
  add column if not exists efectivo_mxn numeric(14,2),
  add column if not exists fecha_pago date,
  add column if not exists pago_de_tercero boolean,
  add column if not exists institucion_financiera text,
  add column if not exists cuenta_ordenante text;

alter table operation drop constraint if exists operation_efectivo_no_negativo;
alter table operation
  add constraint operation_efectivo_no_negativo
  check (efectivo_mxn is null or efectivo_mxn >= 0);

-- El efectivo no puede exceder el valor del acto: si lo hace, uno de los dos
-- está mal capturado y conviene saberlo al escribirlo, no al armar el aviso.
alter table operation drop constraint if exists operation_efectivo_no_excede_monto;
alter table operation
  add constraint operation_efectivo_no_excede_monto
  check (efectivo_mxn is null or efectivo_mxn <= monto_mxn);

-- Coherencia entre lo declarado y lo detallado. «Bancarizado» con efectivo
-- encima es una contradicción, y dejarla pasar haría que la matriz clasificara
-- con un dato y la prohibición se midiera con otro.
alter table operation drop constraint if exists operation_efectivo_coherente;
alter table operation
  add constraint operation_efectivo_coherente
  check (
    forma_pago is null
    or (forma_pago = 'bancarizado' and coalesce(efectivo_mxn, 0) = 0)
    or forma_pago in ('mixto', 'efectivo')
  );

comment on column operation.efectivo_mxn is
  'Efectivo entregado, en pesos. Alimenta la prohibición del art. 32, cuya omisión '
  'se sanciona con porcentaje sobre el valor de la operación.';
comment on column operation.fecha_pago is
  'Día del pago. El art. 32 se mide con la UMA VIGENTE AL DÍA DEL PAGO, no a la del '
  'instrumento: la UMA cambia cada 1 de febrero y un pago de enero con escritura de '
  'febrero se juzgaría con un límite que no le tocaba. Nulo = se usa la del acto.';
comment on column operation.pago_de_tercero is
  'El pago proviene de alguien distinto del cliente. Señal por sí misma, con '
  'independencia del monto: es un hecho sobre quién está detrás de la operación.';
comment on column operation.cuenta_ordenante is
  'Dato bancario de una persona, con conservación de diez años. Pendiente de que '
  'Cumplimiento confirme si hace falta completa o bastan los últimos dígitos.';

create index if not exists idx_operation_pago_tercero
  on operation(organization_id, fecha)
  where pago_de_tercero;

-- ---------------------------------------------------------------------
-- El candado, en la base
-- ---------------------------------------------------------------------
-- Devuelve el límite en UMA del artículo 32 para un tipo de acto, o null si el
-- acto no cae en la prohibición. Sólo los dos supuestos que el artículo nombra:
-- extenderlo por analogía —«una constitución también implica suscribir
-- acciones»— sería inventar un supuesto sancionable que la ley no escribió.
create or replace function public.limite_efectivo_del_acto(p_tipo_acto text)
returns text
language sql immutable as $$
  select case p_tipo_acto
    when 'transmision_inmueble'   then 'umbral_efectivo_inmueble_uma'
    when 'compra_venta_acciones'  then 'umbral_efectivo_acciones_uma'
    else null
  end
$$;

create or replace function public.impedir_efectivo_prohibido()
returns trigger language plpgsql as $$
declare
  v_acto    text := new.contraparte ->> 'tipo_acto';
  v_codigo  text := public.limite_efectivo_del_acto(v_acto);
  v_limite  numeric;
  v_uma     numeric;
  v_fecha   date  := coalesce(new.fecha_pago, new.fecha::date);
begin
  if coalesce(new.efectivo_mxn, 0) = 0 or v_codigo is null then
    return new;
  end if;

  -- La UMA del DÍA DEL PAGO, no la de hoy ni la del instrumento.
  select valor_numerico into v_limite
    from public.parametro_regulatorio
   where codigo = v_codigo
     and vigente_desde <= v_fecha
     and (vigente_hasta is null or vigente_hasta > v_fecha)
   order by vigente_desde desc limit 1;

  select valor_numerico into v_uma
    from public.parametro_regulatorio
   where codigo = 'uma_diaria'
     and vigente_desde <= v_fecha
     and (vigente_hasta is null or vigente_hasta > v_fecha)
   order by vigente_desde desc limit 1;

  -- Sin límite o sin UMA NO se deja pasar en silencio. Dar por lícito lo que
  -- nadie midió, sobre una prohibición con sanción de porcentaje, es peor que
  -- detener la captura: quien captura puede resolverlo, la sanción no.
  if v_limite is null or v_uma is null or v_uma <= 0 then
    raise exception 'No se puede verificar la prohibición de efectivo del artículo 32 para '
                    'este acto: falta el límite en el catálogo de parámetros o la UMA del '
                    '% (día del pago). Cárgalos antes de registrarlo.', v_fecha;
  end if;

  if new.efectivo_mxn >= v_limite * v_uma then
    raise exception 'El artículo 32 de la LFPIORPI prohíbe liquidar este acto en efectivo '
                    'desde % UMA (% pesos con la UMA del %). Se declararon % en efectivo.',
                    v_limite, round(v_limite * v_uma, 2), v_fecha, new.efectivo_mxn
      using hint = 'La operación no procede así. Cambia la forma de liquidación o consulta '
                   'al Oficial de Cumplimiento.';
  end if;

  return new;
end $$;

drop trigger if exists trg_operation_efectivo_articulo_32 on operation;
create trigger trg_operation_efectivo_articulo_32
  before insert or update of efectivo_mxn, forma_pago, fecha_pago, contraparte on operation
  for each row execute function public.impedir_efectivo_prohibido();

comment on function public.impedir_efectivo_prohibido() is
  'Candado del art. 32. Vive en la base y no sólo en la pantalla: una validación que '
  'sólo existe en el front la salta cualquiera con la API, y aquí lo que se saltaría '
  'es una prohibición legal cuya omisión se sanciona con porcentaje sobre el valor.';

-- ---------------------------------------------------------------------
-- Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org and tipo = 'candado_articulo_32') then
      continue;
    end if;
    perform public.registrar_evento(
      v_org, 'candado_articulo_32', 'operation', null,
      jsonb_build_object(
        'motivo', 'El art. 32 no es una variable de riesgo: es una prohibición cuya omisión '
               || 'se sanciona con porcentaje sobre el valor de la operación. El resultado '
               || 'correcto no es sumar puntos, es impedir.',
        'supuestos', 'Inmuebles desde 8,025 UMA y acciones o partes sociales desde 3,210. '
                  || 'Sólo los dos que el artículo nombra: extenderlo por analogía sería '
                  || 'inventar un supuesto sancionable.',
        'uma', 'La del DÍA DEL PAGO, no la del instrumento. Cambia cada 1 de febrero.',
        'donde_vive', 'En un trigger. Una validación que sólo existe en el front la salta '
                   || 'cualquiera con la API.'
      ),
      'sistema', null
    );
  end loop;
end $$;

revoke insert, update, delete on operation from anon;
revoke all on function public.limite_efectivo_del_acto(text) from anon;
revoke all on function public.impedir_efectivo_prohibido() from anon, authenticated;
