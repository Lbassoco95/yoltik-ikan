-- =====================================================================
-- 0075 · Los umbrales se miden con la fecha del acto
-- =====================================================================
-- Cierra las instrucciones 312, 313, 322, 323 y 324 de las Notas 3 y 4 de la
-- Célula de Cumplimiento.
--
-- ---------------------------------------------------------------------
-- El defecto
-- ---------------------------------------------------------------------
-- La UMA ya se seleccionaba por la fecha del acto desde el criterio del
-- 31/08/2026. El UMBRAL no: viaja escrito a mano dentro de `regla_dsl`, así que
-- un acto de 2024 se medía contra el número de 2026. Y la reforma no ajustó los
-- umbrales, los reescribió: en inmuebles pasó de 16,000 UMA a 8,000, en
-- sociedades de 8,025 a ninguno —ahora avisa siempre—.
--
-- Como dice la Nota 3: «Un motor con un umbral fijo por inciso no se equivoca
-- por un peso: se equivoca por completo en el sentido de la obligación.» Y no
-- produce un error visible: produce un Aviso de más o de menos que nadie nota.
--
-- ---------------------------------------------------------------------
-- La fecha de corte, y por qué las que había estaban mal
-- ---------------------------------------------------------------------
-- Instrucción 322: el corte es el 17 de julio de 2025 y es GENERAL para toda la
-- reforma, no sólo para el apartado A de la fracción XII. Sale del transitorio
-- Primero del decreto publicado el 16 de julio de 2025 —entra en vigor al día
-- siguiente— y el transitorio Sexto fracción IV del Reglamento lo confirma para
-- unos incisos concretos sin crear una fecha distinta.
--
-- Las vigencias que había en `parametro_regulatorio` eran del día en que Kawiil
-- capturó cada valor —2026-01-01, 2026-08-31— no del día en que la norma surtió
-- efecto. Eso hacía que un acto de agosto de 2026 se midiera con el umbral
-- viejo, cuando llevaba más de un año rigiendo el nuevo. Se corrigen a la fecha
-- de la norma.
--
-- Esto REVOCA un criterio anterior y hay que decirlo con todas sus letras. Las
-- migrations 0030 y 0033 fecharon las vigencias a propósito el día de la
-- captura, razonando que «la vigencia del catálogo refleja lo que el SISTEMA
-- usó, no lo que la ley decía». Ese razonamiento servía para no falsear la
-- historia de lo que el motor calculó, pero pagaba un precio que entonces no se
-- veía: con un motor que resuelve por la fecha del acto, un catálogo fechado al
-- día de captura mide mal TODO acto anterior a esa captura. La instrucción 324
-- lo zanja: el catálogo es de la norma. La historia de lo que el motor calculó
-- vive donde le corresponde —bitácora, hallazgos y la corrida que los produjo—
-- y ahí sigue intacta.

-- ---------------------------------------------------------------------
-- 1. Las vigencias, con las fechas de la norma
-- ---------------------------------------------------------------------
-- El ORDEN importa y no es evidente. `parametro_sin_traslape` es una
-- restricción de exclusión sobre (codigo, sector, rango de fechas): si se mueve
-- primero el arranque del régimen nuevo hacia atrás, se traslapa con el viejo
-- —que todavía termina en su fecha de captura— y la restricción lo rechaza a
-- mitad de la migration. Primero se cierra el viejo, después se abre el nuevo.
--
-- Se cazó aplicando a producción: el Postgres local de pruebas tenía las filas
-- en otro orden y no llegó a traslaparse, así que la prueba local pasó sin
-- ejercitar la restricción.
do $$
declare
  v_corte date := date '2025-07-17';
  v_arranque date := date '2013-08-17';
  v_fuente text :=
    ' · Rige desde el 17/07/2025, no desde la fecha en que se capturó: transitorio Primero del '
    || 'decreto publicado en el DOF el 16/07/2025, que entra en vigor al día siguiente de su '
    || 'publicación y lo hace de forma GENERAL para toda la reforma (instrucción 322 de la '
    || 'Célula de Cumplimiento, Nota 4 del 9/09/2026). Corregido por la migration 0075.';
