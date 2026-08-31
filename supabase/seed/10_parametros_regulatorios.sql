-- =====================================================================
-- Seed · Parámetros regulatorios (catálogo de plataforma)
-- =====================================================================
-- Requiere la migration 0011.
--
-- Idempotente por `where not exists`: la tabla tiene restricción de
-- EXCLUSIÓN (no de unicidad), y `on conflict` no opera sobre exclusiones.
--
-- TODOS los NULL van casteados. En una lista VALUES, PostgreSQL infiere el
-- tipo de cada columna a partir de las filas; si TODAS las filas traen NULL sin
-- tipo, la infiere como `text` y el insert truena contra una columna `date`:
--   ERROR: column "confirmado_en" is of type date but expression is of type text
-- Pasó de verdad al aplicar este seed. El casteo explícito también evita que
-- reordenar las filas cambie la inferencia.
--
-- REGLA: no se siembra ninguna cifra sin fuente. Las que Kawiil-Cumplimiento
-- todavía no valida se siembran con `confirmado_por = null`, y la UI las
-- marca como referencia. Sembrarlas sin marca sería peor que no tenerlas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- UMA — publicada por INEGI, con vigencia del 1 de febrero al 31 de enero
-- ---------------------------------------------------------------------
-- Corrige el error que traía el repo: había 113.07 en el código (el valor de
-- 2025 mal transcrito; el real fue 113.14) y 132.59 en el mock que veía el
-- usuario, sin respaldo. El motor calculaba los umbrales por debajo del real.
insert into parametro_regulatorio
  (codigo, nombre, valor_numerico, unidad, sector, vigente_desde, vigente_hasta,
   fuente, publicacion_dof, url_fuente, confirmado_por, confirmado_en, notas)
select * from (values
  ('uma_diaria', 'UMA · valor diario 2025', 113.1400, 'mxn', '*',
   date '2025-02-01', date '2026-02-01',
   'INEGI · Unidad de Medida y Actualización',
   'DOF · valores UMA 2025', 'https://www.inegi.org.mx/temas/uma/',
   null::text, null::date,
   'Valor histórico. Se conserva para poder recalcular actos de 2025 con la UMA que les correspondía.'),

  ('uma_diaria', 'UMA · valor diario 2026', 117.3100, 'mxn', '*',
   date '2026-02-01', null::date,
   'INEGI · comunicado de prensa 1/26 del 8 de enero de 2026',
   'DOF 09/01/2026', 'https://www.inegi.org.mx/temas/uma/',
   null::text, null::date,
   'Vigencia 1 feb 2026 – 31 ene 2027. Incremento de 3.69% sobre los 113.14 de 2025, por variación anual del INPC a diciembre de 2025. Verificado contra fuentes secundarias coincidentes; falta el visto bueno formal de Kawiil-Cumplimiento contra el DOF.')
) as v(codigo, nombre, valor_numerico, unidad, sector, vigente_desde, vigente_hasta,
       fuente, publicacion_dof, url_fuente, confirmado_por, confirmado_en, notas)
where not exists (
  select 1 from parametro_regulatorio p
  where p.codigo = v.codigo and p.sector = v.sector and p.vigente_desde = v.vigente_desde
);

-- ---------------------------------------------------------------------
-- Umbrales generales
-- ---------------------------------------------------------------------
-- Se trasladan tal cual venían en el código (src/lib/utils.ts y
-- OperationsPage), conservando la cita que ya traía el repo. NO se cambia su
-- alcance: seguían aplicándose a todas las actividades, así que entran como
-- sector '*'. Si Kawiil-Cumplimiento determina que son específicos de una
-- fracción, se corrige con una fila por sector, que gana sobre la global.
--
-- `vigente_desde` se fija al inicio del ejercicio en curso, NO a la fecha de
-- entrada en vigor de la ley, porque esa fecha no está documentada en el repo
-- y no se inventa. Se corrige cuando Kawiil-Cumplimiento la confirme.
insert into parametro_regulatorio
  (codigo, nombre, valor_numerico, unidad, sector, vigente_desde,
   fuente, confirmado_por, notas)
