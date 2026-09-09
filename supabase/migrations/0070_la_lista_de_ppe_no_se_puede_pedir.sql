-- =====================================================================
-- 0070 · La Lista de PPE no se puede pedir, y el catálogo de cargos sí
-- =====================================================================
-- Cierra las instrucciones 304, 305 y 307 de la Nota 3 de la Célula de
-- Cumplimiento (8 de septiembre de 2026). El valor `no_disponible` del enum
-- lo agrega la 0069, que va aparte porque Postgres no deja usar un valor de
-- enum en la misma transacción en que se crea.
--
-- La 0066 dejó `ppe_oficial` en `pendiente` con esta nota escrita: «Falta
-- resolver si ya está publicado, quién lo emite y de dónde se obtiene». La
-- respuesta llegó y no es la que se esperaba: no se obtiene de ninguna parte.
--
--   Reglamento, artículo 45 Bis. «…la información que, en su caso, sea
--   clasificada como reservada o confidencial no podrá ser compartida con
--   ninguna persona, autoridad u organismo nacional o internacional.»
--
-- La única excepción son los órganos supervisores de la Secretaría, previo
-- convenio. Un sujeto obligado no está en ese supuesto y no hay trámite que
-- lo ponga ahí.
--
-- Eso obliga a un cuarto valor de determinación, y no es un lujo de
-- taxonomía. Los tres que había dicen cosas que aquí serían falsas:
--
--   · `pendiente` diría que nadie ha resuelto. Ya se resolvió, con cita.
--   · `no_aplica` diría que la obligación no nos vincula. Nos vincula: hay
--     que determinar si el cliente es PPE, y el artículo 18 fracción VIII
--     no admite «no pude».
--   · `aplica` diría que la fuente se puede tener, y prometería una carga
--     que la ley prohíbe.
--
-- `no_disponible` dice lo único que es cierto: la obligación existe, la
-- fuente no se puede obtener, y se cumple por otra vía. Dejarlo en
-- `pendiente` habría sido peor que un hueco: habría mandado a alguien a
-- buscar durante semanas un trámite que no existe, que es exactamente lo que
-- la nota pide evitar.
--
-- La otra vía existe y es el hallazgo útil de la nota. El artículo 2 fracción
-- IV del Reglamento define la Lista de PPE como la elaborada con base en la
-- lista de cargos públicos de la disposición 68ª de las Disposiciones de
-- carácter general del artículo 115 de la Ley de Instituciones de Crédito.
-- Es decir: el catálogo de cargos no está por publicarse. Ya vive en la
-- normativa bancaria, es público, y se puede cargar. Que la fuente sea del
-- régimen financiero no la vuelve ajena — el Reglamento de nuestra propia ley
-- remite a ella.
--
-- Así que entra como fuente propia, en `pendiente_carga`: la pantalla ya
-- distingue el hueco que se llena con un archivo del que necesita una
-- determinación, y éste es de los primeros.

-- ---------------------------------------------------------------------
-- 1. El estado que produce
-- ---------------------------------------------------------------------
-- Se llama `via_no_disponible` y no `no_disponible` porque lo que no está
-- disponible es el CAMINO para obtener la fuente, no la fuente en abstracto.
-- La instrucción 307 pide decirlo en pantalla como lo que es, y el nombre del
-- estado es lo primero que alguien lee cuando depura.
create or replace function public.estado_de_fuente(p_fuente text)
returns text
language sql
stable
set search_path = public
as $estado$
  select case
    when f.determinacion = 'pendiente' then 'pendiente_determinacion'
    when f.determinacion = 'no_aplica' then 'no_aplica'
    when f.determinacion = 'no_disponible' then 'via_no_disponible'
    when exists (select 1 from lista_registro r
                  where r.fuente_id = f.id and r.activo) then 'cargada'
    else 'pendiente_carga'
  end
  from lista_fuente f where f.codigo = p_fuente
