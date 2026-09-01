-- =====================================================================
-- Ikán · Aplicar migration 0046 en el SQL Editor
-- =====================================================================
-- QUÉ CIERRA · hallazgo de la revisión de Cowork, y es el más grave
--
-- Una transmisión de inmueble de diez millones de pesos con
-- `forma_pago = 'efectivo'` y `efectivo_mxn` NULO se registraba sin error, sin
-- bloqueo y sin marca. El check admitía la fila y el trigger salía temprano con
-- `coalesce(efectivo_mxn, 0) = 0`, así que el artículo 32 no se evaluaba nunca.
--
-- Es el único control de toda la matriz cuyo resultado correcto es IMPEDIR la
-- operación y no calificarla, y su omisión se sanciona con porcentaje sobre el
-- valor de la operación, no con multa fija.
--
-- La pantalla exige el monto, pero la pantalla no es el control: la tabla
-- acepta escrituras por API, importaciones y correcciones a mano.
--
-- QUÉ HAY QUE SABER ANTES DE CORRERLO
--
-- La restricción entra NOT VALID: rige para toda inserción y actualización
-- desde ahora y NO revisa las filas anteriores. Es deliberado. Un acto viejo
-- con efectivo declarado y sin monto se corrige MIRÁNDOLO —el importe lo sabe
-- el notario, no nosotros—, no borrándolo ni inventándole una cifra para que
-- pase la restricción.
--
-- La última consulta los lista. Si sale vacía, se puede validar de inmediato
-- con la línea que viene comentada al final.
--
-- ORDEN: después de la 0045. No requiere redesplegar nada.
-- IDEMPOTENTE: se puede volver a correr.
-- =====================================================================

begin;

-- =====================================================================
-- 0046 · Declarar efectivo sin decir cuánto dejaba de bloquear
-- =====================================================================
-- Origen: revisión de código de Cowork sobre el Sprint D-2. Es el hallazgo
-- correcto y es el más grave de los suyos, porque toca el ÚNICO control de toda
-- la matriz cuyo resultado correcto es impedir la operación y no calificarla.
--
-- ---------------------------------------------------------------------
-- El agujero
-- ---------------------------------------------------------------------
-- La 0039 dejó dos piezas que, juntas, se anulaban:
--
--   · El check `operation_efectivo_coherente` admite cualquier fila con
--     `forma_pago in ('mixto','efectivo')`, incluida una con `efectivo_mxn`
--     NULO.
--   · El trigger `impedir_efectivo_prohibido` empieza con
--     `if coalesce(new.efectivo_mxn, 0) = 0 ... return new`.
--
-- Así que una transmisión de inmueble de diez millones de pesos con
-- `forma_pago = 'efectivo'` y `efectivo_mxn = null` se registraba sin error,
-- sin bloqueo y sin marca. El acto quedaba declarado como pagado en efectivo y
-- el artículo 32 no se evaluaba nunca.
--
-- La pantalla puede exigir el monto, pero la pantalla no es el control: la
-- tabla acepta escrituras por API, importaciones y correcciones a mano. Una
-- validación que sólo vive en el formulario es una validación que cualquiera
-- con la API se salta, y aquí lo que se saltaría es una prohibición legal cuya
-- omisión se sanciona con porcentaje sobre el valor de la operación.
--
-- ---------------------------------------------------------------------
-- El arreglo
-- ---------------------------------------------------------------------
-- Si se declara pago en efectivo o mixto, el monto en efectivo es OBLIGATORIO y
-- mayor que cero. No es rigor de más: «pagué en efectivo» sin importe no es un
-- dato incompleto que se pueda completar después, es una declaración que deja
-- sin soporte la obligación del fedatario de identificar la forma de pago y
-- dejar constancia.
--
-- Cero tampoco vale: si no hubo entrega de efectivo, la forma de pago es
-- bancarizada, y decir «efectivo, cero pesos» es una contradicción que el otro
-- check ya no admite en el sentido inverso.
--
-- ---------------------------------------------------------------------
-- NOT VALID, y por qué
-- ---------------------------------------------------------------------
-- La restricción entra `not valid`: rige para toda inserción y actualización
-- desde ahora, y NO revisa las filas que ya están. Es deliberado.
--
-- Validarla de golpe tumbaría la migration si existe un solo acto viejo con
-- efectivo declarado y sin monto, y esos actos hay que corregirlos mirándolos
-- uno por uno —el monto verdadero lo sabe el notario, no nosotros—, no
-- borrándolos ni inventándoles una cifra para que pase la restricción.
--
-- La consulta del final los lista. Cuando estén corregidos:
--   alter table operation validate constraint operation_efectivo_con_monto;
-- =====================================================================

