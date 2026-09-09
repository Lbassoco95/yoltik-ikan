-- =====================================================================
-- 0072 · Sale «Obligatoria», entra el fundamento de cada fuente
-- =====================================================================
-- Cierra las instrucciones 334, 336, 337 y 339 de la Nota 5 de la Célula de
-- Cumplimiento (9 de septiembre de 2026). Las de pantalla —335 y 338— van en
-- el front, sobre lo que esta migration deja disponible.
--
-- ---------------------------------------------------------------------
-- Qué estaba mal
-- ---------------------------------------------------------------------
-- La pantalla de listas ponía una insignia «Obligatoria» sobre OFAC y sobre
-- los listados del SAT. Eso afirma que la ley manda consultarlas, y la Nota 2
-- verificó el artículo 18 completo: no lo manda. Ninguna de sus once
-- fracciones obliga a consultar listas de sanciones, de ningún tipo.
--
-- Poner esa palabra en pantalla es poner por escrito, frente al usuario, el
-- argumento que en una verificación se cae. Si preguntan con qué fundamento se
-- consulta OFAC, «lo manda el artículo 18» se derrumba.
--
-- ---------------------------------------------------------------------
-- Y por qué no basta con quitarla
-- ---------------------------------------------------------------------
-- Cambiarla por «No obligatoria» sería igual de inexacto en el otro sentido.
-- La insignia venía confundiendo DOS preguntas independientes:
--
--   1. Qué pasa si hay coincidencia  → eso es `efecto`, y ya existe (0066).
--   2. De dónde nace la exigencia de consultar → eso es `fundamento`, nuevo.
--
-- Las dos importan y ninguna implica la otra. La ONU es el caso que lo
-- demuestra: su fundamento es el mismo que el de OFAC —metodología del
-- Manual— y su efecto no lo es en absoluto, porque operar con una persona
-- designada por el Consejo de Seguridad tiene consecuencias que ninguna otra
-- lista tiene (instrucción 339). La regla general que deja la Nota 5 vale
-- escribirla: el peso jurídico de una lista se expresa en lo que pasa cuando
-- hay coincidencia, no en una insignia que afirme que la ley obliga a mirarla.
--
-- ---------------------------------------------------------------------
-- El giro que hace que esto funcione
-- ---------------------------------------------------------------------
-- Una vez que el Manual de Políticas Internas dice que la organización criba
-- contra la ONU, OFAC y el 69-B, consultarlas SÍ es obligatorio para esa
-- organización: no por el artículo 18 directamente, sino porque su fracción
-- VIII la obliga a elaborar y OBSERVAR su propio Manual. La obligación existe;
-- nace en otro lado. Y así la pantalla le dice al fedatario a qué cribados se
-- comprometió su despacho, que es más útil que una insignia genérica.

-- ---------------------------------------------------------------------
-- 1. El tipo
-- ---------------------------------------------------------------------
do $$ begin
  create type fundamento_consulta as enum (
    'obligacion_ley',      -- la ley obliga expresamente
    'metodologia_manual',  -- la organización la adoptó en su Manual
    'informativa'          -- no prevista en el Manual, decisión propia
  );
exception when duplicate_object then null; end $$;

alter table lista_fuente
  add column if not exists fundamento fundamento_consulta,
  add column if not exists fundamento_norma text;

comment on column lista_fuente.fundamento is
  'De dónde nace la exigencia de consultar esta fuente. Independiente de '
  '`efecto`, que dice qué pasa si hay coincidencia. Sustituye a la insignia '
  '«Obligatoria», que afirmaba que el art. 18 manda consultar listas de '
  'sanciones — y no lo manda (Nota 2, instrucción 334).';

comment on column lista_fuente.fundamento_norma is
  'La cita concreta que sostiene el fundamento, para poder mostrarla y '
  'defenderla en una visita de verificación.';

