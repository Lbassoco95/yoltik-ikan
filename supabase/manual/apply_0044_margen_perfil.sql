-- =====================================================================
-- Ikán · Aplicar migration 0044 en el SQL Editor
-- =====================================================================
-- QUÉ ARREGLA · instrucción 12 de la Adenda 1, que BLOQUEA DEMO
--
-- La comparación de frecuencia del perfil transaccional se hacía contra la
-- MITAD de lo declarado, redondeada hacia arriba, y se documentó como «sin
-- margen de tolerancia, porque la Adenda no fija ninguno».
--
-- Era falso. No era ausencia de tolerancia: era una tolerancia del CINCUENTA
-- POR CIENTO, inventada exactamente igual que lo habría sido un diez por
-- ciento, sólo que cinco veces más amplia y sin quedar escrita en ninguna
-- parte. Y el redondeo la hacía VARIABLE, más generosa justo donde los conteos
-- son más chicos: quien declaraba una operación al año podía hacer una en seis
-- meses —el doble del ritmo— sin que nada se levantara.
--
-- QUÉ ENTRA EN SU LUGAR
--
-- Un margen ABSOLUTO de una operación, que vive en el registro versionado y
-- firmado de parámetros y NO en el código. Es un parámetro normativo igual que
-- el múltiplo de UMA y que las bandas de la escala: si es una constante en el
-- fuente, nadie puede acreditar ante un verificador cuándo cambió ni quién lo
-- aprobó.
--
-- Se registra explícitamente como PROVISIONAL, SIN BASE ESTADÍSTICA y con fecha
-- de revisión. En el primer año de un programa nadie tiene doce meses de datos,
-- y decirlo por escrito es mejor respuesta que simular una precisión que no se
-- tiene.
--
-- QUÉ HAY QUE SABER
--
-- El check de `unidad` no admitía contar operaciones —sólo mxn, uma, dia, anio
-- y porcentaje—. Se añade 'operacion'. Meterlo como 'anio' o 'porcentaje' para
-- que pasara la restricción sería mentir sobre lo que la cifra mide.
--
-- Después de esto, la aplicación deja de responder la variable de frecuencia si
-- el parámetro no está cargado, en vez de inventar una tolerancia. Así que este
-- bundle va ANTES de desplegar el front.
--
-- ORDEN: después de la 0043.
-- IDEMPOTENTE: se puede volver a correr sin duplicar nada.
-- =====================================================================

begin;

-- =====================================================================
-- 0044 · El margen del perfil transaccional sale del código
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 1 del 31/08/2026,
-- apartado 7.1. Instrucción 12 de su resumen, que BLOQUEA DEMO.
--
-- ---------------------------------------------------------------------
-- Qué estaba mal, dicho sin adornos
-- ---------------------------------------------------------------------
-- La comparación de frecuencia se hacía contra la MITAD de lo declarado,
-- redondeada hacia arriba. Se documentó como «sin margen de tolerancia, porque
-- la Adenda no fija ninguno».
--
-- Eso era falso, y Cumplimiento lo señaló: no era ausencia de tolerancia, era
-- una tolerancia del cincuenta por ciento. Una cifra inventada exactamente
-- igual que lo habría sido un diez por ciento, sólo que cinco veces más amplia
-- y sin quedar escrita en ninguna parte. El escrúpulo que impidió poner el diez
-- por ciento debía haber impedido dejar el cincuenta.
--
-- Peor todavía: el redondeo hacia arriba hacía la tolerancia VARIABLE, y más
-- generosa justo donde los conteos son más chicos. Quien declaraba una
-- operación al año podía hacer una en seis meses —el doble del ritmo
-- declarado— sin que nada se levantara; quien declaraba cuatro no tenía holgura
-- ninguna. Nadie decidió eso: salió de un `ceil`.
--
-- ---------------------------------------------------------------------
-- Por qué el margen vive AQUÍ y no en el código
-- ---------------------------------------------------------------------
-- Es un parámetro normativo, igual que el múltiplo de UMA y que las bandas de
-- la escala, y le aplica el mismo régimen de versión y firma. Si es una
-- constante en el fuente, nadie puede acreditar ante un verificador cuándo
-- cambió ni quién lo aprobó.
--
-- ---------------------------------------------------------------------
-- Por qué es absoluto y no porcentual
-- ---------------------------------------------------------------------
-- En fe pública la frecuencia declarada es un entero pequeño: una, dos, cuatro
-- operaciones al año. Un diez por ciento sobre dos esperadas da 2.2, que al
-- redondear se comporta igual que no tener tolerancia; sobre cuatro da 4.4, con
-- el mismo resultado. Un porcentaje sólo discrimina cuando los conteos son
-- grandes, y aquí no lo son. El margen absoluto de UNA operación sí discrimina,
-- y además se puede explicar en una frase.
--
-- ---------------------------------------------------------------------
-- Lo que este parámetro NO pretende ser
-- ---------------------------------------------------------------------
-- No tiene base estadística. No puede tenerla: no hay doce meses de datos de
-- operación, y en el primer año de un programa nadie los tiene. Decirlo por
-- escrito es mejor respuesta que simular una precisión que no se tiene, y por
-- eso viaja en `notas` con esas palabras y con fecha de revisión.
--
-- Al cumplirse doce meses de operación se sustituye por un corte derivado de la
-- distribución observada —el decil superior de desviación—, de modo que la
-- cifra venga de la población y no del criterio del analista.
-- =====================================================================