alter table operation drop constraint if exists operation_efectivo_con_monto;
alter table operation
  add constraint operation_efectivo_con_monto
  check (
    forma_pago is null
    or forma_pago = 'bancarizado'
    or (efectivo_mxn is not null and efectivo_mxn > 0)
  )
  not valid;

comment on constraint operation_efectivo_con_monto on operation is
  'Declarar pago en efectivo o mixto obliga a decir cuánto. Sin monto, el trigger del '
  'art. 32 salía temprano y el acto quedaba registrado como pagado en efectivo sin '
  'evaluarse contra la prohibición. NOT VALID: rige de aquí en adelante; los actos '
  'anteriores se corrigen mirándolos, no borrándolos.';

-- ---------------------------------------------------------------------
-- El trigger deja de tratar «sin dato» como «sin efectivo»
-- ---------------------------------------------------------------------
-- La restricción de arriba impide que vuelva a entrar una fila así, pero el
-- trigger también corre sobre las que ya están, y sobre cualquier update que
-- las toque. Que salga temprano con un nulo es lo que convertía la ausencia del
-- dato en una respuesta benigna.
--
-- Ahora, si la forma de pago dice efectivo o mixto y el monto falta, el trigger
-- FALLA en vez de dejar pasar. Es el mismo criterio que el resto del sistema:
-- lo que no se sabe no se contesta que está bien.
create or replace function public.impedir_efectivo_prohibido()
returns trigger language plpgsql as $$
declare
  v_acto    text := new.contraparte ->> 'tipo_acto';
  v_codigo  text := public.limite_efectivo_del_acto(v_acto);
  v_limite  numeric;
  v_uma     numeric;
  v_fecha   date  := coalesce(new.fecha_pago, new.fecha::date);