-- ---------------------------------------------------------------------
-- 2. Si la organización tiene Manual, porque de eso depende la etiqueta
-- ---------------------------------------------------------------------
-- Instrucción 337: «Si una organización no tiene Manual todavía, la etiqueta
-- correcta para esas cuatro fuentes es "Pendiente en el Manual", no
-- "Metodología del Manual". Afirmar que algo está en un documento que no
-- existe es el mismo error que estamos corrigiendo.»
--
-- No había dónde registrarlo: el único rastro de un Manual en toda la base
-- era `prospect_intake.tiene_manual_pld`, que es una casilla del formulario de
-- prospecto —lo que alguien dijo antes de comprar— y no el estado de la
-- organización. Usar eso para afirmar en pantalla que el cribado está previsto
-- en un Manual habría sido exactamente el error que la nota corrige.
--
-- Nulo por defecto, y nulo significa «no consta». La etiqueta cae sola en
-- «Pendiente en el Manual» hasta que alguien asiente la fecha, que es la
-- afirmación segura: de las dos formas de equivocarse aquí, prometer un
-- Manual que no existe es la que se cae en una visita.
alter table organizations
  add column if not exists manual_pld_asentado_en date;

comment on column organizations.manual_pld_asentado_en is
  'Fecha en que consta el Manual de Políticas Internas de esta organización. '
  'NULL = no consta, y entonces las fuentes de metodología se muestran como '
  '«Pendiente en el Manual» y no como previstas en él (instrucción 337). No '
  'se llena desde el formulario de prospecto: eso es lo que alguien dijo antes '
  'de comprar, no el estado de la organización.';

-- ---------------------------------------------------------------------
-- 3. El fundamento de cada fuente
-- ---------------------------------------------------------------------
-- Del apartado 3.2 de la Nota 5, fuente por fuente.

-- Obligación de ley. La ÚNICA. El art. 18 fracciones VIII y X obliga
-- expresamente a identificar y dar seguimiento intensificado a Personas
-- Políticamente Expuestas, y el catálogo de cargos es el medio para cumplirlo.
update lista_fuente set
  fundamento = 'obligacion_ley',
  fundamento_norma =
    'Art. 18 fracciones VIII y X LFPIORPI: obligan expresamente a identificar y dar '
    || 'seguimiento intensificado a Personas Políticamente Expuestas. El catálogo de cargos '
    || 'es el medio para cumplirlo. Nota 5 de la Célula de Cumplimiento, 9/09/2026.'
where codigo = 'ppe_cargos_68a';

-- Metodología del Manual. Las cuatro de sanciones y fiscales.
--
-- `sat_69b_bis` no aparece nombrada en la tabla de la Nota 5, que dice «SAT
-- 69-B». Se le pone el mismo fundamento porque el razonamiento es idéntico
-- —la ley tampoco ordena consultar el 69-B Bis, y es el artículo vecino del
-- mismo Código Fiscal— pero queda dicho que es inferencia mía y no texto de
-- la nota, para que Cumplimiento lo confirme o lo corrija.
update lista_fuente set
  fundamento = 'metodologia_manual',
  fundamento_norma =
    'La ley NO ordena consultar esta lista: el art. 18 LFPIORPI, en sus once fracciones, no '
    || 'obliga a consultar listas de sanciones de ningún tipo (verificado sobre el texto con '
    || 'reforma DOF 16/07/2025, Nota 2). La organización la adoptó como medida para mitigar '
    || 'el riesgo que el art. 18 fr. VII la obliga a mitigar, y lo asentó en su Manual '
    || 'conforme a la fr. VIII — que es la que la obliga a observarlo. Nota 5, 9/09/2026.'
where codigo in ('onu_consolidada', 'ofac_sdn', 'ofac_consolidada', 'sat_69b', 'sat_69b_bis');

-- Informativa. No prevista en el Manual, se consulta por decisión propia.
update lista_fuente set
  fundamento = 'informativa',
  fundamento_norma =
    'No prevista en el Manual. Es una lista de sanciones real y cargable que esta célula '
    || 'determinó no elevar a obligatoria: existe y se decidió no exigirla. Se consulta por '
    || 'decisión de la organización y sin efecto automático.'
