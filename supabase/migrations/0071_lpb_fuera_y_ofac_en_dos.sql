-- =====================================================================
-- 0071 · Sale la Lista de Personas Bloqueadas, y OFAC se parte en dos
-- =====================================================================
-- Cierra las instrucciones 315 y 317 y ejecuta la 292, todas de la Nota 4 de
-- la Célula de Cumplimiento (9 de septiembre de 2026).
--
-- ---------------------------------------------------------------------
-- 1. La Lista de Personas Bloqueadas no obliga, y por eso se va
-- ---------------------------------------------------------------------
-- La instrucción 239 llevaba semanas abierta esperando una determinación.
-- Estaba contestada desde el 8 de septiembre en la Nota 2, que no llegó a la
-- carpeta del proyecto por una caída de conexión. La Nota 4 la reitera:
--
--   Las expresiones «personas bloqueadas», «lista de personas bloqueadas» y
--   «listado de personas bloqueadas» NO aparecen en la Ley con reforma del 16
--   de julio de 2025 ni en el Reglamento con reforma del 27 de marzo de 2026.
--   Se verificó en los dos textos. La Lista de Personas Bloqueadas obliga a
--   Entidades Financieras, no a quienes realizan Actividades Vulnerables.
--
-- Y el fundamento que esta plataforma traía citado —art. 18 fracción V— no
-- dice lo que se le atribuía: es sobre brindar facilidades para las visitas de
-- verificación. Vale la pena no pasar eso por alto. La fuente no estaba
-- pendiente de determinación: estaba mal fundada, y una cita equivocada
-- sobrevive precisamente porque nadie la vuelve a leer.
--
-- Se retira del catálogo con el mismo tratamiento que se le dio a la lista
-- `interna`: la fila se conserva —nada se borra— pero deja de estar activa,
-- así que sale de la pantalla y del barrido. La razón de retirarla queda
-- escrita en la propia fila, que es donde la va a encontrar quien pregunte.
--
-- El motivo de fondo lo dice la Nota 4 mejor de lo que yo lo diría: «Lo que no
-- debe quedar es una fuente llamada Lista de Personas Bloqueadas, en ámbar,
-- sugiriendo una deuda de cumplimiento que no existe. Eso es peor que no
-- tenerla: le dice al sujeto obligado que le falta algo cuando no le falta.»
update lista_fuente set
  activa = false,
  obligatoria = false,
  determinacion = 'no_aplica',
  efecto = null,
  fundamento_determinacion =
    'NO APLICA a Actividades Vulnerables. Las expresiones «personas bloqueadas», «lista '
    || 'de personas bloqueadas» y «listado de personas bloqueadas» no aparecen en la Ley '
    || '(reforma DOF 16/07/2025) ni en el Reglamento (reforma DOF 27/03/2026); se verificó '
    || 'en los dos textos. La Lista de Personas Bloqueadas obliga a Entidades Financieras, '
    || 'no a quienes realizan las Actividades Vulnerables del art. 17. El art. 18 fr. V que '
    || 'esta plataforma citaba como fundamento NO es sobre esta lista: es sobre brindar '
    || 'facilidades para las visitas de verificación. Determinado por la Célula de '
    || 'Cumplimiento Kawiil, Nota 2 del 8/09/2026 (instrucción 239), reiterado en la Nota 4 '
    || 'del 9/09/2026 (instrucción 315).',
  notas =
    'Retirada del catálogo, no borrada: que una fuente se haya evaluado y NO obligue es un '
    || 'hecho que conviene poder mostrar. Queda como antecedente de por qué no aparece.'
    || E'\n\n'
    || 'Pendiente asociado (instrucción 316): el componente de provisionamiento por '
    || 'organización que se había pensado para esta lista NO se tira. Una notaría recibe '
    || 'comunicaciones de autoridad —requerimientos, oficios, notificaciones— que sí llegan '
    || 'a su portal y que sí conviene que el expediente conserve. Cumplimiento propone '
    || 'reencuadrarlo como captura genérica de comunicaciones de autoridad por '
    || 'organización. Decisión de producto, todavía sin tomar.',
  determinado_por = 'Célula de Cumplimiento Kawiil · Nota 2 (8/09/2026) y Nota 4 (9/09/2026)',
  determinado_en = now()
where codigo = 'uif_bloqueadas';

-- ---------------------------------------------------------------------
-- 2. OFAC son DOS listas, y hasta hoy eran una fuente
-- ---------------------------------------------------------------------
-- Instrucción 292, ratificada en la Nota 4: dos fuentes, las dos con efecto de
-- elevación de diligencia.
--
-- No es una distinción cosmética. El Tesoro publica la SDN y la Consolidada de
-- programas no-SDN por separado, y mientras las dos entraran en la misma
-- fuente, ninguna carga podía declararse completa: dar de baja «lo que no vino
-- en el archivo» habría dado de baja los registros de la otra lista. Por eso
-- el lector venía proponiendo alcance parcial aunque el archivo fuera íntegro,
-- y por eso una persona a la que el Tesoro retirara de la SDN se habría
-- quedado activa para siempre.
--
-- Se parte ahora y no después porque hoy las dos están en cero registros: la
-- separación no mueve un solo dato. Hacerlo con las listas ya cargadas habría
-- exigido repartir 19,846 registros entre dos fuentes adivinando de cuál vino
-- cada uno.
update lista_fuente set
  nombre = 'OFAC · Lista SDN (Specially Designated Nationals)',
  url_oficial = 'https://sanctionslist.ofac.treas.gov/Home/SdnList',
  frecuencia_objetivo = 'Al cambio que publique el Tesoro. Archivo SDN_ENHANCED.XML.',
  notas = coalesce(notas || E'\n\n', '')
    || 'Esta fuente es SÓLO la SDN. La Consolidada de programas no-SDN vive en '
    || '`ofac_consolidada` desde la 0071 (instrucción 292): son dos publicaciones distintas '
    || 'del Tesoro y compartir fuente impedía que ninguna carga pudiera declararse '
    || 'completa. El SDN_ENHANCED.XML pesa 104 MB y no se puede cargar por el navegador; '
    || 'espera el proceso del lado del servidor.'
