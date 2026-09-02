-- =====================================================================
-- 0059 · El expediente reforzado: quién aprueba y qué se recaba de los allegados
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 5 del 01/09/2026,
-- apartados 1 y 2. Instrucciones 49 a 56.
--
-- ---------------------------------------------------------------------
-- 1. «Un directivo o su equivalente»: no se inventa una jerarquía
-- ---------------------------------------------------------------------
-- El art. 23 Ter 5 exige la aprobación de «un directivo o su equivalente», y
-- esas tres últimas palabras resuelven el problema: la regla no exige un cargo
-- llamado directivo, exige que apruebe quien ocupe la posición de mayor
-- responsabilidad. En una notaría el sujeto obligado es una persona física que
-- ejerce una función pública: no hay consejo ni dirección general, y el
-- equivalente es el notario titular.
--
-- Así que NO se crea el rol «directivo». Se añade al acto de aprobación un
-- campo de calidad —en qué carácter se aprueba— y se conservan los tres roles
-- que hay.
--
-- ---------------------------------------------------------------------
-- 2. La autoaprobación se admite, pero no se disimula
-- ---------------------------------------------------------------------
-- Cuando el aprobador es también el Oficial de Cumplimiento, la aprobación deja
-- de ser un segundo par de ojos y se convierte en una constancia de que alguien
-- asumió la decisión. Eso tiene valor —fija responsabilidad y fecha— pero no
-- detecta errores propios, y conviene no fingir que sí.
--
-- El booleano de autoaprobación lo CALCULA la base comparando identidades, y no
-- lo declara nadie. Un dato declarado sobre uno mismo, en el campo que sirve
-- para señalar el conflicto, es el que nunca se marca.
--
-- ---------------------------------------------------------------------
-- 3. Del cónyuge y los dependientes se piden cuatro datos, no diez
-- ---------------------------------------------------------------------
-- El art. 23 Ter 4 fr. I inciso b) remite al Manual precisamente para que el
-- alcance sea proporcional. Pedir domicilio, ocupación, teléfono y correo de un
-- cónyuge que NO es cliente excedería lo necesario, adecuado y relevante del
-- art. 12 de la ley de datos personales, y sobre un tercero que no consintió
-- nada. El propósito es detectar interposición y vínculo patrimonial: para eso
-- bastan los datos que identifican.
--
-- Son los MISMOS cuatro del beneficiario controlador, y la coincidencia es
-- deliberada: mismo propósito, mismo alcance, un solo componente de captura.
-- =====================================================================

-- ---------------------------------------------------------------------
-- El expediente reforzado y su aprobación
-- ---------------------------------------------------------------------
do $$ begin
  create type calidad_aprobacion as enum (
    'notario_titular',        -- el equivalente al directivo en una notaría
    'oficial_cumplimiento',
    'directivo_designado'     -- cuando la organización sí tiene esa figura
  );
exception when duplicate_object then null; end $$;

create table if not exists expediente_reforzado (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete cascade,

  /** Aprobación de un directivo o su equivalente, ANTES de operar (art. 23 Ter 5). */
  aprobado_por uuid references auth.users(id),
  aprobado_en timestamptz,
  calidad calidad_aprobacion,
  /**
   * Calculado, NUNCA declarado. Ver la nota 2 de arriba: un dato declarado
   * sobre uno mismo, en el campo que sirve para señalar el conflicto, es el que
   * nunca se marca.
   */
  autoaprobacion boolean not null default false,
  /**
   * Sobre qué versión del expediente se aprobó.
   *
   * Sin esto, una aprobación firmada hoy parecería cubrir lo que se añada
   * mañana. Se guarda la secuencia de la evaluación vigente al aprobar, que es
   * el reloj del expediente.
   */
  evaluacion_secuencia bigint,

  notas text,
  creado_en timestamptz not null default now()
);

alter table expediente_reforzado drop constraint if exists expediente_reforzado_un_cliente;
alter table expediente_reforzado
  add constraint expediente_reforzado_un_cliente unique (client_id);

-- Aprobado significa aprobado por alguien, en alguna calidad y en una fecha.
-- Las tres cosas o ninguna: media aprobación no es una aprobación.
alter table expediente_reforzado drop constraint if exists expediente_reforzado_aprobacion_completa;
alter table expediente_reforzado
  add constraint expediente_reforzado_aprobacion_completa
  check (
    (aprobado_por is null and aprobado_en is null and calidad is null)
    or (aprobado_por is not null and aprobado_en is not null and calidad is not null)
  );

