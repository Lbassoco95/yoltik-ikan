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
-- Las dos fuentes de PPE · la que no se puede pedir y la que sí
-- ---------------------------------------------------------------------
-- Este bloque contestaba la instrucción 240 con un «falta resolver de dónde
-- se obtiene». La Nota 3 del 8/09/2026 lo resolvió, y la migration 0069 lleva
-- el razonamiento completo. Aquí queda el resultado, porque en un proyecto
-- nuevo los seeds corren DESPUÉS de las migraciones y este archivo tiene la
-- última palabra: si dijera lo de antes, volvería a poner `ppe_oficial` en
-- `pendiente` y desharía la 0069 en silencio.
--
-- En corto: el art. 45 Bis del Reglamento prohíbe entregar la Lista de PPE de
-- la UIF a cualquier persona u organismo, así que no hay trámite que pedir; y
-- el art. 2 fr. IV remite, para definir qué es una PPE, al catálogo de cargos
-- de la disposición 68ª de las Disposiciones del art. 115 LIC, que es público
-- y sí se puede cargar. Una se determina cerrada, la otra entra a cargarse.
insert into lista_fuente (
  codigo, nombre, autoridad, naturaleza, modo_actualizacion,
  url_oficial, frecuencia_objetivo, obligatoria, activa,
  efecto, determinacion, fundamento_determinacion, notas,
  determinado_por
) values (
  'ppe_oficial',
  'Lista de Personas Políticamente Expuestas de la UIF',
  'Unidad de Inteligencia Financiera',
  'pep',
  'snapshot',
  null,
  'NO APLICA · la fuente no se puede obtener',
  false,
  -- activa = true: la columna gatea el barrido Y la pantalla, y esta fuente
  -- tiene que verse. Con cero registros no afirma nada en un barrido.
  true,
  null,
  'no_disponible',
  'Art. 45 Bis del Reglamento: la Lista de Personas Políticamente Expuestas integrada '
  || 'por la UIF conforme al art. 51 Ter, segundo párrafo de la Ley, no puede ser '
  || 'compartida «con ninguna persona, autoridad u organismo nacional o internacional» '
  || 'cuando esté clasificada como reservada o confidencial. La única excepción son los '
  || 'órganos desconcentrados supervisores de la Secretaría, previo convenio, y un sujeto '
  || 'obligado no está en ese supuesto. Célula de Cumplimiento Kawiil, Nota 3 del '
  || '8/09/2026, instrucción 304.',
  'La obligación de determinar si el cliente es PPE NO desaparece: sigue viva por el '
  || 'art. 18 fracciones VIII y X. Se cumple por el catálogo de cargos '
  || '(`ppe_cargos_68a`), que se contrasta siempre contra el cargo declarado, y '
  || 'subsidiariamente por la consulta del art. 45 Ter —potestativa, de finalidad única, '
  || 'y sólo cuando ya identificada y verificada la persona no se pueda determinar—. Esa '
  || 'consulta va por «el medio electrónico que para tal efecto establezca» la UIF, que '
  || 'al 8/09/2026 no se localizó (instrucción 307).',
  'Célula de Cumplimiento Kawiil · Nota 3, 8/09/2026'
)
on conflict (codigo) do update set
  nombre = excluded.nombre,
  autoridad = excluded.autoridad,
  naturaleza = excluded.naturaleza,
  frecuencia_objetivo = excluded.frecuencia_objetivo,
  obligatoria = excluded.obligatoria,
  activa = excluded.activa,
  efecto = excluded.efecto,
  determinacion = excluded.determinacion,
  fundamento_determinacion = excluded.fundamento_determinacion,
  notas = excluded.notas,
  determinado_por = excluded.determinado_por;

-- El catálogo de cargos. `eleva_diligencia` y no `impedimento`: ser PPE no
-- impide operar ni es hallazgo de nada — dispara el régimen reforzado que la
-- Adenda 6 ya construyó. Tratarlo como impedimento sería negar servicio por
-- ejercer un cargo público.
insert into lista_fuente (
  codigo, nombre, autoridad, naturaleza, modo_actualizacion,
  url_oficial, frecuencia_objetivo, obligatoria, activa,
  efecto, determinacion, fundamento_determinacion, notas,
  determinado_por
) values (
  'ppe_cargos_68a',
  'Catálogo de cargos públicos considerados PPE (disposición 68ª)',
  'CNBV · Disposiciones de carácter general art. 115 LIC',
  'pep',
  'snapshot',
  null,
  'Al cambio de la disposición. No es una lista de personas: es una lista de puestos, '
  || 'y cambia con la norma, no con los nombramientos.',
  true,
  true,
  'eleva_diligencia',
  'aplica',
  'Art. 2 fracción IV del Reglamento: define la Lista de Personas Políticamente '
  || 'Expuestas como la elaborada con base en la lista de cargos públicos de la '
  || 'disposición 68ª de las Disposiciones de carácter general a que se refiere el '
  || 'artículo 115 de la Ley de Instituciones de Crédito. La remisión la hace el '
  || 'Reglamento de la LFPIORPI, así que la fuente no es ajena por ser del régimen '
  || 'financiero. Célula de Cumplimiento Kawiil, Nota 3 del 8/09/2026, instrucción 305.',
  'PENDIENTE DE CARGA, no de determinación. La Nota 3 dice expresamente que no extrajo '
  || 'la lista de cargos («Corresponde obtenerlo de la propia disposición y versionarlo '
  || 'como cualquier otra fuente»). No se cotejan nombres: se contrasta contra el CARGO '
  || 'que declare el compareciente, y por eso el barrido por nombre no la usa.',
  'Célula de Cumplimiento Kawiil · Nota 3, 8/09/2026'
)
on conflict (codigo) do update set
  nombre = excluded.nombre,
  autoridad = excluded.autoridad,
  naturaleza = excluded.naturaleza,
  frecuencia_objetivo = excluded.frecuencia_objetivo,
  obligatoria = excluded.obligatoria,
  activa = excluded.activa,
  efecto = excluded.efecto,
  determinacion = excluded.determinacion,
  fundamento_determinacion = excluded.fundamento_determinacion,
  notas = excluded.notas,
  determinado_por = excluded.determinado_por;

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