-- ---------------------------------------------------------------------
-- La unidad: operaciones contadas, que no es ninguna de las que había
-- ---------------------------------------------------------------------
-- El check admitía mxn, uma, dia, anio y porcentaje. Un margen de conteo no es
-- ninguna, y meterlo como 'anio' o 'porcentaje' para que pase la restricción
-- sería mentir sobre lo que la cifra mide.
alter table parametro_regulatorio drop constraint if exists parametro_regulatorio_unidad_check;
alter table parametro_regulatorio
  add constraint parametro_regulatorio_unidad_check
  check (unidad in ('mxn', 'uma', 'dia', 'anio', 'porcentaje', 'operacion'));

comment on column parametro_regulatorio.unidad is
  'Qué mide el valor. ''operacion'' cuenta operaciones y entró con el margen del '
  'perfil transaccional (Cap. III Ter): no es un monto ni un porcentaje.';

-- ---------------------------------------------------------------------
-- El margen
-- ---------------------------------------------------------------------
insert into parametro_regulatorio
  (codigo, nombre, valor_numerico, unidad, sector, vigente_desde,
   fuente, confirmado_por, confirmado_en, notas)
select
  'margen_perfil_transaccional_operaciones',
  'Margen del perfil transaccional, en operaciones sobre lo esperado',
  1, 'operacion', 'XII', date '2026-08-31',
  'Kawiil Mx · Célula de Cumplimiento, Adenda 1 del 31/08/2026, apartado 7.1, '
    || 'segunda opción de la instrucción. Base normativa: Cap. III Ter de las RCG '
    || '(Acuerdo 115/2026) y art. 18 fr. X de la LFPIORPI, que obligan a detectar '
    || 'las operaciones fuera del Perfil Transaccional sin fijar parámetro numérico: '
    || 'el parámetro es del sujeto obligado.',
  'Kawiil-Cumplimiento · Adenda 1 (31/08/2026), apartado 7.1',
  date '2026-08-31',
  'PROVISIONAL, SIN BASE ESTADÍSTICA, PENDIENTE DE CALIBRACIÓN. No hay doce meses '
    || 'de datos de operación y en el primer año de un programa nadie los tiene. Es '
    || 'un margen ABSOLUTO y no porcentual porque en fe pública la frecuencia '
    || 'declarada es un entero pequeño: un 10 % sobre dos operaciones esperadas da '
    || '2.2, que al redondear se comporta igual que no tener tolerancia. '
    || 'REVISIÓN: al cumplirse doce meses de operación, y a más tardar el 1 de marzo '
    || 'de 2027, se sustituye por un corte derivado de la distribución observada '
    || '(decil superior de desviación), para que la cifra venga de la población y no '
    || 'del criterio del analista. Sustituye a un redondeo hacia arriba en el código '
    || 'que equivalía a una tolerancia del 50 % variable y no documentada.'