comment on table expediente_reforzado is
  'El expediente reforzado del art. 23 Ter 4 y su aprobación del 23 Ter 5. La '
  'aprobación va antes de operar y se registra con la calidad en que se dio: no '
  'se crea un rol «directivo» porque la regla dice «o su equivalente», y en una '
  'notaría el equivalente es el notario titular.';
comment on column expediente_reforzado.autoaprobacion is
  'Calculado por comparación de identidades, jamás declarado por quien captura. '
  'Cuando el aprobador es también el Oficial de Cumplimiento la aprobación deja '
  'de ser un segundo par de ojos: sigue fijando responsabilidad y fecha, pero no '
  'detecta errores propios, y el compensatorio es la revisión total en la '
  'auditoría anual.';

create index if not exists idx_expediente_reforzado_cliente
  on expediente_reforzado(client_id);
-- Los que la auditoría anual tiene que revisar al cien por ciento.
create index if not exists idx_expediente_reforzado_autoaprobados
  on expediente_reforzado(organization_id) where autoaprobacion;

alter table expediente_reforzado enable row level security;
drop policy if exists "expediente_reforzado_org" on expediente_reforzado;
create policy "expediente_reforzado_org" on expediente_reforzado for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());
revoke all on expediente_reforzado from anon;

-- ---------------------------------------------------------------------
-- Aprobar, con las tres reglas que la adenda pone
-- ---------------------------------------------------------------------
create or replace function public.aprobar_expediente_reforzado(
  p_client uuid,
  p_calidad calidad_aprobacion,
  p_notas text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org    uuid;
  v_uid    uuid := auth.uid();
  v_id     uuid;
  v_auto   boolean;
  v_seq    bigint;
  v_nivel  nivel_kyc;
begin
  select organization_id, nivel_kyc into v_org, v_nivel from client where id = p_client;
  if v_org is null then
    raise exception 'El cliente % no existe.', p_client;
  end if;
  if v_org <> public.current_org_id() and not public.es_admin_kawiil() then
    raise exception 'Ese expediente no es de tu organización.';
  end if;

  -- Instrucción 51: el operador NO aprueba nunca, ni por delegación ni por
  -- ausencia del titular. Si el titular no está, el expediente espera. Un
  -- permiso que se afloja «sólo por hoy» deja de ser un control.
  if not (public.has_rol('oc') or public.has_rol('admin') or public.es_admin_kawiil()) then
    raise exception
      'Sólo el Oficial de Cumplimiento, el notario titular o un directivo designado pueden '
      'aprobar un expediente reforzado. El rol operador no aprueba, ni por ausencia del titular: '
      'si el titular no está, el expediente espera.';
  end if;

  -- El expediente reforzado es para riesgo alto. Aprobarlo sobre uno que no lo
  -- es no rompe nada, pero significa que alguien está aplicando medidas
  -- reforzadas donde no tocan y conviene que se vea.
  if v_nivel <> 'N3' then
    raise warning
      'El expediente % está en nivel % y el expediente reforzado es para N3. Se registra, pero '
      'revisa si es lo que querías.', p_client, v_nivel;
  end if;

  -- Instrucción 50: la autoaprobación se CALCULA. Es verdadera cuando quien
  -- aprueba es también Oficial de Cumplimiento de la organización, o cuando es
  -- quien capturó el expediente.
  v_auto := public.has_rol('oc')
         or exists (select 1 from client c where c.id = p_client and c.capturado_por = v_uid);

  -- La versión sobre la que se aprueba: sin ella, una aprobación firmada hoy
  -- parecería cubrir lo que se añada mañana.
  select max(a.secuencia) into v_seq
    from client_risk_assessment a where a.client_id = p_client;

  insert into expediente_reforzado
    (organization_id, client_id, aprobado_por, aprobado_en, calidad,
     autoaprobacion, evaluacion_secuencia, notas)
  values (v_org, p_client, v_uid, now(), p_calidad, v_auto, v_seq, nullif(btrim(p_notas), ''))
      on conflict (client_id) do update
     set aprobado_por = excluded.aprobado_por,
         aprobado_en = excluded.aprobado_en,
         calidad = excluded.calidad,
         autoaprobacion = excluded.autoaprobacion,
         evaluacion_secuencia = excluded.evaluacion_secuencia,
         notas = excluded.notas
  returning id into v_id;

  perform public.registrar_evento(
    v_org, 'expediente_reforzado_aprobado', 'client', p_client,
    jsonb_build_object(
      'calidad', p_calidad,
      'autoaprobacion', v_auto,
      'evaluacion_secuencia', v_seq,
      'fuente', 'Kawiil Mx · Adenda 5 del 01/09/2026, apartado 1. Art. 23 Ter 5 de las RCG.',
      'directivo', 'No se creó el rol «directivo»: la regla dice «o su equivalente» y en una '
                || 'notaría el equivalente es el notario titular. Inventar una jerarquía que no '
                || 'existe sería menos defendible que nombrar la que sí.',
      'autoaprobacion_nota', case when v_auto
        then 'El aprobador coincide con el Oficial de Cumplimiento o con quien capturó el '
          || 'expediente. La aprobación fija responsabilidad y fecha, pero no es un segundo par '
          || 'de ojos. Compensatorio: revisión al 100 % en la auditoría anual del art. 18 fr. XI.'
        else 'Hay separación real entre quien capturó y quien aprobó.' end,
      'operador', 'El rol operador no puede aprobar, ni por delegación ni por ausencia del '
               || 'titular. Un permiso que se afloja «sólo por hoy» deja de ser un control.'
    ),
    'persona', v_uid
  );

  return v_id;
end $$;

comment on function public.aprobar_expediente_reforzado(uuid, calidad_aprobacion, text) is
  'Aprueba el expediente reforzado. El operador nunca puede; la autoaprobación '
  'se calcula comparando identidades y jamás se declara.';

revoke all on function public.aprobar_expediente_reforzado(uuid, calidad_aprobacion, text)
  from public, anon;
grant execute on function public.aprobar_expediente_reforzado(uuid, calidad_aprobacion, text)
  to authenticated;

-- Instrucción 53: los que la auditoría anual revisa al cien por ciento.
create or replace function public.expedientes_para_revision_total(p_org uuid default null)
returns table (client_id uuid, nombre text, aprobado_en timestamptz, calidad text)
language sql stable security definer set search_path = public as $$
  select e.client_id, c.nombre_razon_social, e.aprobado_en, e.calidad::text
    from expediente_reforzado e
    join client c on c.id = e.client_id
   where e.autoaprobacion
     and c.nivel_kyc = 'N3'
     and e.organization_id = coalesce(p_org, public.current_org_id())
   order by e.aprobado_en desc;
$$;

comment on function public.expedientes_para_revision_total(uuid) is
  'Expedientes de riesgo alto con autoaprobación. Se revisan al 100 % en la '
  'auditoría del art. 18 fr. XI, frente a un muestreo para los demás: es el '
  'control compensatorio de que la firma se dio a sí misma.';

revoke all on function public.expedientes_para_revision_total(uuid) from public, anon;
grant execute on function public.expedientes_para_revision_total(uuid) to authenticated;

-- =====================================================================
-- Los allegados: cónyuge, dependientes y sociedades vinculadas
-- =====================================================================
do $$ begin
  create type vinculo_allegado as enum (
    'conyuge',
    'concubina_concubinario',
    'dependiente_economico',
    'sociedad_vinculo_patrimonial',
    'otro'
  );
exception when duplicate_object then null; end $$;

create table if not exists allegado (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete cascade,

  vinculo vinculo_allegado not null,
  /** «Otro» sin justificación se convierte en el nuevo texto libre y el
   *  catálogo no habrá servido de nada. */
  justificacion_vinculo text,

  tipo_persona tipo_persona not null,
  -- Los MISMOS cuatro campos del beneficiario controlador. La coincidencia es
  -- deliberada: mismo propósito, mismo alcance, un solo componente de captura.
  apellido_paterno text,
  apellido_materno text,
  nombre text,
  /** En persona moral, la denominación o razón social. */
  razon_social text,
  /** Nacimiento en física, constitución en moral. */
  fecha date,
  pais_clave text,
  curp text,
  rfc text,
  sin_curp boolean not null default false,
  sin_rfc boolean not null default false,
  /** Sólo en sociedades y asociaciones vinculadas, cuando exista. */
  porcentaje_participacion numeric(7,4)
    check (porcentaje_participacion is null
           or porcentaje_participacion between 0 and 100),

  capturado_por uuid references auth.users(id),
  capturado_en timestamptz not null default now()
);

alter table allegado drop constraint if exists allegado_otro_justificado;
alter table allegado
  add constraint allegado_otro_justificado
  check (vinculo <> 'otro' or coalesce(btrim(justificacion_vinculo), '') <> '');

alter table allegado drop constraint if exists allegado_nombre_segun_tipo;
alter table allegado
  add constraint allegado_nombre_segun_tipo
  check (
    (tipo_persona = 'fisica'
      and coalesce(btrim(apellido_paterno), '') <> '' and coalesce(btrim(nombre), '') <> '')
    or (tipo_persona = 'moral' and coalesce(btrim(razon_social), '') <> '')
  );

comment on table allegado is
  'Cónyuge, dependientes económicos y sociedades con vínculo patrimonial (art. '
  '23 Ter 4 fr. I inciso b). CUATRO campos, no diez: pedir domicilio, ocupación '
  'y teléfono de un cónyuge que no es cliente excedería lo necesario, adecuado '
  'y relevante del art. 12 de la ley de datos personales, y sobre un tercero '
  'que no consintió nada. El propósito es detectar interposición, y para eso '
  'basta con identificar.';

create index if not exists idx_allegado_cliente on allegado(client_id);

alter table allegado enable row level security;
drop policy if exists "allegado_org" on allegado;
create policy "allegado_org" on allegado for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());
revoke all on allegado from anon;