$estado$;

comment on function public.estado_de_fuente(text) is
  'cargada · pendiente_carga · pendiente_determinacion · no_aplica · '
  'via_no_disponible. Las tres que no son «cargada» se resuelven distinto y por '
  'eso se distinguen: una bajando un archivo, otra con una determinación '
  'jurídica que nadie ha hecho, y la tercera con nada — la ley prohíbe entregar '
  'la fuente y el cumplimiento va por otro camino.';

-- ---------------------------------------------------------------------
-- 2. La Lista de PPE: determinada, y no se puede pedir
-- ---------------------------------------------------------------------
-- Se conserva la fila en vez de borrarla. Que una fuente concebible NO se
-- pueda obtener es un hecho que hay que poder mostrar y fundar en una
-- verificación; borrarla dejaría el mismo silencio que había antes de la
-- 0066, y el siguiente en preguntarse por la lista de la UIF volvería a
-- gastar el tiempo que esta nota acaba de ahorrar.
update lista_fuente set
  nombre = 'Lista de Personas Políticamente Expuestas de la UIF',
  autoridad = 'Unidad de Inteligencia Financiera',
  determinacion = 'no_disponible',
  -- `activa` se queda en true a propósito, y no es un descuido. La columna
  -- gatea dos cosas a la vez: el barrido (`coincidencias_en_listas`) y la
  -- pantalla (`v_listas_estado`), las dos con `where f.activa`. Apagarla
  -- sacaría la fuente del barrido —correcto, aunque con cero registros no
  -- podría afirmar nada de todos modos— pero también la sacaría de la
  -- pantalla, y ahí volvería el hueco silencioso que la 0066 vino a cerrar:
  -- nadie vería que la Lista de PPE existe, que no se puede pedir, ni por
  -- qué. La instrucción 307 pide justo lo contrario.
  activa = true,
  obligatoria = false,
  efecto = null,
  modo_actualizacion = 'snapshot',
  frecuencia_objetivo = 'NO APLICA · la fuente no se puede obtener',
  fundamento_determinacion =
    'Art. 45 Bis del Reglamento: la Lista de Personas Políticamente Expuestas '
    || 'integrada por la UIF conforme al art. 51 Ter, segundo párrafo de la Ley, no '
    || 'puede ser compartida «con ninguna persona, autoridad u organismo nacional o '
    || 'internacional» cuando esté clasificada como reservada o confidencial. La única '
    || 'excepción son los órganos desconcentrados supervisores de la Secretaría, previo '
    || 'convenio, y un sujeto obligado no está en ese supuesto. No hay trámite que '
    || 'habilite la solicitud: no es que falte el trámite, es que está prohibido '
    || 'entregarla. Determinado por la Célula de Cumplimiento Kawiil, Nota 3 del '
    || '8/09/2026, instrucción 304.',
  notas =
    'La obligación de determinar si el cliente es PPE NO desaparece: sigue viva por el '
    || 'art. 18 fracciones VIII y X. Se cumple por otras dos vías, y conviene no '
    || 'confundirlas porque una se carga y la otra se pregunta. (1) El catálogo de cargos '
    || 'de la disposición 68ª —fuente `ppe_cargos_68a` de este mismo catálogo—, que se '
    || 'contrasta SIEMPRE contra el cargo que declare el compareciente. (2) La consulta '
    || 'del art. 45 Ter, que es subsidiaria (sólo después de identificar y verificar, y '
    || 'sólo si aun así no se puede determinar), potestativa («podrán») y de finalidad '
    || 'única declarada en la norma. Esa consulta se hace «a través del medio electrónico '
    || 'que para tal efecto establezca» la UIF, y al 8/09/2026 no se localizó disposición '
    || 'que fije plazo para establecerlo ni evidencia de que exista — conclusión por '
    || 'ausencia de hallazgo, no por constancia de inexistencia (instrucción 307).',
  determinado_por = 'Célula de Cumplimiento Kawiil · Nota 3, 8/09/2026',
  determinado_en = now()
