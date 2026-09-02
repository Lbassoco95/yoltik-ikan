-- =====================================================================
-- 0057 · Los niveles de diligencia: N2 por defecto, y no se baja solo
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 4 del 01/09/2026,
-- apartado 7. Instrucciones 42 y 43.
--
-- ---------------------------------------------------------------------
-- 1. El defecto era el nivel más laxo
-- ---------------------------------------------------------------------
-- Todos los expedientes decían N1 desde siempre, y no era sólo que faltara el
-- criterio de promoción: `nivel_kyc` tenía default 'N1'.
--
-- N1 no significa «apenas empezamos con este cliente». Significa diligencia
-- SIMPLIFICADA, y las Reglas la permiten en supuestos contados: entes públicos
-- mexicanos, entidades de los Anexos 7-A y 7 Bis-A, y emisoras con valores
-- inscritos, siempre que ADEMÁS estén clasificadas de riesgo bajo. Nacer ahí
-- afirma que un cliente del que no se sabe nada cumple esos supuestos.
--
-- ---------------------------------------------------------------------
-- 2. La asimetría, impuesta en la base y no en la pantalla
-- ---------------------------------------------------------------------
-- SE SUBE SOLO, SE BAJA A MANO. Si la degradación fuera automática bastaría
-- con que el cliente dejara de operar unos meses para que el sistema le
-- limpiara el historial solo: el riesgo no baja porque nadie lo mire.
--
-- Y va en un trigger, no en la capa de API, porque una regla que sólo vive en
-- el front se salta con un `update` desde cualquier sitio —el SQL Editor, un
-- script, un cliente REST— y no deja rastro de que se saltó.
--
-- La única vía para bajar es `bajar_nivel_diligencia`, que exige rol de OC,
-- exige motivo escrito y deja el cambio asentado. El trigger rechaza cualquier
-- otra bajada.
--
-- ---------------------------------------------------------------------
-- 3. Dos ejes que no son el mismo
-- ---------------------------------------------------------------------
-- El nivel de diligencia y el estado del expediente son cosas distintas. La
-- instrucción 19 pide bloquear el ESTADO 3 mientras el beneficiario controlador
-- no esté resuelto; eso es la máquina de estados del expediente, no esto. Un
-- expediente puede estar en N3 y en estado 2 a la vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- El defecto
-- ---------------------------------------------------------------------
alter table client alter column nivel_kyc set default 'N2';

comment on column client.nivel_kyc is
  'Nivel de diligencia (Adenda 4, apartado 7). N2 por defecto: N1 es diligencia '
  'SIMPLIFICADA y sólo cabe en los supuestos que las Reglas permiten simplificar, '
  'y además con riesgo bajo. Sube solo cuando los hechos lo exigen; NO baja sin '
  'decisión firmada.';

-- ---------------------------------------------------------------------
-- La bitácora de cambios de nivel
-- ---------------------------------------------------------------------
-- Aparte de `evento_auditoria`, que registra TODO: aquí se consulta el
-- historial de niveles de un expediente sin filtrar la bitácora entera, y es lo
-- que la reevaluación semestral necesita leer.
create table if not exists cambio_nivel_diligencia (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete cascade,
  desde nivel_kyc not null,
  hacia nivel_kyc not null check (hacia <> desde),
  /** Por qué. Obligatorio en los dos sentidos: una promoción sin motivo no se
   *  puede explicar y una bajada sin motivo no se puede defender. */
  motivo text not null check (btrim(motivo) <> ''),
  /** Si lo decidió el sistema a partir de los hechos, o una persona. */
  automatico boolean not null,
  /** Quién firmó. Obligatorio cuando NO es automático: es lo que convierte una
   *  bajada en una decisión y no en un ajuste. */
  firmado_por uuid references auth.users(id),
  registrado_en timestamptz not null default now()
);

alter table cambio_nivel_diligencia drop constraint if exists cambio_nivel_firmado;
alter table cambio_nivel_diligencia
  add constraint cambio_nivel_firmado
  check (automatico or firmado_por is not null);

comment on table cambio_nivel_diligencia is
  'Historial de niveles de diligencia por expediente. Toda bajada lleva firma: '
  'es lo que la distingue de un ajuste. Lo que la reevaluación semestral del '
  'Cap. III Bis tiene que poder leer.';

create index if not exists idx_cambio_nivel_cliente
  on cambio_nivel_diligencia(client_id, registrado_en desc);