begin
  -- Efectivo declarado sin monto: no es cero, es un dato que falta.
  if new.forma_pago in ('mixto', 'efectivo') and coalesce(new.efectivo_mxn, 0) <= 0 then
    raise exception
      'La forma de pago dice «%» pero no se capturó el monto en efectivo. El artículo 32 '
      'se mide sobre ese importe: sin él no se puede saber si la operación está permitida.',
      new.forma_pago
      using errcode = 'check_violation';
  end if;

  if coalesce(new.efectivo_mxn, 0) = 0 or v_codigo is null then
    return new;
  end if;

  -- La UMA del DÍA DEL PAGO, no la de hoy ni la del instrumento.
  select valor_numerico into v_limite
    from public.parametro_regulatorio
   where codigo = v_codigo
     and vigente_desde <= v_fecha
     and (vigente_hasta is null or vigente_hasta > v_fecha)
   order by vigente_desde desc
   limit 1;

  select valor_numerico into v_uma
    from public.parametro_regulatorio
   where codigo = 'uma_diaria'
     and vigente_desde <= v_fecha
     and (vigente_hasta is null or vigente_hasta > v_fecha)
   order by vigente_desde desc
   limit 1;

  -- Sin límite o sin UMA NO se concluye que el pago está permitido: se falla.
  -- Concluir «no prohibido» porque falta un parámetro sería exactamente el
  -- falso negativo que este candado existe para no producir.
  if v_limite is null or v_uma is null then
    raise exception
      'No se puede verificar el artículo 32 para este acto: falta el límite o la UMA '
      'vigente al % en parametro_regulatorio.', v_fecha
      using errcode = 'check_violation';
  end if;

  if new.efectivo_mxn >= v_limite * v_uma then
    raise exception
      'El artículo 32 de la LFPIORPI prohíbe liquidar este acto en efectivo por % o más '
      '(% UMA a $% del %). Se declararon $%. La operación no puede registrarse así.',
      round(v_limite * v_uma, 2), v_limite, v_uma, v_fecha, new.efectivo_mxn
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org and tipo = 'candado_efectivo_sin_monto') then
      continue;
    end if;
    perform public.registrar_evento(
      v_org, 'candado_efectivo_sin_monto', 'operation', null,
      jsonb_build_object(
        'origen', 'Revisión de código de Cowork sobre el Sprint D-2.',
        'defecto', 'El check admitía forma_pago «efectivo» o «mixto» con efectivo_mxn NULO, '
                || 'y el trigger salía temprano con coalesce(efectivo_mxn, 0) = 0. Una '
                || 'transmisión de inmueble de diez millones declarada en efectivo sin monto '
                || 'se registraba sin error, sin bloqueo y sin marca: el artículo 32 no se '
                || 'evaluaba nunca.',
        'por_que_importa', 'Es el único control de toda la matriz cuyo resultado correcto es '
                || 'IMPEDIR la operación y no calificarla, y su omisión se sanciona con '
                || 'porcentaje sobre el valor de la operación, no con multa fija.',
        'correccion', 'Declarar efectivo o mixto obliga a capturar el monto, mayor que cero, '
                   || 'y el trigger falla en vez de dejar pasar cuando falta. La pantalla no '
                   || 'es el control: la tabla acepta escrituras por API e importaciones.',
        'not_valid', 'La restricción no revisa las filas anteriores. Un acto viejo con '
                  || 'efectivo declarado y sin monto se corrige mirándolo —el importe lo sabe '
                  || 'el notario—, no borrándolo ni inventándole una cifra.'
      ),
      'sistema', null
    );
  end loop;
end $$;

revoke insert, update, delete on operation from anon;

-- ---------------------------------------------------------------------
-- Comprobación antes de confirmar
-- ---------------------------------------------------------------------

-- 1. La restricción existe y está NOT VALID (convalidated = false).
select conname, convalidated
  from pg_constraint
 where conrelid = 'public.operation'::regclass
   and conname = 'operation_efectivo_con_monto';

-- 2. ACTOS ANTERIORES CON EL DEFECTO. Es la consulta que importa.
--    Cada renglón es un acto declarado como pagado en efectivo o mixto sobre el
--    que el artículo 32 nunca se evaluó. Hay que revisarlos uno por uno con el
--    notario y capturar el importe real.
select id, fecha, monto_mxn, forma_pago,
       contraparte ->> 'tipo_acto' as tipo_acto,
       instrumento_publico
  from operation
 where forma_pago in ('mixto', 'efectivo')
   and coalesce(efectivo_mxn, 0) <= 0
 order by fecha desc;

-- 3. Cuántos son, por si la lista es larga.
select count(*) as actos_por_corregir
  from operation
 where forma_pago in ('mixto', 'efectivo')
   and coalesce(efectivo_mxn, 0) <= 0;

-- 4. La bitácora quedó sellada.
select count(*) from evento_auditoria where tipo = 'candado_efectivo_sin_monto';

commit;

-- ---------------------------------------------------------------------
-- DESPUÉS de corregir los actos que salieron en la consulta 2
-- ---------------------------------------------------------------------
-- Sólo cuando esa consulta devuelva cero renglones. Si se corre antes, falla y
-- no cambia nada: no rompe, pero tampoco sirve.
--
--   alter table operation validate constraint operation_efectivo_con_monto;
