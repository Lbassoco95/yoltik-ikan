-- =====================================================================
-- 0061 · El cuestionario reforzado, su firma, y la Secretaría de Economía
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 5 del 01/09/2026,
-- apartados 3 y 5. Instrucciones 57, 58, 59 y 63.
--
-- ---------------------------------------------------------------------
-- La firma NO es la e.firma, y NO es Didit
-- ---------------------------------------------------------------------
-- Las Reglas definen dos términos distintos y no los usan de forma
-- intercambiable:
--
--   art. 3 fr. VIII Ter · Firma Electrónica — la del Código de Comercio
--   art. 3 fr. IX       · Firma Electrónica Avanzada — el certificado del CFF
--
-- El art. 23 Ter 3 exige, para el cuestionario remoto, la PRIMERA. El art. 24
-- exige la segunda para presentar Avisos. La diferencia es deliberada, y exigir
-- e.firma haría inaplicable el cuestionario remoto: una proporción grande de
-- personas físicas no la tiene activa.
--
-- Y Didit no es una opción porque DIDIT NO FIRMA: verifica identidad. Bajo el
-- Código de Comercio la fiabilidad de una firma depende de que se pueda
-- atribuir al firmante Y de que se detecte cualquier alteración posterior del
-- mensaje. El resultado de Didit es evidencia de lo primero, no es lo segundo,
-- y no sustituye al mecanismo de firma. Confundirlos es el mismo error de
-- categoría que la Adenda 3 corrigió con los programas de sanciones: creer que
-- dos cosas que se parecen sirven para lo mismo.
--
-- Arquitectura: Didit aporta el aseguramiento de identidad; el mecanismo de
-- firma aporta atribución e integridad; el paquete de evidencia guarda ambos.
-- =====================================================================

do $$ begin
  create type mecanismo_firma as enum (
    'efirma_sat',              -- la de mayor atribución. Se acepta cuando el cliente la tenga
    'prestador_reconocido',    -- firma electrónica de prestador de servicios de certificación
    'constancia_conservacion'  -- firma con constancia de conservación de mensajes de datos
  );
exception when duplicate_object then null; end $$;

comment on type mecanismo_firma is
  'Mecanismos admitidos para el cuestionario remoto. NO incluye casilla de '
  'aceptación, nombre escrito en un campo de texto, ni imagen de firma trazada '
  'con el dedo sin datos de atribución: nada de eso es firma bajo el Código de '
  'Comercio, y admitirlo dejaría cuestionarios que parecen firmados.';

create table if not exists cuestionario_reforzado (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete cascade,

  /**
   * Los cinco bloques del apartado 3.2, como jsonb.
   *
   * En jsonb y no en columnas porque las preguntas son metodología y cambian
   * con el Manual; congelarlas en el esquema obligaría a una migration por cada
   * ajuste de redacción. Lo que sí está fijo es la LISTA de bloques, que se
   * comprueba abajo.
   */
  respuestas jsonb not null default '{}'::jsonb,

  -- La firma, con lo que el Código de Comercio exige para que sea fiable.
  mecanismo mecanismo_firma,
  /** Atribución: qué identifica al suscriptor. */
  evidencia_atribucion jsonb,
  /** Integridad: qué permite detectar alteración posterior del mensaje. */
  evidencia_integridad jsonb,
  /**
   * La verificación de identidad que acompaña, cuando la hay.
   *
   * Se guarda APARTE del mecanismo de firma a propósito: es aseguramiento de
   * identidad, no firma, y meterla en el mismo campo haría creer que firmó.
   */
  verificacion_id uuid references verificacion_identidad(id),

  firmado_en timestamptz,
  aplicado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (client_id)
);

-- Firmado significa firmado con un mecanismo, con su evidencia y con fecha.
alter table cuestionario_reforzado drop constraint if exists cuestionario_firma_completa;
alter table cuestionario_reforzado
  add constraint cuestionario_firma_completa
  check (
    (mecanismo is null and firmado_en is null)
    or (mecanismo is not null and firmado_en is not null
        and evidencia_atribucion is not null and evidencia_integridad is not null)
  );

comment on table cuestionario_reforzado is
  'Cuestionario del art. 23 Ter 3, aplicable SÓLO a clientes de riesgo alto: no '
  'es un cuestionario de alta universal, y aplicarlo a todos diluiría su '
  'función. La firma es la del Código de Comercio, no la e.firma; Didit no '
  'firma, verifica identidad, y por eso viaja en su propio campo.';
comment on column cuestionario_reforzado.evidencia_integridad is
  'Lo que permite detectar alteración posterior del mensaje. Sin esto la firma '
  'no es fiable bajo el Código de Comercio, y el resultado de Didit NO lo '
  'aporta: es evidencia de atribución, no de integridad.';

create index if not exists idx_cuestionario_cliente on cuestionario_reforzado(client_id);