begin
  -- 1º el régimen ANTERIOR, con sus dos extremos a la vez.
  --
  -- `vigente_desde` también se mueve, y hay que decir por qué: la fecha que
  -- traía era la de captura, y dejarla abriría un hueco entre 2013 y 2026 en el
  -- que ningún valor rige — el motor se negaría a evaluar cualquier acto de ese
  -- periodo. Se ancla en la entrada en vigor del Reglamento original, que es lo
  -- más atrás que esta plataforma puede sostener: no reconstruye la historia
  -- completa de la LFPIORPI, y eso queda escrito en la fuente.
  --
  -- Los `where` excluyen lo ya corregido para que volver a correr la migration
  -- no reescriba fechas ni repita la nota en la fuente.
  update parametro_regulatorio
     set vigente_desde = least(vigente_desde, v_arranque),
         vigente_hasta = v_corte,
         fuente = fuente || ' · Vigencia corregida a la fecha de la NORMA por la migration 0075.'
   where unidad = 'uma' and vigente_hasta is not null and vigente_hasta <> v_corte;

  -- 2º el régimen NUEVO, que ahora ya no se traslapa con nada.
  --
  -- La fuente se AÑADE, no se reemplaza: lo que ya traía es la cita del
  -- precepto, que es justo lo que la 0072 pidió no perder.
  update parametro_regulatorio
     set vigente_desde = v_corte,
         fuente = fuente || v_fuente
   where unidad = 'uma' and vigente_hasta is null and vigente_desde > v_corte;
end $$;

-- ---------------------------------------------------------------------
-- 2. El régimen anterior de la fracción XII
-- ---------------------------------------------------------------------
-- Los dos valores que la Nota 3 apartado 3.4 nombra expresamente: «dieciséis
-- mil UMA en inmuebles, ocho mil veinticinco en sociedades».
--
-- Sin `vigente_desde` real de arranque no se puede afirmar desde cuándo regían
-- —son anteriores a la reforma y esta plataforma no reconstruye la historia
-- completa de la LFPIORPI— así que se asienta una fecha de inicio conservadora
-- y se dice en la fuente que es el límite de lo que se puede sostener.
insert into parametro_regulatorio
  (codigo, nombre, valor_numerico, unidad, sector, vigente_desde, vigente_hasta, fuente,
   publicacion_dof, notas)
values
  ('umbral_xii_inmueble_uma',
   'Umbral de Aviso · transmisión de inmueble (régimen anterior)',
   16000, 'uma', 'XII',
   date '2013-08-17', date '2025-07-17',
   'Régimen ANTERIOR a la reforma. Valor citado por la Célula de Cumplimiento en su Nota 3, '
   || 'apartado 3.4: «dieciséis mil UMA en inmuebles». La fecha de inicio es la de entrada en '
   || 'vigor del Reglamento original (17/08/2013) y es lo más atrás que esta plataforma puede '
   || 'sostener: no reconstruye la historia completa de la LFPIORPI.',
   'DOF 17/10/2012 (Ley original)',
   'Umbral de Aviso por transmisión de inmueble antes del 17/07/2025.'),
  ('umbral_xii_persona_moral_uma',
   'Umbral de Aviso · persona moral (régimen anterior)',
   8025, 'uma', 'XII',
   date '2013-08-17', date '2025-07-17',
   'Régimen ANTERIOR a la reforma. Valor citado por la Célula de Cumplimiento en su Nota 3, '
   || 'apartado 3.4: «ocho mil veinticinco en sociedades». Desde el 17/07/2025 la fracción XII '
   || 'apartado A inciso c) obliga al Aviso SIN umbral de monto, así que este parámetro no '
   || 'tiene sucesor: lo que cambió no fue la cifra, fue que dejó de haber cifra.',
   'DOF 17/10/2012 (Ley original)',
   'Umbral de Aviso por constitución o cambio patrimonial de persona moral antes del 17/07/2025.')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. Las reglas dejan de traer el número escrito a mano
