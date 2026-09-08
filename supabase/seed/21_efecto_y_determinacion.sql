-- =====================================================================
-- Seed 13 · Qué produce cada lista y si ya se sabe que aplica
-- =====================================================================
-- Los valores los fijó Kawiil-Cumplimiento en su respuesta del 8 de septiembre
-- de 2026 (puntos 1.2, 1.3, 1.4, 1.5, 2.2 y apartado 5). Ninguno se deduce
-- aquí: cada uno lleva el fundamento con el que llegó.
--
-- Va en un seed y no en la migration 0066 a propósito. Las migrations corren
-- ANTES que los seeds, así que un `update lista_fuente` dentro de la migration
-- no encontraría ninguna fila en un proyecto nuevo y se aplicaría en silencio a
-- cero registros. Es una falla que esta base ya tuvo y no se repite.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ONU · impedimento
-- ---------------------------------------------------------------------
-- «Las resoluciones del Consejo de Seguridad vinculan a México, y una
--  coincidencia confirmada contra la Lista Consolidada es un impedimento, no
--  un factor de riesgo.»
update lista_fuente set
  efecto = 'impedimento',
  determinacion = 'aplica',
  fundamento_determinacion =
    'Las resoluciones del Consejo de Seguridad de la ONU vinculan a México. '
    || 'Determinado por Kawiil-Cumplimiento el 08/09/2026, punto 1.3.',
  determinado_por = 'Kawiil · Célula de Cumplimiento',
  determinado_en = '2026-09-08',
  -- Corrección de la propia respuesta: el XML por número de referencia
  -- permanente, no el alfabético. El orden alfabético cambia con cada alta y
  -- no sirve como clave estable (instrucción 243).
  url_oficial = 'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
  notas = 'Impedimento. El identificador estable es el número de referencia permanente; '
       || 'NO usar el XML alfabético. Cifra de control para la primera carga, al 04/09/2026: '
       || '736 individuos y 275 entidades (instrucción 244).'
where codigo = 'onu_consolidada';

-- ---------------------------------------------------------------------
-- OFAC · eleva la diligencia, NO impide
-- ---------------------------------------------------------------------
-- «Es derecho extranjero y un fedatario mexicano no es U.S. person. Su valor
--  es indiciario y por exposición a sanciones secundarias y a relaciones de
--  corresponsalía. No impide operar y no puede presentarse en pantalla como
--  impedimento legal.»
update lista_fuente set
  efecto = 'eleva_diligencia',
  determinacion = 'aplica',
  fundamento_determinacion =
    'Derecho extranjero: un fedatario mexicano no es U.S. person. Valor indiciario por '
    || 'exposición a sanciones secundarias y a relaciones de corresponsalía. Adenda 3, '
    || 'confirmado por Kawiil-Cumplimiento el 08/09/2026, punto 1.2.',
  determinado_por = 'Kawiil · Célula de Cumplimiento',
  determinado_en = '2026-09-08',
  url_oficial = 'https://sanctionslist.ofac.treas.gov/',
  notas = 'Eleva la diligencia y exige revisión documentada; NUNCA se presenta como '
       || 'impedimento legal. El identificador es el del propio registro de OFAC, nunca la '
       || 'posición en el archivo ni el nombre traducido.'
where codigo = 'ofac_sdn';

-- ---------------------------------------------------------------------
-- Unión Europea · dato, sin obligación
-- ---------------------------------------------------------------------
-- «No hay norma que obligue a un sujeto obligado mexicano a aplicar medidas
--  restrictivas de la Unión Europea. Se documenta como fuente disponible y una
--  coincidencia se registra como dato del expediente sin efecto automático.»
update lista_fuente set
  efecto = 'dato',
  obligatoria = false,
  determinacion = 'no_aplica',
  fundamento_determinacion =
    'No existe norma que obligue a un sujeto obligado mexicano a aplicar medidas '
    || 'restrictivas de la UE. Determinado por Kawiil-Cumplimiento el 08/09/2026, punto 1.4.',
  determinado_por = 'Kawiil · Célula de Cumplimiento',
  determinado_en = '2026-09-08'
where codigo = 'ue_sanciones';

