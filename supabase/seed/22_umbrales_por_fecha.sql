-- =====================================================================
-- Seed 22 · Los umbrales se miden con la fecha del acto
-- =====================================================================
-- La migration 0075 trae el razonamiento completo y lo aplica a la base que ya
-- existe. Este archivo repite el resultado, y no es duplicación por descuido:
-- en un proyecto nuevo las migrations corren ANTES que los seeds, y las
-- tipologías las crean los seeds. Los `update` de la 0075 no encuentran
-- ninguna fila, y las reglas quedarían con el umbral escrito a mano — que es
-- exactamente el defecto que la 0075 corrige.
--
-- Es la tercera vez que esta trampa muerde en este sprint. Va dicho aquí para
-- que la cuarta se vea venir: TODO cambio de datos que toque filas creadas por
-- un seed tiene que vivir también en un seed posterior.
--
-- En corto: la reforma que entró en vigor el 17 de julio de 2025 reescribió
-- los umbrales de la fracción XII —16,000 UMA en inmuebles pasó a 8,000, y en
-- sociedades pasó de 8,025 a ninguno—. Un número escrito dentro de la regla no
-- puede saber eso, así que la regla apunta al parámetro y el motor lo resuelve
-- con la fecha del acto.

-- ---------------------------------------------------------------------
-- 1. Las reglas apuntan al parámetro
-- ---------------------------------------------------------------------
update tipologia_av
   set regla_dsl = jsonb_set(
         regla_dsl, '{condicion,suma_monto_uma}',
         jsonb_build_object('op', '>=', 'parametro', 'umbral_xii_inmueble_uma'))
 where codigo = 'XII-01' and regla_dsl->'condicion'->'suma_monto_uma' ? 'valor';

update tipologia_av
   set regla_dsl = jsonb_set(
         regla_dsl, '{condicion,suma_monto_uma}',
         jsonb_build_object('op', '>=', 'parametro', 'umbral_xii_fideicomiso_uma'))
 where codigo = 'XII-05' and regla_dsl->'condicion'->'suma_monto_uma' ? 'valor';

update tipologia_av
   set regla_dsl = jsonb_set(
         regla_dsl, '{condicion,suma_monto_uma}',
         jsonb_build_object('op', '>=', 'parametro', 'umbral_xvi_operacion_uma'))
 where codigo = 'XVI-01' and version >= 2
   and regla_dsl->'condicion'->'suma_monto_uma' ? 'valor';

update tipologia_av
   set regla_dsl = jsonb_set(
         regla_dsl, '{condicion,contraprestacion_uma}',
         jsonb_build_object('op', '>=', 'parametro', 'umbral_xvi_contraprestacion_uma'))
 where codigo = 'XVI-09' and regla_dsl->'condicion'->'contraprestacion_uma' ? 'valor';

-- ---------------------------------------------------------------------
-- 2. Y las que la reforma tocó declaran desde cuándo rigen
-- ---------------------------------------------------------------------
-- XII-04 es el caso que un parámetro no cubre: hoy la constitución o el cambio
-- patrimonial de una persona moral genera Aviso SIEMPRE, y antes del corte
-- exigía 8,025 UMA. No hay cifra que versionar — cambió la obligación entera.
-- Sin esto, un acto de 2024 capturado en la Beta produciría un Aviso que ese
-- día no procedía.
--
-- XVI-01 la lleva porque la instrucción 325 dice que NO se pudo confirmar si
-- los montos de la fracción XVI cambiaron con la reforma. Mientras no conste,
-- medir un acto anterior con el umbral de hoy es lo que la 324 prohíbe.
update tipologia_av
   set regla_dsl = jsonb_set(regla_dsl, '{vigente_desde}', '"2025-07-17"'::jsonb)
 where codigo in ('XII-01', 'XII-02', 'XII-04', 'XII-05', 'XVI-01')
   and not (regla_dsl ? 'vigente_desde');

-- ---------------------------------------------------------------------
-- 3. Comprobación
-- ---------------------------------------------------------------------
do $comprobar$
declare v_malas text;
begin
  select string_agg(codigo || ' v' || version, ', ') into v_malas
    from tipologia_av
   where activa
     and codigo in ('XII-01', 'XII-05', 'XVI-01', 'XVI-09')
     and (regla_dsl->'condicion'->'suma_monto_uma' ? 'valor'
          or regla_dsl->'condicion'->'contraprestacion_uma' ? 'valor');
  if v_malas is not null then
    raise exception 'Reglas con el umbral escrito a mano: %. Tienen que apuntar al parámetro '
      'para que el motor las resuelva con la fecha del acto.', v_malas;
  end if;

  -- Y que el parámetro al que apuntan exista: una regla que apunta a un
  -- parámetro inexistente no se equivoca de umbral, deja de evaluar del todo.
  select string_agg(t.codigo || ' → ' || x.param, ', ') into v_malas
    from tipologia_av t
    cross join lateral (
      select coalesce(
               t.regla_dsl->'condicion'->'suma_monto_uma'->>'parametro',
               t.regla_dsl->'condicion'->'contraprestacion_uma'->>'parametro') as param
    ) x
   where t.activa and x.param is not null
     and not exists (select 1 from parametro_regulatorio p where p.codigo = x.param);
  if v_malas is not null then
    raise exception 'Reglas que apuntan a un parámetro inexistente: %', v_malas;
  end if;
end $comprobar$;