where codigo = 'ppe_oficial';

-- ---------------------------------------------------------------------
-- 3. El catálogo de cargos, que sí existe y sí se carga
-- ---------------------------------------------------------------------
-- `obligatoria` = true y `determinacion` = 'aplica': el Reglamento de nuestra
-- ley remite a esta disposición para definir qué es una PPE, así que no es
-- una fuente de cortesía.
--
-- El efecto es `eleva_diligencia` y NO `impedimento`, y la distinción importa:
-- ser Persona Políticamente Expuesta no es un impedimento para operar ni un
-- hallazgo de nada. Es el disparador del régimen reforzado que la Adenda 6 ya
-- construyó. Tratarlo como impedimento sería negar servicio por ejercer un
-- cargo público, que además de ilegal es exactamente lo contrario de lo que
-- pide el estándar.
insert into lista_fuente (
  codigo, nombre, autoridad, naturaleza, modo_actualizacion,
  url_oficial, frecuencia_objetivo, obligatoria, activa,
  efecto, determinacion, fundamento_determinacion, notas,
  determinado_por, determinado_en
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
    || 'Expuestas como la elaborada con base en la lista de cargos públicos a la que '
    || 'hace referencia la disposición 68ª de las Disposiciones de carácter general a '
    || 'que se refiere el artículo 115 de la Ley de Instituciones de Crédito, y sus '
    || 'correlativas para las demás Entidades Financieras. La remisión la hace el '
    || 'Reglamento de la LFPIORPI, así que la fuente no es ajena por ser del régimen '
    || 'financiero. Determinado por la Célula de Cumplimiento Kawiil, Nota 3 del '
    || '8/09/2026, instrucción 305.',
  'PENDIENTE DE CARGA, no de determinación: la determinación está hecha y lo que falta '
    || 'es el contenido. La Nota 3 dice expresamente que no extrajo la lista de cargos '
    || '(«Corresponde obtenerlo de la propia disposición y versionarlo como cualquier '
    || 'otra fuente»), así que hay que sacarla del texto de la disposición 68ª y cargarla '
    || 'versionada. No es una lista de personas y no se cotejan nombres: se contrasta '
    || 'contra el CARGO que declare el compareciente, y por eso el barrido por nombre no '
    || 'la usa. Una coincidencia no impide operar — dispara el régimen reforzado de la '
    || 'Adenda 6, que ya está construido.',
  'Célula de Cumplimiento Kawiil · Nota 3, 8/09/2026',
  now()
)
on conflict (codigo) do update set
  nombre = excluded.nombre,
  autoridad = excluded.autoridad,
  efecto = excluded.efecto,
  determinacion = excluded.determinacion,
  fundamento_determinacion = excluded.fundamento_determinacion,
  notas = excluded.notas,
  determinado_por = excluded.determinado_por,
  determinado_en = excluded.determinado_en;

-- ---------------------------------------------------------------------
-- 4. Que la vista lo muestre
-- ---------------------------------------------------------------------
-- La vista llama a `estado_de_fuente`, que ya cambió, así que no hay que
-- recrearla. Pero sí conviene comprobar que ninguna fuente activa con
-- determinación `aplica` se quedó sin efecto declarado: es la misma guarda
-- que trae el seed 21 y la razón por la que este archivo no puede pasar
-- inadvertido si alguien añade una fuente a medias.
do $$
declare v_malas text;
begin
  select string_agg(codigo, ', ') into v_malas
    from lista_fuente
   where activa and determinacion = 'aplica'
     and efecto is null and efectos_por_situacion is null;
  if v_malas is not null then
    raise exception 'Fuentes activas que aplican y no declaran efecto: %. Una coincidencia '
      'sin efecto declarado no le dice a nadie qué hacer.', v_malas;
  end if;
end $$;