-- ---------------------------------------------------------------------
-- SAT 69-B · el efecto depende de la situación
-- ---------------------------------------------------------------------
-- Tabla del punto 2.2. El presunto deja de ser un dato inerte: eleva la
-- diligencia sin presentarse nunca como hallazgo confirmado (instrucción 251).
update lista_fuente set
  efectos_por_situacion = jsonb_build_object(
    'definitivo',          'impedimento',
    'presunto',            'eleva_diligencia',
    'desvirtuado',         'dato',
    'sentencia_favorable', 'dato'
  ),
  determinacion = 'aplica',
  fundamento_determinacion =
    'Artículo 69-B del CFF. Efecto por situación fijado por Kawiil-Cumplimiento el '
    || '08/09/2026, punto 2.2: sólo el definitivo impide; el presunto eleva la diligencia '
    || 'con revisión documentada; desvirtuado y sentencia favorable son dato del expediente.',
  determinado_por = 'Kawiil · Célula de Cumplimiento',
  determinado_en = '2026-09-08'
where codigo = 'sat_69b';

update lista_fuente set
  efectos_por_situacion = jsonb_build_object(
    'definitivo',          'impedimento',
    'sentencia_favorable', 'dato'
  ),
  determinacion = 'aplica',
  fundamento_determinacion =
    'Artículo 69-B Bis del CFF. Su procedimiento sólo publica definitivos y sentencias '
    || 'favorables. Mismo criterio de efecto que el 69-B, Kawiil-Cumplimiento 08/09/2026.',
  determinado_por = 'Kawiil · Célula de Cumplimiento',
  determinado_en = '2026-09-08'
where codigo = 'sat_69b_bis';

-- ---------------------------------------------------------------------
-- UIF · pendiente de DETERMINACIÓN, que no es lo mismo que pendiente de carga
-- ---------------------------------------------------------------------
-- Instrucción 238. Cumplimiento no da por supuesto que un sujeto obligado del
-- artículo 17 deba consultar la Lista de Personas Bloqueadas: es un
-- instrumento del régimen financiero, y la cita al «artículo 18 fracción V»
-- corresponde, en el texto anterior, a brindar facilidades para las visitas de
-- verificación. Puede ser correcta tras la renumeración de la reforma del
-- 16/07/2025 o puede no serlo.
--
-- Hasta que eso se resuelva, la fuente NO dice «0 registros» —que sugeriría
-- que sólo falta un archivo— sino que está en determinación.
update lista_fuente set
  efecto = null,
  determinacion = 'pendiente',
  fundamento_determinacion =
    'PENDIENTE DE DETERMINAR (instrucción 239, de Kawiil-Cumplimiento): (a) si la '
    || 'obligación de consultarla existe para Actividades Vulnerables del art. 17, siendo '
    || 'la Lista de Personas Bloqueadas un instrumento del régimen financiero; (b) cuál es '
    || 'el artículo vigente tras la renumeración del 16/07/2025 —la cita al 18 fr. V '
    || 'corresponde en el texto anterior a las visitas de verificación—; y (c) cómo se '
    || 'obtiene legítimamente, porque si se comunica por oficio a sujetos determinados no '
    || 'existe un histórico que nadie pueda entregar.',
  notas = 'El formato de captura por oficio que propuso la plataforma queda APROBADO desde '
       || 'ya, condicionado a que la obligación exista: un renglón por persona y por oficio, '
       || 'con la fecha del oficio y no la de captura. Si la determinación resulta positiva, '
       || 'se carga el histórico completo: un corte arbitrario produce un estado falso.'
       || ' | HABILITACIÓN: esta fuente se aprovisiona por organización DESPUÉS de la '
       || 'contratación, no viene cargada de fábrica: los oficios de la UIF se dirigen a '
       || 'sujetos obligados determinados. Hasta entonces la organización la ve como pendiente. '
       || 'Es también la única fuente hecha a mano que queda, tras retirar la lista interna.'
where codigo = 'uif_bloqueadas';