-- ---------------------------------------------------------------------
-- `parametro` en vez de `valor`. El motor lo resuelve con la fecha del acto y
-- se NIEGA a evaluar si no hay vigencia que la cubra, en vez de caer al valor
-- de hoy (instrucción 324).
update tipologia_av
   set regla_dsl = jsonb_set(
         regla_dsl,
         '{condicion,suma_monto_uma}',
         jsonb_build_object('op', '>=', 'parametro', 'umbral_xii_inmueble_uma')
       )
 where codigo = 'XII-01'
   and regla_dsl->'condicion'->'suma_monto_uma' ? 'valor';

update tipologia_av
   set regla_dsl = jsonb_set(
         regla_dsl,
         '{condicion,suma_monto_uma}',
         jsonb_build_object('op', '>=', 'parametro', 'umbral_xii_fideicomiso_uma')
       )
 where codigo = 'XII-05'
   and regla_dsl->'condicion'->'suma_monto_uma' ? 'valor';

update tipologia_av
   set regla_dsl = jsonb_set(
         regla_dsl,
         '{condicion,suma_monto_uma}',
         jsonb_build_object('op', '>=', 'parametro', 'umbral_xvi_operacion_uma')
       )
 where codigo = 'XVI-01' and version >= 2
   and regla_dsl->'condicion'->'suma_monto_uma' ? 'valor';

update tipologia_av
   set regla_dsl = jsonb_set(
         regla_dsl,
         '{condicion,contraprestacion_uma}',
         jsonb_build_object('op', '>=', 'parametro', 'umbral_xvi_contraprestacion_uma')
       )
 where codigo = 'XVI-09'
   and regla_dsl->'condicion'->'contraprestacion_uma' ? 'valor';

-- ---------------------------------------------------------------------
-- 4. La regla cuya OBLIGACIÓN cambió, no su cifra
-- ---------------------------------------------------------------------
-- XII-04 es el caso que un parámetro no alcanza a cubrir, y es el más
-- engañoso. Hoy la constitución o el cambio patrimonial de una persona moral
-- genera Aviso SIEMPRE porque la reforma le quitó el umbral. Antes exigía 8,025
-- UMA. Su regla es un `lookup` sin condición monetaria: no hay número que
-- versionar, cambió la obligación entera.
--
-- Sin esto, un acto de 2024 capturado en la Beta produciría un Aviso que ese
-- día no procedía. Con `vigente_desde`, el motor lo rechaza y lo asienta.
--
-- Se le pone a las cuatro reglas de la fracción XII que la reforma tocó, y
-- también a XVI-01: la instrucción 325 dice que NO se pudo confirmar si los
-- montos de la fracción XVI cambiaron, y mientras no conste, medir un acto
-- anterior con el umbral de hoy es exactamente lo que la 324 prohíbe.
update tipologia_av
   set regla_dsl = jsonb_set(regla_dsl, '{vigente_desde}', '"2025-07-17"'::jsonb)
 where codigo in ('XII-01', 'XII-02', 'XII-04', 'XII-05', 'XVI-01')
   and not (regla_dsl ? 'vigente_desde');

-- ---------------------------------------------------------------------
-- 5. Guardas
-- ---------------------------------------------------------------------
do $guarda$
declare
  v_malas text;
  v_n int;
begin
  -- Ninguna regla monetaria de la XII o la XVI puede seguir con el número
  -- escrito a mano.
  select string_agg(codigo || ' v' || version, ', ') into v_malas
    from tipologia_av
   where activa
     and codigo in ('XII-01', 'XII-05', 'XVI-01', 'XVI-09')
     and (regla_dsl->'condicion'->'suma_monto_uma' ? 'valor'
          or regla_dsl->'condicion'->'contraprestacion_uma' ? 'valor');
  if v_malas is not null then
    raise exception 'Reglas con umbral escrito a mano: %. Tienen que apuntar al parámetro para '
      'que el motor las resuelva con la fecha del acto.', v_malas;
  end if;

  -- Y todo parámetro en UMA que apunte una regla tiene que tener vigencia
  -- desde el corte, o antes.
  select count(*) into v_n
    from parametro_regulatorio
   where unidad = 'uma' and vigente_hasta is null and vigente_desde > date '2025-07-17';
  if v_n > 0 then
    raise exception '% parámetros vigentes arrancan después del corte del 17/07/2025: un acto '
      'entre esa fecha y su arranque no se podría medir.', v_n;
  end if;
end $guarda$;