-- ---------------------------------------------------------------------
-- Las respuestas negativas, que son respuestas
-- ---------------------------------------------------------------------
-- Instrucción 55. El «en su caso» del texto significa PREGUNTAR y registrar la
-- respuesta, incluso cuando sea negativa. «No tiene cónyuge» y «nadie ha
-- preguntado» son cosas distintas ante una verificación, y el campo vacío las
-- representa igual —el mismo error que el default en el nivel más laxo y que la
-- subdivisión sin capturar—.
create table if not exists allegado_sin_declarar (
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete cascade,
  vinculo vinculo_allegado not null,
  /** Quién preguntó y cuándo. Una negativa sin fecha no acredita que se
   *  preguntara antes del acto. */
  declarado_por uuid references auth.users(id),
  declarado_en timestamptz not null default now(),
  primary key (client_id, vinculo)
);

comment on table allegado_sin_declarar is
  'Respuestas NEGATIVAS explícitas: «no tiene cónyuge», «no declara '
  'dependientes económicos». Se guardan con fecha porque «no tiene» y «nadie ha '
  'preguntado» son cosas distintas ante una verificación, y el campo vacío las '
  'representa igual.';

alter table allegado_sin_declarar enable row level security;
drop policy if exists "allegado_sin_declarar_org" on allegado_sin_declarar;
create policy "allegado_sin_declarar_org" on allegado_sin_declarar for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());
revoke all on allegado_sin_declarar from anon;