alter table cuestionario_reforzado enable row level security;
drop policy if exists "cuestionario_org" on cuestionario_reforzado;
create policy "cuestionario_org" on cuestionario_reforzado for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());
revoke all on cuestionario_reforzado from anon;

-- ---------------------------------------------------------------------
-- Los cinco bloques, y qué falta contestar
-- ---------------------------------------------------------------------
create or replace function public.bloques_cuestionario_pendientes(p_client uuid)
returns table (bloque text, etiqueta text)
language sql stable security definer set search_path = public as $$
  select b.clave, b.etiqueta
    from (values
      ('origen', 'Origen de los recursos'),
      ('destino', 'Destino'),
      ('operacion', 'Operación y relación'),
      ('vinculos', 'Vínculos y calidad'),
      ('cierre', 'Cierre: declaración de veracidad y firma')
    ) as b(clave, etiqueta)
   where not exists (
     select 1 from cuestionario_reforzado q
      where q.client_id = p_client
        and q.respuestas ? b.clave
        and jsonb_typeof(q.respuestas -> b.clave) = 'object'
        and q.respuestas -> b.clave <> '{}'::jsonb);
$$;

comment on function public.bloques_cuestionario_pendientes(uuid) is
  'Los bloques del apartado 3.2 sin contestar. Un cuestionario a medias y uno '
  'sin empezar se ven igual sin esto.';

revoke all on function public.bloques_cuestionario_pendientes(uuid) from public, anon;
grant execute on function public.bloques_cuestionario_pendientes(uuid) to authenticated;

-- =====================================================================
-- La consulta a los registros de la Secretaría de Economía
-- =====================================================================
-- Instrucción 63, y la corrección que la Adenda 5 me hizo: yo propuse dejarla
-- declarada sin construir dónde registrarla, y tienen razón en que eso no es un
-- pendiente sino «una omisión con nombre amable». El campo es barato y hace
-- AUDITABLE la espera.
--
-- Y la fecha se corrige: la instrucción 24 quedó al 1 de junio de 2027 por
-- agruparla con los mecanismos automatizados, pero la consulta del art. 23 Ter
-- 4 fr. II es un ACTO MANUAL. Es exigible desde el 1 de marzo de 2027, cuando
-- lo es la clasificación de clientes por grado de riesgo. Lo que espera es la
-- automatización, no la obligación.
do $$ begin
  create type estado_consulta_se as enum (
    'no_aplica',                 -- el cliente no es persona moral de riesgo alto
    'pendiente',
    'realizada',
    'no_disponible_causa_externa'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type resultado_consulta_se as enum (
    'coincide',      -- lo registrado coincide con lo declarado
    'discrepa',      -- señal por sí misma, igual que giro contra actividad
    'sin_informacion'
  );
exception when duplicate_object then null; end $$;

create table if not exists consulta_secretaria_economia (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete cascade,

  estado estado_consulta_se not null default 'pendiente',
  fecha_consulta date,
  medio text,
  folio text,
  resultado resultado_consulta_se,
  /** Evidencia adjunta de la consulta. Bucket privado, como el resto. */
  storage_path text,
  nombre_archivo text,

  realizada_por uuid references auth.users(id),
  /** Bajo qué versión del expediente. Sin esto, una consulta de hace un año
   *  parecería cubrir una estructura societaria que cambió después. */
  evaluacion_secuencia bigint,
  registrado_en timestamptz not null default now(),
  unique (client_id)
);

-- Realizada significa realizada: con fecha, medio y resultado. Sin ellos es
-- una casilla marcada.
alter table consulta_secretaria_economia drop constraint if exists consulta_se_realizada_completa;
alter table consulta_secretaria_economia
  add constraint consulta_se_realizada_completa
  check (
    estado <> 'realizada'
    or (fecha_consulta is not null and coalesce(btrim(medio), '') <> '' and resultado is not null)
  );

comment on table consulta_secretaria_economia is
  'Consulta a los registros electrónicos de la Secretaría de Economía (art. 23 '
  'Ter 4 fr. II). El campo se construye ahora aunque la consulta no sea exigible '
  'hasta el 1/03/2027: un pendiente sin lugar donde asentar el resultado no es '
  'un pendiente, es una omisión con nombre amable.';
comment on column consulta_secretaria_economia.resultado is
  'La DISCREPANCIA entre la estructura declarada y la registrada es una señal '
  'por sí misma, igual que la divergencia entre giro y actividad.';

alter table consulta_secretaria_economia enable row level security;
drop policy if exists "consulta_se_org" on consulta_secretaria_economia;
create policy "consulta_se_org" on consulta_secretaria_economia for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());
revoke all on consulta_secretaria_economia from anon;

-- ---------------------------------------------------------------------
-- Cuándo es exigible
-- ---------------------------------------------------------------------
-- En un parámetro y no en una constante, por la misma razón que la UMA: es una
-- fecha normativa, y la Adenda 5 ya corrigió una vez la que la Adenda 4 había
-- puesto mal.
insert into parametro_regulatorio
  (codigo, nombre, valor_numerico, unidad, sector, vigente_desde, fuente, notas)