select * from (values
  -- La reforma DOF 16/07/2025 reescribió la fracción XVI: 645 UMA de
  -- identificación y 3,210 de Aviso ya no existen en el texto vigente. Los
  -- sustituyen 210 UMA por operación y 4 UMA sobre la contraprestación.
  ('umbral_xvi_operacion_uma',
   'Operación de intercambio de activos virtuales por cliente · umbral de Aviso',
   210.0000, 'uma', 'XVI',
   date '2025-07-17', 'Art. 17 fr. XVI inciso a) LFPIORPI, reforma DOF 16/07/2025. Criterio Kawiil-Cumplimiento 31/08/2026.', null::text,
   'Confirmado en Ley, PENDIENTE DE COTEJO contra el folleto oficial del SAT de la fracción XVI.'),

  ('umbral_xvi_contraprestacion_uma',
   'Contraprestación cobrada por el servicio · umbral de Aviso',
   4.0000, 'uma', 'XVI',
   date '2025-07-17', 'Art. 17 fr. XVI inciso b) LFPIORPI, reforma DOF 16/07/2025. Criterio Kawiil-Cumplimiento 31/08/2026.', null::text,
   'Se mide sobre la COMISIÓN cobrada, no sobre el monto de la operación. Son $469.24 con la UMA de 2026: en la práctica un umbral cercano a cero. Confirmado en Ley, pendiente de cotejo.'),

  ('umbral_xii_fideicomiso_uma',
   'Constitución o modificación de fideicomisos traslativos o de garantía · umbral de Aviso',
   4000.0000, 'uma', 'XII',
   date '2025-07-17', 'Art. 17 fr. XII apartado A inciso d) LFPIORPI, reforma DOF 16/07/2025. Informe técnico Kawiil-Cumplimiento 31/08/2026.', null::text,
   'La reforma bajó el umbral de 8,025 a 4,000 UMA y suprimió la limitación a inmuebles.'),

  -- Art. 32, prohibición de efectivo. NO son umbrales de Aviso y no deben
  -- unificarse con ellos: el de Aviso para inmuebles es 8,000 UMA y el de
  -- efectivo 8,025. La asimetría es deliberada y el informe la advierte.
  ('umbral_efectivo_inmueble_uma', 'Prohibición de pago en efectivo · inmuebles',
   8025.0000, 'uma', 'XII',
   date '2025-07-17', 'Art. 32 LFPIORPI, reforma DOF 16/07/2025. Informe técnico Kawiil-Cumplimiento 31/08/2026.', null::text,
   'Se mide con la UMA vigente AL DÍA DEL PAGO, no a la fecha del instrumento.'),

  ('umbral_efectivo_acciones_uma', 'Prohibición de pago en efectivo · acciones y partes sociales',
   3210.0000, 'uma', 'XII',
   date '2025-07-17', 'Art. 32 LFPIORPI, reforma DOF 16/07/2025. Informe técnico Kawiil-Cumplimiento 31/08/2026.', null::text,
   'Se mide con la UMA vigente al día del pago. El fedatario debe identificar la forma de pago y dejar constancia.')

  -- NO se siembra umbral_xii_persona_moral_uma. Tras la reforma DOF 16/07/2025
  -- la constitución de personas morales, el cambio patrimonial, la fusión, la
  -- escisión y la compraventa de acciones son SIEMPRE objeto de Aviso: no hay
  -- cifra que poner. El supuesto lo resuelve la tipología XII-04, no un umbral.
  -- Sembrar 0 UMA sería una forma rebuscada de decir «siempre» que el primero
  -- que la leyera tomaría por un error.
) as v(codigo, nombre, valor_numerico, unidad, sector, vigente_desde,
       fuente, confirmado_por, notas)
where not exists (
  select 1 from parametro_regulatorio p
  where p.codigo = v.codigo and p.sector = v.sector and p.vigente_desde = v.vigente_desde
);