-- ---------------------------------------------------------------------
-- Lista interna · retirada del catálogo
-- ---------------------------------------------------------------------
-- Decisión de producto (Polo, 08/09/2026): su mecanismo es el mismo que el de
-- la Lista de Personas Bloqueadas —captura a mano, un movimiento por acto, con
-- alcance por organización— y tener dos entradas para el mismo flujo
-- confundía. Se queda una: la de la UIF.
--
-- Se DESACTIVA, no se borra. La regla de esta base es que una baja conserva el
-- rastro, y aquí además conserva el contrato por si se rehabilita.
--
-- AVISO para quien la rehabilite, y es la razón por la que no se fusionan: el
-- rechazo propio de una organización NO es lo mismo que un oficio de la UIF, y
-- no debe capturarse en la fuente de la UIF. `listado_en_fecha()` es evidencia:
-- si se mezclan, el expediente diría que la AUTORIDAD tenía bloqueada a una
-- persona cuando lo que pasó es que la notaría la rechazó por su cuenta. Son
-- dos afirmaciones distintas y una de ellas sería falsa.
update lista_fuente set
  activa = false,
  efecto = null,
  determinacion = 'no_aplica',
  fundamento_determinacion =
    'Retirada del catálogo por decisión de producto (Polo, 08/09/2026): mismo mecanismo que '
    || 'la Lista de Personas Bloqueadas de la UIF. Se conserva la fila para no perder el '
    || 'contrato si se rehabilita.',
  notas =
    'DESACTIVADA. El rechazo propio de una organización NO es un oficio de la UIF y no debe '
    || 'capturarse en esa fuente: listado_en_fecha() es evidencia y mezclarlos haría que el '
    || 'expediente afirmara algo falso sobre la autoridad.'
where codigo = 'interna';

-- ---------------------------------------------------------------------
-- La sexta fuente que faltaba · listado oficial de PPE
-- ---------------------------------------------------------------------
-- Instrucción 240. Cumplimiento: «es la única de todas cuya obligación nació
-- con la reforma que estamos implementando, y el tratamiento de PPE ya está
-- construido en la Adenda 6».
--
-- `modo_actualizacion` va como 'snapshot' de forma PROVISIONAL: la columna no
-- admite nulo y todavía no se sabe cómo publica la autoridad. Queda dicho en
-- las notas para que nadie lo lea como un hecho establecido.
insert into lista_fuente (
  codigo, nombre, autoridad, naturaleza, modo_actualizacion,
  url_oficial, frecuencia_objetivo, obligatoria, activa,
  efecto, determinacion, fundamento_determinacion, notas
) values (
  'ppe_oficial',
  'Listado oficial de Personas Políticamente Expuestas',
  'Autoridad por determinar',
  'pep',
  'snapshot',
  null,
  'PENDIENTE_CONFIRMAR (sujeto a la determinación de si el listado está publicado)',
  true,
  true,
  null,
  'pendiente',
  'PENDIENTE DE DETERMINAR (instrucción 240): la reforma introdujo la definición legal de '
  || 'Persona Políticamente Expuesta y previó un listado oficial de cargos. Falta resolver '
  || 'si ya está publicado, quién lo emite y de dónde se obtiene. Se resuelve junto con la '
  || 'de la UIF porque es el mismo tipo de pregunta.',
  'El tratamiento de PPE ya está construido (Adenda 6): seguimiento reforzado y PPE '
  || 'extranjera siempre de riesgo alto con aprobación de directivos. Lo que falta es la '
  || 'fuente de cargos. `modo_actualizacion` = snapshot es PROVISIONAL: no se sabe cómo '
  || 'publica la autoridad.'
)
on conflict (codigo) do update set
  nombre = excluded.nombre,
  naturaleza = excluded.naturaleza,
  determinacion = excluded.determinacion,
  fundamento_determinacion = excluded.fundamento_determinacion,
  notas = excluded.notas;

-- ---------------------------------------------------------------------
-- Comprobación: ninguna fuente activa puede quedar sin declarar
-- ---------------------------------------------------------------------
-- Una fuente que ni declara efecto ni está en determinación es un hueco
-- silencioso: produciría coincidencias que nadie sabe cómo tratar.
do $comprobar$
declare v_malas text;
begin
  select string_agg(codigo, ', ') into v_malas
  from lista_fuente
  where activa
    and efecto is null
    and efectos_por_situacion is null
    and determinacion = 'aplica';

  if v_malas is not null then
    raise exception
      'Estas fuentes aplican pero no declaran qué produce una coincidencia: %. '
      'Declara su efecto o márcalas como pendientes de determinación.', v_malas;
  end if;
end
$comprobar$;