where codigo = 'ofac_sdn';

insert into lista_fuente (
  codigo, nombre, autoridad, naturaleza, modo_actualizacion,
  url_oficial, frecuencia_objetivo, obligatoria, activa,
  efecto, determinacion, fundamento_determinacion, notas,
  determinado_por, determinado_en
)
select
  'ofac_consolidada',
  'OFAC · Lista Consolidada (programas no-SDN)',
  f.autoridad,
  f.naturaleza,
  f.modo_actualizacion,
  'https://sanctionslist.ofac.treas.gov/Home/ConsolidatedList',
  'Al cambio que publique el Tesoro. Archivo CONS_ENHANCED.XML.',
  f.obligatoria,
  true,
  -- Mismo efecto que la SDN, y por la misma razón: es derecho extranjero. Un
  -- fedatario mexicano no es U.S. person, así que una coincidencia no impide
  -- operar — eleva la diligencia. El fundamento se hereda de la SDN porque la
  -- determinación de la Adenda 3 se hizo sobre OFAC como autoridad, no sobre
  -- una de sus dos publicaciones.
  'eleva_diligencia',
  f.determinacion,
  f.fundamento_determinacion,
  'Segunda de las dos listas que publica OFAC. Recoge los programas de sanciones que NO '
    || 'son SDN. Es mucho más chica —481 registros contra 19,365 de la SDN— y por eso sirve '
    || 'para probar el camino completo de carga antes de meter la grande. '
    || 'Instrucción 292 de la Célula de Cumplimiento.',
  'Célula de Cumplimiento Kawiil · instrucción 292, ratificada en la Nota 4 del 9/09/2026',
  now()
from lista_fuente f
where f.codigo = 'ofac_sdn'
on conflict (codigo) do update set
  nombre = excluded.nombre,
  url_oficial = excluded.url_oficial,
  frecuencia_objetivo = excluded.frecuencia_objetivo,
  efecto = excluded.efecto,
  determinacion = excluded.determinacion,
  fundamento_determinacion = excluded.fundamento_determinacion,
  notas = excluded.notas,
  determinado_por = excluded.determinado_por,
  determinado_en = excluded.determinado_en;

-- Explícito y no por omisión: OFAC no maneja situaciones —estar sancionado es
-- el único estado— y el trigger de la 0014 rechaza etiquetas inventadas. El
-- insert de arriba no copia las columnas de situación de la SDN, así que ya
-- quedan nulas; se declara igual para que se lea como decisión y no como
-- descuido, y para que coincida con lo que hace el seed 12.
update lista_fuente set
  situaciones = null,
  situaciones_bloqueantes = null
where codigo = 'ofac_consolidada';

-- ---------------------------------------------------------------------
-- 3. El catálogo de cargos ya tiene dirección
-- ---------------------------------------------------------------------
-- La 0070 lo creó con `url_oficial` en null porque la Nota 3 nombró la fuente
-- por remisión —la disposición 68ª— sin decir dónde vive. La Nota 4 la
-- localizó: la publica la CNBV con nombre propio, «Personas Políticamente
-- Expuestas Nacionales». No se pudo extraer porque el sitio rechaza el acceso
-- automatizado, así que la descarga es a mano y de Cumplimiento, con su
-- planilla de procedencia (instrucción 317).
--
-- Queda la reserva que la propia Nota 4 levanta y que no hay que perder:
-- conviene cotejar que la lista publicada sea efectivamente la referida por el
-- Reglamento antes de cargarla como catálogo.
update lista_fuente set
  url_oficial = 'https://www.gob.mx/cnbv/documentos/personas-politicamente-expuestas-nacionales',
  notas = notas || E'\n\n'
    || 'UBICACIÓN (instrucción 317, Nota 4 del 9/09/2026): la publica la CNBV bajo el '
    || 'título «Personas Políticamente Expuestas Nacionales». Existe además una versión '
    || 'de 2020 bajo el nombre Lista_PEPS en el repositorio de archivos de gob.mx. El '
    || 'sitio rechaza el acceso automatizado, así que la descarga la hace Cumplimiento a '
    || 'mano y con planilla de procedencia —URL exacta, fecha y hora, quién la bajó, '
    || 'tamaño y huella—, igual que con las listas de sanciones: la procedencia del '
    || 'archivo es parte del control. RESERVA de la propia Nota 4: hay que cotejar que la '
    || 'lista publicada sea efectivamente la referida por el Reglamento antes de cargarla.'
where codigo = 'ppe_cargos_68a';

-- ---------------------------------------------------------------------
-- 4. La guarda de siempre
-- ---------------------------------------------------------------------
do $guarda$
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
end $guarda$;