-- ---------------------------------------------------------------------
-- Qué falta preguntar
-- ---------------------------------------------------------------------
-- Los tres vínculos que el texto enumera tienen que estar contestados: con al
-- menos un allegado, o con una negativa explícita. Sin esta función el hueco
-- sería invisible, porque un expediente sin allegados y uno donde nadie
-- preguntó se ven idénticos.
create or replace function public.allegados_sin_preguntar(p_client uuid)
returns table (vinculo text)
language sql stable security definer set search_path = public as $$
  select v.vinculo
    from (values ('conyuge'), ('dependiente_economico'), ('sociedad_vinculo_patrimonial'))
         as v(vinculo)
   where not exists (
     select 1 from allegado a
      where a.client_id = p_client and a.vinculo::text = v.vinculo)
     and not exists (
     select 1 from allegado_sin_declarar s
      where s.client_id = p_client and s.vinculo::text = v.vinculo);
$$;

comment on function public.allegados_sin_preguntar(uuid) is
  'Vínculos que ni tienen allegado registrado ni negativa explícita. Sin esto el '
  'hueco es invisible: un expediente sin allegados y uno donde nadie preguntó se '
  'ven idénticos.';

revoke all on function public.allegados_sin_preguntar(uuid) from public, anon;
grant execute on function public.allegados_sin_preguntar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Cuándo escalan a documentación
-- ---------------------------------------------------------------------
-- Instrucción 56. SÓLO cuando el cliente sea PPE extranjera, por mandato del
-- art. 23 Ter 4 fr. III. Es el único supuesto en que se piden documentos de un
-- tercero, y pedirlos en más casos sería recabar documentación de personas que
-- no son clientes sin fundamento.
create or replace function public.allegados_exigen_documentacion(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from client c
     where c.id = p_client
       and c.condicion_pep in ('pep_extranjera', 'familiar_o_asociado')
  );
$$;

comment on function public.allegados_exigen_documentacion(uuid) is
  'Si hay que recabar DOCUMENTACIÓN de los allegados y no sólo sus datos. Sólo '
  'con PPE extranjera (art. 23 Ter 4 fr. III): es el único supuesto en que se '
  'piden documentos de un tercero.';

revoke all on function public.allegados_exigen_documentacion(uuid) from public, anon;
grant execute on function public.allegados_exigen_documentacion(uuid) to authenticated;