alter table cambio_nivel_diligencia enable row level security;
drop policy if exists "cambio_nivel_select_org" on cambio_nivel_diligencia;
create policy "cambio_nivel_select_org" on cambio_nivel_diligencia for select
  using (organization_id = public.current_org_id() or public.es_admin_kawiil());
-- Sin políticas de escritura a propósito: las filas las escriben las funciones
-- de abajo, que son las que comprueban el rol y el motivo. Con un insert
-- abierto se podría fabricar la firma de una bajada que nadie decidió.
revoke insert, update, delete on cambio_nivel_diligencia from authenticated, anon;
revoke all on cambio_nivel_diligencia from anon;
grant select on cambio_nivel_diligencia to authenticated;

-- ---------------------------------------------------------------------
-- «La última evaluación» tiene que ser una sola
-- ---------------------------------------------------------------------
-- `evaluado_en` tiene default `now()`, y `now()` es CONSTANTE dentro de una
-- transacción: dos evaluaciones guardadas juntas comparten marca al
-- microsegundo y «order by evaluado_en desc limit 1» devuelve la que quiera el
-- índice.
--
-- No es teórico y no es sólo cosa de las pruebas: `bajar_nivel_diligencia`
-- decide si una bajada es admisible leyendo esa fila. Con dos candidatas, la
-- misma llamada puede aceptar o rechazar la bajada según el plan de ejecución,
-- y eso en un control de cumplimiento es indefendible.
--
-- Una secuencia lo resuelve para siempre: monótona dentro y entre
-- transacciones. Es el mismo recurso que usa `evento_auditoria.secuencia`.
alter table client_risk_assessment
  add column if not exists secuencia bigserial;

comment on column client_risk_assessment.secuencia is
  'Orden de llegada, inequívoco. `evaluado_en` no basta: `now()` es constante '
  'dentro de una transacción y dos evaluaciones guardadas juntas empatan, '
  'dejando «la última» a lo que devuelva el índice.';

create index if not exists idx_evaluacion_ultima
  on client_risk_assessment(client_id, secuencia desc);