select 'FECHA_EXIGIBLE_CONSULTA_SE',
       'Fecha desde la que es exigible la consulta a la Secretaría de Economía',
       20270301, 'dia', '*', current_date,
       'Art. 23 Ter 4 fr. II de las RCG. La consulta es un ACTO MANUAL, no un mecanismo '
       || 'automatizado, y se activa cuando existe clasificación de clientes por grado de riesgo: '
       || 'exigible desde el 01/03/2027.',
       'Corrige la instrucción 24 de la Adenda 4, que la fechó al 01/06/2027 por agruparla con '
       || 'los mecanismos automatizados. Lo que espera es la automatización, no la obligación. '
       || 'Como AAAAMMDD porque el registro guarda números, no fechas.'
 where not exists (select 1 from parametro_regulatorio where codigo = 'FECHA_EXIGIBLE_CONSULTA_SE');

-- ---------------------------------------------------------------------
-- El asiento en la bitácora, en una FUNCIÓN y no en un bloque suelto
-- ---------------------------------------------------------------------
-- Las migrations corren ANTES que los seeds. Un bloque que recorre
-- `organizations` para asentar la incorporación no encuentra ninguna en un
-- proyecto recién creado, y la organización nace sin el asiento: en producción
-- queda, en una base nueva no, y la diferencia no se ve hasta que alguien pide
-- la bitácora. Lo cazó la prueba de comportamiento de esta misma migration
-- corriendo sobre una base limpia.
--
-- En función, el asiento se puede volver a pedir: lo llama esta migration para
-- las organizaciones que ya existen, y el seed 20 para las que los seeds crean
-- después.
create or replace function public.asentar_adenda_5(p_org uuid)
returns boolean
language plpgsql security definer set search_path = public as $fn$
begin
  if p_org is null or not exists (select 1 from organizations where id = p_org) then
    return false;
  end if;
  if exists (select 1 from evento_auditoria
              where organization_id = p_org and tipo = 'expediente_reforzado_incorporado') then
    return false;
  end if;

  perform public.registrar_evento(
    p_org, 'expediente_reforzado_incorporado', 'client', null,
    jsonb_build_object(
        'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 5 del 01/09/2026. Instrucciones 49 '
               || 'a 65, sobre los arts. 23 Ter 3, 23 Ter 4 y 23 Ter 5 de las RCG.',
        'directivo', 'No se creó el rol «directivo»: la regla dice «o su equivalente» y en una '
                  || 'notaría el equivalente es el notario titular. La autoaprobación se admite y '
                  || 'se CALCULA comparando identidades, nunca se declara.',
        'allegados', 'Cuatro campos, no diez. Pedir domicilio y teléfono de un cónyuge que no es '
                  || 'cliente excedería lo necesario, adecuado y relevante del art. 12 de la ley '
                  || 'de datos personales, sobre un tercero que no consintió nada.',
        'negativas', 'Las respuestas negativas se guardan con fecha: «no tiene cónyuge» y «nadie '
                  || 'ha preguntado» son cosas distintas y el campo vacío las representa igual.',
        'firma', 'Firma Electrónica del Código de Comercio (art. 3 fr. VIII Ter), NO la Firma '
              || 'Electrónica Avanzada del art. 24. Exigir e.firma haría inaplicable el '
              || 'cuestionario remoto. Y Didit NO firma: verifica identidad, que es evidencia de '
              || 'atribución y no de integridad. Confundirlos es el mismo error de categoría que '
              || 'la Adenda 3 corrigió con los programas de sanciones.',
        'catalogo_origen', 'Doce orígenes y treinta tipos de documento, con cuatro metadatos '
                        || 'obligatorios por archivo. Es metodología propia de Kawiil: ni la Ley '
                        || 'ni las Reglas enumeran documentos admisibles, y la lista es defendible '
                        || 'por estar escrita y ser cerrada, no por venir de la autoridad.',
        'secretaria_economia', 'El campo se construye ahora aunque la consulta no sea exigible '
                            || 'hasta el 01/03/2027. La fecha corrige la instrucción 24 de la '
                            || 'Adenda 4: la consulta es un acto manual, no un mecanismo '
                            || 'automatizado.'
    ),
    'sistema', null
  );
  return true;
end $fn$;

comment on function public.asentar_adenda_5(uuid) is
  'Asienta en la bitácora de una organización la incorporación de la Adenda 5. '
  'Va en función y no en un bloque suelto porque las migrations corren antes '
  'que los seeds: en un proyecto nuevo no hay organizaciones todavía, y el '
  'asiento se perdía sin que se notara hasta que alguien pidiera la bitácora.';

revoke all on function public.asentar_adenda_5(uuid) from public, anon;

do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    perform public.asentar_adenda_5(v_org);
  end loop;
end $$;