where codigo = 'ue_sanciones';

-- `ppe_oficial` se queda SIN fundamento, y es lo correcto: no es que no se
-- sepa de dónde nace la exigencia, es que la fuente no se puede consultar. Una
-- etiqueta de fundamento ahí insinuaría que hay algo que consultar.

-- ---------------------------------------------------------------------
-- 4. La vista, con la etiqueta ya resuelta
-- ---------------------------------------------------------------------
-- `fundamento_efectivo` se resuelve aquí y no en el front porque depende de un
-- dato de la organización que el front no tiene a mano, y porque la regla de
-- la 337 —no afirmar lo que no consta— es demasiado fácil de olvidar en un
-- componente. Resuelta en la vista, no hay forma de pintar «Metodología del
-- Manual» sin que exista el Manual.
drop view if exists v_listas_estado;

create view v_listas_estado as
  select
    f.codigo,
    f.nombre,
    f.autoridad,
    f.naturaleza,
    f.modo_actualizacion,
    f.url_oficial,
    f.obligatoria,
    f.situaciones,
    f.situaciones_bloqueantes,
    f.efecto,
    f.efectos_por_situacion,
    f.determinacion,
    f.fundamento_determinacion,
    f.fundamento,
    f.fundamento_norma,
    -- La etiqueta que se pinta. 'pendiente_manual' no es un valor del enum a
    -- propósito: no es una clase distinta de fundamento, es la misma que
    -- todavía no puede afirmarse.
    case
      when f.fundamento = 'metodologia_manual'
       and (select o.manual_pld_asentado_en from organizations o
             where o.id = public.current_org_id()) is null
        then 'pendiente_manual'
      else f.fundamento::text
    end as fundamento_efectivo,
    public.estado_de_fuente(f.codigo) as estado,
    (select max(c.fecha_publicacion_fuente)
       from lista_carga c
      where c.fuente_id = f.id and c.estado = 'aplicada') as actualizada_al,
    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo) as registros_vigentes,
    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo
        and public.efecto_de_coincidencia(f.codigo, r.situacion) = 'impedimento')
      as registros_bloqueantes,
    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo
        and public.efecto_de_coincidencia(f.codigo, r.situacion) = 'eleva_diligencia')
      as registros_eleva_diligencia,
    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo
        and public.efecto_de_coincidencia(f.codigo, r.situacion) is null)
      as registros_sin_efecto_declarado
  from lista_fuente f
  where f.activa;

comment on view v_listas_estado is
  'Estado de cada fuente para el sujeto obligado. `efecto` dice qué pasa si hay '
  'coincidencia; `fundamento_efectivo` dice de dónde nace la exigencia de consultarla, '
  'y vale «pendiente_manual» cuando la organización no tiene Manual asentado — no se '
  'puede afirmar que una fuente está prevista en un documento que no existe '
  '(instrucciones 334 a 337).';

grant select on v_listas_estado to authenticated;

-- ---------------------------------------------------------------------
-- 5. Guardas
-- ---------------------------------------------------------------------
do $guarda$
declare v_malas text;
begin
  -- La de siempre: toda fuente que aplica declara su efecto.
  select string_agg(codigo, ', ') into v_malas
    from lista_fuente
   where activa and determinacion = 'aplica'
     and efecto is null and efectos_por_situacion is null;
  if v_malas is not null then
    raise exception 'Fuentes activas que aplican y no declaran efecto: %.', v_malas;
  end if;

  -- Y la nueva. Una fuente consultable sin fundamento declarado es la insignia
  -- vieja con otro nombre: se muestra sin poder decir por qué se consulta.
  select string_agg(codigo, ', ') into v_malas
    from lista_fuente
   where activa and determinacion = 'aplica' and fundamento is null;
  if v_malas is not null then
    raise exception 'Fuentes activas que aplican y no declaran fundamento: %. Si se muestra '
      'en pantalla, hay que poder decir de dónde nace la exigencia de consultarla.', v_malas;
  end if;
end $guarda$;