-- ---------------------------------------------------------------------
-- El nivel que los hechos exigen, en la base
-- ---------------------------------------------------------------------
-- La misma regla que `nivelQueLeToca` en `src/lib/riesgo/nivel-diligencia.ts`.
-- Está en los dos sitios porque cada uno la necesita para algo distinto: el
-- front para pintar, la base para imponer. Que las dos digan lo mismo lo
-- comprueban las pruebas de comportamiento; si se separan, la que manda es
-- ésta, porque es la que no se puede saltar.
create or replace function public.nivel_diligencia_exigido(p_client uuid)
returns table (nivel nivel_kyc, motivo text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_clasif    clasificacion_riesgo;
  v_piso      text;
  v_paso_iii  boolean;
  v_motivos   text[] := '{}';
begin
  select a.clasificacion, a.motivo_alto_de_oficio
    into v_clasif, v_piso
    from client_risk_assessment a
   where a.client_id = p_client
   order by a.secuencia desc
   limit 1;

  -- El paso III se mira APARTE de la evaluación: puede practicarse sin que se
  -- vuelva a evaluar la matriz, y esperar dejaría el expediente en N2 mientras
  -- su estructura de control está sin determinar.
  select exists (
    select 1 from cascada_bc c
     where c.client_id = p_client and c.paso = 'III'
       and c.estado = 'practicado_con_resultado'
  ) into v_paso_iii;

  if v_piso is not null and btrim(v_piso) <> '' then
    -- El cast NO es adorno: `text[] || 'literal'` intenta leer el literal como
    -- arreglo y revienta con «malformed array literal». Con la variable delante
    -- se resuelve solo, con un literal pelado no.
    v_motivos := v_motivos || ('piso activo: ' || v_piso)::text;
  end if;
  if v_clasif in ('alto', 'alto_oficio') then
    v_motivos := v_motivos || 'clasificación en banda alta'::text;
  end if;
  if v_paso_iii then
    v_motivos := v_motivos
      || 'se recurrió al paso III de la cascada del art. 23 Quinquies: la estructura de control no fue determinable'::text;
  end if;

  if array_length(v_motivos, 1) > 0 then
    return query select 'N3'::nivel_kyc, array_to_string(v_motivos, '; ');
    return;
  end if;

  -- N1 NO se deduce: se declara. Un cliente del que no consta que sea ente
  -- público ni emisora no es ninguna de las dos cosas, y hoy lo único que el
  -- sistema puede comprobar por sí solo es la excepción de bolsa —que no basta,
  -- porque la simplificación exige ADEMÁS riesgo bajo—.
  return query select 'N2'::nivel_kyc, 'el nivel de todo cliente'::text;
end $$;

comment on function public.nivel_diligencia_exigido(uuid) is
  'El nivel que los hechos EXIGEN, no el que el expediente tiene. El real es el '
  'mayor de los dos, y esa distinción es la que impide la degradación '
  'automática.';

revoke all on function public.nivel_diligencia_exigido(uuid) from public, anon;
grant execute on function public.nivel_diligencia_exigido(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- El candado: nadie baja el nivel por la puerta de atrás
-- ---------------------------------------------------------------------
create or replace function public.trg_nivel_diligencia_no_baja() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.nivel_kyc = old.nivel_kyc then
    return new;
  end if;

  -- Bajar sólo por la vía autorizada, que es la que exige rol y motivo. La
  -- bandera la pone `bajar_nivel_diligencia` y sólo vive dentro de esa
  -- transacción.
  if array_position(array['N1','N2','N3'], new.nivel_kyc::text)
     < array_position(array['N1','N2','N3'], old.nivel_kyc::text) then
    if coalesce(current_setting('ikan.baja_nivel_autorizada', true), '') <> new.id::text then
      raise exception
        'El nivel de diligencia no baja con un update: usa bajar_nivel_diligencia(), que exige '
        'rol de Oficial de Cumplimiento y motivo escrito. Si la degradación fuera automática, '
        'bastaría con que el cliente dejara de operar unos meses para que el sistema le limpiara '
        'el historial solo.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists nivel_diligencia_no_baja on client;
create trigger nivel_diligencia_no_baja
  before update of nivel_kyc on client
  for each row execute function public.trg_nivel_diligencia_no_baja();

-- ---------------------------------------------------------------------
-- Subir: automático, en cuanto los hechos lo exigen
-- ---------------------------------------------------------------------
-- Los hechos pueden llegar de fuera. El disparador de `client_risk_assessment`
-- pasa la fila que ACABA de insertar en vez de dejar que la función busque «la
-- última»: dos evaluaciones guardadas en la misma transacción comparten
-- `evaluado_en` al milisegundo —`now()` es constante dentro de una transacción—
-- y «la última» queda a lo que devuelva el índice. Lo cazó la prueba de
-- comportamiento: la promoción a N3 se perdía porque el disparador leía la
-- evaluación anterior.
create or replace function public.sincronizar_nivel_diligencia(
  p_client uuid,
  p_clasificacion clasificacion_riesgo default null,
  p_motivo_piso text default null
)
returns nivel_kyc
language plpgsql security definer set search_path = public as $$
declare
  v_actual  nivel_kyc;
  v_org     uuid;
  v_exigido nivel_kyc;
  v_motivo  text;
begin
  select nivel_kyc, organization_id into v_actual, v_org from client where id = p_client;
  if v_actual is null then
    raise exception 'El cliente % no existe.', p_client;
  end if;

  if p_clasificacion is not null or p_motivo_piso is not null then
    -- Con hechos dados, se evalúan ellos y además el paso III, que no viene en
    -- una evaluación de matriz.
    if (p_motivo_piso is not null and btrim(p_motivo_piso) <> '')
       or p_clasificacion in ('alto', 'alto_oficio')
       or exists (select 1 from cascada_bc c
                   where c.client_id = p_client and c.paso = 'III'
                     and c.estado = 'practicado_con_resultado') then
      v_exigido := 'N3';
      v_motivo := coalesce(nullif(btrim(coalesce(p_motivo_piso, '')), ''),
                           'clasificación en banda alta');
    else
      v_exigido := 'N2';
      v_motivo := 'el nivel de todo cliente';
    end if;
  else
    select nivel, motivo into v_exigido, v_motivo from public.nivel_diligencia_exigido(p_client);
  end if;

  -- Sólo sube. Cuando los hechos exigirían menos NO se toca: la bajada es una
  -- decisión firmada, no una consecuencia de recalcular.
  if array_position(array['N1','N2','N3'], v_exigido::text)
     <= array_position(array['N1','N2','N3'], v_actual::text) then
    return v_actual;
  end if;

  update client set nivel_kyc = v_exigido where id = p_client;

  insert into cambio_nivel_diligencia
    (organization_id, client_id, desde, hacia, motivo, automatico)
  values (v_org, p_client, v_actual, v_exigido, v_motivo, true);

  perform public.registrar_evento(
    v_org, 'nivel_diligencia_promovido', 'client', p_client,
    jsonb_build_object(
      'desde', v_actual, 'hacia', v_exigido, 'motivo', v_motivo,
      'fuente', 'Kawiil Mx · Adenda 4 del 01/09/2026, apartado 7.2.',
      'asimetria', 'La promoción es automática e inmediata; la degradación exige que hayan '
                || 'cambiado los hechos, que la reevaluación semestral lo constate y una decisión '
                || 'firmada. Se sube solo, se baja a mano.'
    ),
    'sistema', null
  );

  return v_exigido;
end $$;

comment on function public.sincronizar_nivel_diligencia(uuid, clasificacion_riesgo, text) is
  'Sube el nivel de diligencia si los hechos lo exigen. NUNCA lo baja: cuando '
  'exigirían menos, devuelve el que tenía sin tocarlo.';

revoke all on function public.sincronizar_nivel_diligencia(uuid, clasificacion_riesgo, text)
  from public, anon;
grant execute on function public.sincronizar_nivel_diligencia(uuid, clasificacion_riesgo, text)
  to authenticated;

-- Y que se dispare al guardar una evaluación, no cuando alguien se acuerde.
-- Un nivel que hay que sincronizar a mano es un nivel que se queda viejo.
create or replace function public.trg_sincronizar_nivel_tras_evaluar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- La fila que se acaba de insertar, no «la última»: ver la nota de
  -- `sincronizar_nivel_diligencia`.
  perform public.sincronizar_nivel_diligencia(
    new.client_id, new.clasificacion, new.motivo_alto_de_oficio);
  return new;
end $$;

drop trigger if exists sincronizar_nivel_tras_evaluar on client_risk_assessment;
create trigger sincronizar_nivel_tras_evaluar
  after insert on client_risk_assessment
  for each row execute function public.trg_sincronizar_nivel_tras_evaluar();

-- Lo mismo al asentar el paso III de la cascada: es el otro hecho que exige N3
-- y puede ocurrir sin que se vuelva a evaluar la matriz.
create or replace function public.trg_sincronizar_nivel_tras_cascada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.paso = 'III' and new.estado = 'practicado_con_resultado' then
    perform public.sincronizar_nivel_diligencia(new.client_id);
  end if;
  return new;
end $$;

drop trigger if exists sincronizar_nivel_tras_cascada on cascada_bc;
create trigger sincronizar_nivel_tras_cascada
  after insert or update on cascada_bc
  for each row execute function public.trg_sincronizar_nivel_tras_cascada();

-- ---------------------------------------------------------------------
-- Bajar: a mano, con rol y con motivo
-- ---------------------------------------------------------------------
create or replace function public.bajar_nivel_diligencia(
  p_client uuid,
  p_hacia nivel_kyc,
  p_motivo text
)
returns nivel_kyc
language plpgsql security definer set search_path = public as $$
declare
  v_actual nivel_kyc;
  v_org    uuid;
  v_uid    uuid := auth.uid();
begin
  select nivel_kyc, organization_id into v_actual, v_org from client where id = p_client;
  if v_actual is null then
    raise exception 'El cliente % no existe.', p_client;
  end if;

  if v_org <> public.current_org_id() and not public.es_admin_kawiil() then
    raise exception 'Ese expediente no es de tu organización.';
  end if;

  -- Sólo el Oficial de Cumplimiento. No es una preferencia de producto: la
  -- degradación es la decisión de dejar de aplicar medidas reforzadas, y el
  -- art. 18 fr. VIII la pone en quien responde por el Manual.
  if not (public.has_rol('oc') or public.es_admin_kawiil()) then
    raise exception 'Sólo el Oficial de Cumplimiento puede bajar el nivel de diligencia.';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception
      'Falta la motivación. Una bajada sin motivo escrito no se puede defender ante una '
      'verificación, y es justo lo que distingue una decisión de un ajuste.';
  end if;

  if array_position(array['N1','N2','N3'], p_hacia::text)
     >= array_position(array['N1','N2','N3'], v_actual::text) then
    raise exception 'Esto es para BAJAR el nivel. De % a % no es una bajada; las subidas las hace sincronizar_nivel_diligencia() con los hechos.',
      v_actual, p_hacia;
  end if;

  -- Y no se puede bajar por debajo de lo que los hechos exigen HOY. Firmar no
  -- convierte un piso activo en inexistente.
  if array_position(array['N1','N2','N3'], p_hacia::text)
     < array_position(array['N1','N2','N3'],
         (select nivel::text from public.nivel_diligencia_exigido(p_client))) then
    raise exception
      'Los hechos del expediente exigen hoy %, así que no se puede bajar a %. Firmar no cambia '
      'los hechos: primero tienen que cambiar ellos.',
      (select nivel from public.nivel_diligencia_exigido(p_client)), p_hacia;
  end if;

  perform set_config('ikan.baja_nivel_autorizada', p_client::text, true);
  update client set nivel_kyc = p_hacia where id = p_client;
  perform set_config('ikan.baja_nivel_autorizada', '', true);

  insert into cambio_nivel_diligencia
    (organization_id, client_id, desde, hacia, motivo, automatico, firmado_por)
  values (v_org, p_client, v_actual, p_hacia, btrim(p_motivo), false, v_uid);

  perform public.registrar_evento(
    v_org, 'nivel_diligencia_bajado', 'client', p_client,
    jsonb_build_object(
      'desde', v_actual, 'hacia', p_hacia, 'motivo', btrim(p_motivo),
      'fuente', 'Kawiil Mx · Adenda 4 del 01/09/2026, apartado 7.2.',
      'requisito', 'Los hechos subyacentes tienen que haber cambiado y la reevaluación semestral '
                || 'del Cap. III Bis constatarlo. La firma no sustituye a los hechos: la función '
                || 'rechaza bajar por debajo de lo que los hechos exigen hoy.'
    ),
    'persona', v_uid
  );

  return p_hacia;
end $$;

comment on function public.bajar_nivel_diligencia(uuid, nivel_kyc, text) is
  'La ÚNICA vía para bajar el nivel de diligencia. Exige rol de OC, motivo '
  'escrito, y que los hechos ya no exijan el nivel que se deja: firmar no '
  'convierte un piso activo en inexistente.';

revoke all on function public.bajar_nivel_diligencia(uuid, nivel_kyc, text) from public, anon;
grant execute on function public.bajar_nivel_diligencia(uuid, nivel_kyc, text) to authenticated;

-- ---------------------------------------------------------------------
-- Poner al día lo que ya está
-- ---------------------------------------------------------------------
-- Todos los expedientes existentes nacieron en N1 por el defecto viejo. Ninguno
-- de ellos está ahí porque alguien haya comprobado que cabe la simplificación:
-- están ahí porque era el valor por omisión. Se suben a N2, que es el nivel de
-- todo cliente, y después se sincroniza por si los hechos exigen N3.
--
-- No se toca ninguno que ya esté en N2 o N3: subirlos no aplica y bajarlos no
-- se hace nunca automáticamente.
do $$
declare
  v_cli   record;
  v_n1    int := 0;
  v_n3    int := 0;
  v_nuevo nivel_kyc;
begin
  for v_cli in select id, organization_id from client where nivel_kyc = 'N1' loop
    update client set nivel_kyc = 'N2' where id = v_cli.id;
    insert into cambio_nivel_diligencia
      (organization_id, client_id, desde, hacia, motivo, automatico)
    values (v_cli.organization_id, v_cli.id, 'N1', 'N2',
      'Puesta al día de la Adenda 4, instrucción 42. Estaba en N1 por el valor por omisión '
      || 'anterior, no porque constara que cabe la diligencia simplificada: N1 exige un supuesto '
      || 'de simplificación de las Reglas Y clasificación de riesgo bajo.', true);
    v_n1 := v_n1 + 1;
  end loop;

  -- Y ahora sí, los que los hechos exigen en N3.
  for v_cli in select id from client where nivel_kyc <> 'N3' loop
    v_nuevo := public.sincronizar_nivel_diligencia(v_cli.id);
    if v_nuevo = 'N3' then v_n3 := v_n3 + 1; end if;
  end loop;

  raise notice '% expediente(s) de N1 a N2; de ellos y del resto, % quedaron en N3 por sus hechos.',
    v_n1, v_n3;
end $$;

-- Y que no quede ninguno en N1 sin haberlo declarado. Es la comprobación que
-- distingue «se puso al día» de «se cambió el default y ya».
do $$
declare v_n int;
begin
  select count(*) into v_n from client where nivel_kyc = 'N1';
  if v_n > 0 then
    raise exception 'Quedaron % expediente(s) en N1. Ninguno debería: N1 se declara, no se hereda.', v_n;
  end if;
end $$;