where not exists (
  select 1 from parametro_regulatorio
   where codigo = 'margen_perfil_transaccional_operaciones' and sector = 'XII'
);

-- ---------------------------------------------------------------------
-- Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org
                  and tipo = 'margen_perfil_transaccional_versionado') then
      continue;
    end if;
    perform public.registrar_evento(
      v_org, 'margen_perfil_transaccional_versionado', 'parametro_regulatorio', null,
      jsonb_build_object(
        'defecto', 'La comparación de frecuencia se hacía contra la mitad de lo declarado '
                || 'redondeada hacia arriba, y se documentó como «sin margen de '
                || 'tolerancia». Era falso: era una tolerancia del 50 %, inventada igual '
                || 'que lo habría sido un 10 % y sin quedar escrita en ninguna parte.',
        'agravante', 'El redondeo hacía la tolerancia VARIABLE y más generosa donde los '
                  || 'conteos son más chicos: quien declaraba una operación al año podía '
                  || 'hacer una en seis meses —el doble del ritmo— sin levantar nada. '
                  || 'Nadie decidió eso: salió de un ceil.',
        'correccion', 'Margen ABSOLUTO de una operación, en el registro versionado y '
                   || 'firmado de parámetros. Un parámetro provisional documentado y '
                   || 'firmado es defendible ante una verificación; el mismo parámetro '
                   || 'escondido en una constante del código no lo es.',
        'preferencia_de_cumplimiento', 'La opción preferida de la Adenda es NO producir '
                   || 'determinación binaria y usar la razón continua para ordenar la cola '
                   || 'de revisión. Se implementan las dos: la razón continua siempre se '
                   || 'calcula y viaja; el estado binario existe sólo porque la matriz '
                   || 'necesita un valor discreto para su variable.',
        'direccionalidad', 'Operar POR DEBAJO de lo declarado deja de ser señal de riesgo. '
                        || 'En una actividad de actos discretos suele ser sólo un cliente '
                        || 'que no necesitó el servicio; produce nota de calidad del dato, '
                        || 'no puntaje.',
        'revision', 'A los doce meses de operación, y a más tardar el 1 de marzo de 2027: '
                 || 'corte derivado de la distribución observada.'
      ),
      'sistema', null
    );
  end loop;
end $$;

revoke insert, update, delete on parametro_regulatorio from anon;

-- ---------------------------------------------------------------------
-- Comprobación antes de confirmar
-- ---------------------------------------------------------------------

-- 1. El parámetro existe, está firmado y dice que es provisional.
select codigo, valor_numerico, unidad, sector, vigente_desde,
       confirmado_por is not null as firmado,
       notas like '%PROVISIONAL%' as declarado_provisional,
       notas like '%1 de marzo de 2027%' as con_fecha_de_revision
  from parametro_regulatorio
 where codigo = 'margen_perfil_transaccional_operaciones';
-- Un renglón: valor 1, unidad 'operacion', sector XII, firmado = t,
-- declarado_provisional = t, con_fecha_de_revision = t.

-- 2. La función de resolución lo devuelve para el sector XII.
select public.parametro_vigente(
         'margen_perfil_transaccional_operaciones', current_date, 'XII') as margen;
-- Debe devolver 1. Si devuelve null, el front no responderá la variable de
-- frecuencia, y eso es lo correcto: nunca sustituye por un valor inventado.

-- 3. Ningún parámetro quedó con unidad fuera del catálogo ampliado.
select unidad, count(*) from parametro_regulatorio group by unidad order by unidad;

-- 4. La bitácora quedó sellada.
select count(*) from evento_auditoria
 where tipo = 'margen_perfil_transaccional_versionado';

commit;
