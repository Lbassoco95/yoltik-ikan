-- =====================================================================
-- Adenda 5 (0059 a 0062) aplicada POR PASOS
-- =====================================================================
-- Mismo contenido que:
--   supabase/migrations/0059_expediente_reforzado.sql
--   supabase/migrations/0060_origen_de_recursos.sql
--   supabase/migrations/0061_cuestionario_y_secretaria.sql
--   supabase/migrations/0062_oc_designado_y_aprobacion_del_acto.sql
--   supabase/seed/20_asientos_metodologicos.sql
--
--   Paso 1 · expediente reforzado, su aprobación y los allegados
--   Paso 2 · los catálogos de origen de recursos y de tipos de documento
--   Paso 3 · lo declarado, lo aportado, el bucket y las reglas de suficiencia
--   Paso 4 · el cuestionario reforzado, su firma y la Secretaría de Economía
--   Paso 5 · el asiento en la bitácora, y las comprobaciones
--   Paso 6 · el OC designado, la vigencia de la aprobación y el acto
--
-- El editor SQL de Supabase envuelve TODO el script en una sola transacción:
-- un error a la mitad revierte lo anterior. Por eso van cinco bloques, uno por
-- ejecución, y cada uno termina con una consulta de control que devuelve un
-- número. Si el número no es el esperado, PARA y avísame antes del siguiente.
--
-- Ninguno de los seis borra nada.
-- =====================================================================



-- #####################################################################
-- PASO 1 · Expediente reforzado, su aprobación y los allegados
-- #####################################################################
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


-- ---------------------------------------------------------------------
-- CONTROL del paso 1. Esperado: tablas = 3, fns = 3
-- ---------------------------------------------------------------------
select (select count(*) from information_schema.tables
         where table_name in ('expediente_reforzado','allegado','allegado_sin_declarar')) as tablas,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('aprobar_expediente_reforzado','expedientes_para_revision_total',
                             'allegados_sin_preguntar')) as fns;


-- #####################################################################
-- PASO 2 · Los catálogos de origen de recursos y tipos de documento
-- #####################################################################
-- =====================================================================
-- 0060 · El soporte del origen de los recursos
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 5 del 01/09/2026,
-- apartado 4. Instrucciones 60, 61 y 62.
--
-- ---------------------------------------------------------------------
-- El catálogo no basta: hacen falta los metadatos
-- ---------------------------------------------------------------------
-- Sin lista cerrada, la carga de documentos es un archivo con una etiqueta que
-- escribe quien sube. Pero el catálogo de tipos por sí solo tampoco resuelve:
-- lo que permite distinguir después un estado de cuenta de una selfie SIN abrir
-- el archivo son los metadatos, y por eso son obligatorios.
--
-- Cuatro, y cada uno responde a una pregunta distinta:
--
--   tipo      · qué es, del catálogo cerrado
--   emisor    · quién lo hizo, y si fue el propio cliente o un tercero. Es el
--               dato que distingue un documento que CORROBORA de uno que sólo
--               repite lo que el cliente dijo.
--   fecha     · cuándo, y qué periodo cubre si es periódico
--   monto     · cuánto acredita, en su moneda
--
-- ---------------------------------------------------------------------
-- El catálogo es metodología propia, y así se cita
-- ---------------------------------------------------------------------
-- Ni la Ley ni las Reglas enumeran documentos admisibles de origen de recursos:
-- lo que exigen es conocer el origen y conservar el soporte. Esta lista es
-- defendible por estar escrita y ser cerrada, no por provenir de la autoridad.
-- =====================================================================

create table if not exists origen_recursos (
  clave text primary key,
  nombre text not null,
  orden int not null,
  vigente boolean not null default true
);

comment on table origen_recursos is
  'Los orígenes de recursos que Cumplimiento admite. Catálogo CERRADO: con '
  'texto libre, la carga de documentos es un archivo con una etiqueta que '
  'escribe quien sube.';

insert into origen_recursos (clave, nombre, orden) values
  ('sueldos_salarios', 'Sueldos y salarios', 1),
  ('actividad_empresarial', 'Actividad empresarial o profesional', 2),
  ('enajenacion_inmueble', 'Enajenación de un bien inmueble', 3),
  ('enajenacion_otros', 'Enajenación de otros bienes', 4),
  ('credito', 'Crédito o financiamiento', 5),
  ('herencia', 'Herencia o legado', 6),
  ('donacion', 'Donación', 7),
  ('dividendos', 'Dividendos o reducción de capital', 8),
  ('ahorro', 'Ahorro acumulado', 9),
  ('activos_virtuales', 'Enajenación de activos virtuales', 10),
  ('indemnizacion', 'Indemnización, seguro o premio', 11),
  ('tercero', 'Recursos de un tercero', 12)
on conflict (clave) do update set nombre = excluded.nombre, orden = excluded.orden;

create table if not exists tipo_documento_origen (
  clave text primary key,
  nombre text not null,
  /**
   * Si por su naturaleza lo emite un TERCERO —institución financiera, notario,
   * autoridad fiscal— o el propio cliente. Es lo que permite exigir, en riesgo
   * alto, al menos un documento que corrobore en vez de reiterar.
   */
  emisor_tercero_por_naturaleza boolean not null,
  vigente boolean not null default true
);

comment on column tipo_documento_origen.emisor_tercero_por_naturaleza is
  'Un documento que el propio cliente emite no corrobora su dicho, lo reitera. '
  'En riesgo alto se exige al menos uno emitido por un tercero.';

insert into tipo_documento_origen (clave, nombre, emisor_tercero_por_naturaleza) values
  ('cfdi_nomina', 'CFDI de nómina', true),
  ('constancia_percepciones', 'Constancia de percepciones y retenciones', true),
  ('estado_cuenta', 'Estado de cuenta bancario', true),
  ('declaracion_anual', 'Declaración anual del ISR', true),
  ('pagos_provisionales', 'Pagos provisionales', true),
  ('cfdi_emitido', 'CFDI emitido', false),
  ('escritura_enajenacion', 'Escritura pública de enajenación previa', true),
  ('comprobante_operacion', 'CFDI o comprobante de la operación', false),
  ('constancia_isr_enajenacion', 'Constancia de pago del ISR por enajenación', true),
  ('avaluo', 'Avalúo', true),
  ('contrato_compraventa', 'Contrato de compraventa', false),
  ('factura', 'Factura o CFDI', false),
  ('comprobante_transferencia', 'Comprobante de la transferencia', true),
  ('contrato_credito', 'Contrato de crédito', true),
  ('estado_cuenta_credito', 'Estado de cuenta del crédito', true),
  ('carta_disposicion', 'Carta de autorización o instrucción de disposición', true),
  ('escritura_adjudicacion', 'Escritura de adjudicación por herencia', true),
  ('resolucion_judicial', 'Resolución judicial', true),
  ('declaracion_informativa', 'Declaración informativa', true),
  ('escritura_donacion', 'Escritura o contrato de donación', true),
  ('acta_asamblea', 'Acta de asamblea que decreta dividendos', false),
  ('constancia_retencion', 'Constancia de retención', true),
  ('comprobante_plataforma_av', 'Comprobante de plataforma de activos virtuales', true),
  ('poliza_seguro', 'Póliza y comprobante de pago', true),
  ('constancia_premio', 'Constancia de entrega del premio y su retención', true),
  ('identificacion_tercero', 'Identificación del tercero aportante', true),
  ('acredita_origen_tercero', 'Documento que acredita el origen en el patrimonio del tercero', true),
  ('acredita_vinculo', 'Documento que acredita el vínculo con el tercero', true),
  ('contrato_entrega', 'Contrato o instrucción que documenta la entrega', false),
  -- Existe, y con condiciones. Sin ellas, «otro» se convierte en el nuevo texto
  -- libre y el catálogo no habrá servido de nada.
  ('otro', 'Otro (requiere justificación y revisión del OC)', false)
on conflict (clave) do update
  set nombre = excluded.nombre,
      emisor_tercero_por_naturaleza = excluded.emisor_tercero_por_naturaleza;

-- Qué documentos admite cada origen. La tabla existe para que la pantalla
-- ofrezca sólo lo que corresponde: un desplegable con los treinta tipos en
-- cualquier origen es otra forma de texto libre.
create table if not exists documento_admitido_por_origen (
  origen_clave text not null references origen_recursos(clave) on delete cascade,
  tipo_clave text not null references tipo_documento_origen(clave) on delete cascade,
  primary key (origen_clave, tipo_clave)
);

insert into documento_admitido_por_origen (origen_clave, tipo_clave) values
  ('sueldos_salarios','cfdi_nomina'), ('sueldos_salarios','constancia_percepciones'),
  ('sueldos_salarios','estado_cuenta'),
  ('actividad_empresarial','declaracion_anual'), ('actividad_empresarial','pagos_provisionales'),
  ('actividad_empresarial','estado_cuenta'), ('actividad_empresarial','cfdi_emitido'),
  ('enajenacion_inmueble','escritura_enajenacion'), ('enajenacion_inmueble','comprobante_operacion'),
  ('enajenacion_inmueble','constancia_isr_enajenacion'), ('enajenacion_inmueble','avaluo'),
  ('enajenacion_otros','contrato_compraventa'), ('enajenacion_otros','factura'),
  ('enajenacion_otros','comprobante_transferencia'),
  ('credito','contrato_credito'), ('credito','estado_cuenta_credito'),
  ('credito','carta_disposicion'),
  ('herencia','escritura_adjudicacion'), ('herencia','resolucion_judicial'),
  ('herencia','declaracion_informativa'),
  ('donacion','escritura_donacion'), ('donacion','comprobante_transferencia'),
  ('dividendos','acta_asamblea'), ('dividendos','constancia_retencion'),
  ('dividendos','estado_cuenta'),
  ('ahorro','estado_cuenta'),
  ('activos_virtuales','comprobante_plataforma_av'), ('activos_virtuales','estado_cuenta'),
  ('indemnizacion','poliza_seguro'), ('indemnizacion','constancia_premio'),
  ('tercero','identificacion_tercero'), ('tercero','acredita_origen_tercero'),
  ('tercero','acredita_vinculo'), ('tercero','contrato_entrega')
on conflict do nothing;

-- Y «otro» se admite en todos, porque el mundo no cabe en una lista. Con su
-- justificación y su revisión, que es lo que impide que sea la salida fácil.
insert into documento_admitido_por_origen (origen_clave, tipo_clave)
select o.clave, 'otro' from origen_recursos o on conflict do nothing;

alter table origen_recursos enable row level security;
alter table tipo_documento_origen enable row level security;
alter table documento_admitido_por_origen enable row level security;
drop policy if exists "origen_recursos_select" on origen_recursos;
create policy "origen_recursos_select" on origen_recursos for select using (true);
drop policy if exists "tipo_documento_origen_select" on tipo_documento_origen;
create policy "tipo_documento_origen_select" on tipo_documento_origen for select using (true);
drop policy if exists "documento_admitido_select" on documento_admitido_por_origen;
create policy "documento_admitido_select" on documento_admitido_por_origen for select using (true);
revoke all on origen_recursos, tipo_documento_origen, documento_admitido_por_origen from anon;
revoke insert, update, delete
  on origen_recursos, tipo_documento_origen, documento_admitido_por_origen from authenticated;
grant select on origen_recursos, tipo_documento_origen, documento_admitido_por_origen to authenticated;


-- ---------------------------------------------------------------------
-- CONTROL del paso 2. Esperado: origenes = 12, tipos = 30, admitidos = 46
-- ---------------------------------------------------------------------
select (select count(*) from origen_recursos) as origenes,
       (select count(*) from tipo_documento_origen) as tipos,
       (select count(*) from documento_admitido_por_origen) as admitidos;


-- #####################################################################
-- PASO 3 · Lo declarado, lo aportado, el bucket y la suficiencia
-- #####################################################################
-- =====================================================================
-- Lo declarado y lo aportado
-- =====================================================================
create table if not exists origen_declarado (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete cascade,
  origen_clave text not null references origen_recursos(clave),
  /** Cuánto viene de este origen, para poder comparar contra el acto. */
  monto_mxn numeric(18,2) check (monto_mxn is null or monto_mxn >= 0),
  detalle text,
  declarado_por uuid references auth.users(id),
  declarado_en timestamptz not null default now(),
  unique (client_id, origen_clave)
);

alter table origen_declarado enable row level security;
drop policy if exists "origen_declarado_org" on origen_declarado;
create policy "origen_declarado_org" on origen_declarado for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());
revoke all on origen_declarado from anon;

create table if not exists documento_origen (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete cascade,
  origen_clave text not null references origen_recursos(clave),

  -- Los CUATRO metadatos obligatorios. Sin ellos el documento es un archivo con
  -- etiqueta y hay que abrirlo para saber qué es.
  tipo_clave text not null references tipo_documento_origen(clave),
  emisor text not null check (btrim(emisor) <> ''),
  /** Si lo emitió el propio cliente o un tercero. Es lo que distingue un
   *  documento que corrobora de uno que reitera. */
  emitido_por_tercero boolean not null,
  fecha_documento date not null,
  periodo_desde date,
  periodo_hasta date,
  monto_acreditado numeric(18,2) check (monto_acreditado is null or monto_acreditado >= 0),
  moneda text not null default 'MXN',

  /** Complemento, NUNCA sustituto del tipo. */
  descripcion text,
  /** Obligatoria cuando el tipo es «otro»: sin ella, «otro» es el nuevo texto
   *  libre. */
  justificacion text,
  /** Revisión del OC, exigida para «otro» antes de darlo por suficiente. */
  revisado_por_oc uuid references auth.users(id),
  revisado_en timestamptz,

  storage_path text not null unique,
  nombre_archivo text not null,
  mime_type text,
  tamano_bytes bigint,
  subido_por uuid references auth.users(id),
  subido_en timestamptz not null default now()
);

alter table documento_origen drop constraint if exists documento_origen_otro_justificado;
alter table documento_origen
  add constraint documento_origen_otro_justificado
  check (tipo_clave <> 'otro' or coalesce(btrim(justificacion), '') <> '');

alter table documento_origen drop constraint if exists documento_origen_periodo_coherente;
alter table documento_origen
  add constraint documento_origen_periodo_coherente
  check (periodo_desde is null or periodo_hasta is null or periodo_hasta >= periodo_desde);

comment on table documento_origen is
  'Soporte documental del origen de recursos, con los cuatro metadatos '
  'obligatorios de la Adenda 5: sin ellos el documento es un archivo con '
  'etiqueta y hay que abrirlo para saber qué es.';
comment on column documento_origen.emitido_por_tercero is
  'Un documento que el propio cliente emite no corrobora su dicho, lo reitera. '
  'En riesgo alto se exige al menos uno de tercero.';

create index if not exists idx_documento_origen_cliente
  on documento_origen(client_id, origen_clave);

alter table documento_origen enable row level security;
drop policy if exists "documento_origen_org" on documento_origen;
create policy "documento_origen_org" on documento_origen for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());
revoke all on documento_origen from anon;

insert into storage.buckets (id, name, public, file_size_limit)
values ('origen-recursos', 'origen-recursos', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "origen_docs_select" on storage.objects;
create policy "origen_docs_select" on storage.objects for select
  using (bucket_id = 'origen-recursos'
         and (storage.foldername(name))[1] = public.current_org_id()::text);
drop policy if exists "origen_docs_insert" on storage.objects;
create policy "origen_docs_insert" on storage.objects for insert
  with check (bucket_id = 'origen-recursos'
              and (storage.foldername(name))[1] = public.current_org_id()::text);

-- =====================================================================
-- Las cinco reglas de suficiencia (instrucción 62)
-- =====================================================================
-- Ninguna BLOQUEA por sí sola, salvo la del documento de identificación. Las
-- demás levantan bandera y van al Oficial de Cumplimiento: puede haber
-- explicación legítima, y lo que hay que asegurar es que quede documentada, no
-- que el sistema decida solo.
create or replace function public.suficiencia_origen_recursos(
  p_client uuid,
  p_monto_operacion numeric default null
)
returns table (regla text, cumple boolean, detalle text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_nivel      nivel_kyc;
  v_origenes   int;
  v_sin_doc    text;
  v_terceros   int;
  v_acreditado numeric;
  v_otros      int;
begin
  select nivel_kyc into v_nivel from client where id = p_client;
  select count(*) into v_origenes from origen_declarado where client_id = p_client;

  -- 1. Al menos un documento por CADA origen declarado. Varios orígenes exigen
  --    varios soportes; no basta uno para el total.
  select string_agg(o.nombre, ', ' order by o.orden) into v_sin_doc
    from origen_declarado d
    join origen_recursos o on o.clave = d.origen_clave
   where d.client_id = p_client
     and not exists (select 1 from documento_origen x
                      where x.client_id = p_client and x.origen_clave = d.origen_clave);
  return query select
    'Un documento por cada origen declarado'::text,
    v_origenes > 0 and v_sin_doc is null,
    case when v_origenes = 0 then 'No hay ningún origen declarado.'
         when v_sin_doc is null then 'Todos los orígenes tienen soporte.'
         else 'Sin soporte: ' || v_sin_doc end;

  -- 2. En riesgo alto, al menos uno emitido por un TERCERO.
  select count(*) into v_terceros
    from documento_origen where client_id = p_client and emitido_por_tercero;
  return query select
    'En riesgo alto, al menos un documento de tercero'::text,
    v_nivel <> 'N3' or v_terceros > 0,
    case when v_nivel <> 'N3' then 'No aplica: el expediente no está en riesgo alto.'
         when v_terceros > 0 then v_terceros || ' documento(s) emitidos por terceros.'
         else 'Todos los documentos los emitió el propio cliente. Un documento que el cliente '
           || 'emite no corrobora su dicho, lo reitera.' end;

  -- 3. La suma acreditada alcanza el monto de la operación.
  select coalesce(sum(monto_acreditado), 0) into v_acreditado
    from documento_origen where client_id = p_client;
  return query select
    'Lo acreditado alcanza el monto de la operación'::text,
    p_monto_operacion is null or v_acreditado >= p_monto_operacion,
    case when p_monto_operacion is null then 'Sin monto de operación con el que comparar.'
         when v_acreditado >= p_monto_operacion
           then 'Acreditado ' || v_acreditado || ' contra ' || p_monto_operacion || '.'
         else 'Acreditado ' || v_acreditado || ' contra ' || p_monto_operacion
           || '. Puede haber explicación legítima; hay que documentarla.' end;

  -- 4. Los «otro» revisados por el OC.
  select count(*) into v_otros
    from documento_origen
   where client_id = p_client and tipo_clave = 'otro' and revisado_por_oc is null;
  return query select
    'Los documentos «otro» revisados por el Oficial de Cumplimiento'::text,
    v_otros = 0,
    case when v_otros = 0 then 'Ninguno pendiente de revisión.'
         else v_otros || ' documento(s) «otro» sin revisar. Sin esa condición «otro» se '
           || 'convierte en el nuevo texto libre y el catálogo no habrá servido de nada.' end;
end $$;

comment on function public.suficiencia_origen_recursos(uuid, numeric) is
  'Las reglas de suficiencia del apartado 4.3 de la Adenda 5. Ninguna bloquea '
  'por sí sola: levantan bandera y van al OC, porque puede haber explicación '
  'legítima y lo que hay que asegurar es que quede documentada.';

revoke all on function public.suficiencia_origen_recursos(uuid, numeric) from public, anon;
grant execute on function public.suficiencia_origen_recursos(uuid, numeric) to authenticated;

-- La quinta regla SÍ bloquea, y por eso va en un check y no en un informe: el
-- documento de identificación no acredita origen de recursos nunca, y admitirlo
-- «en ese apartado» dejaría expedientes donde la identificación pasa por
-- soporte patrimonial.
alter table documento_origen drop constraint if exists documento_origen_no_es_identificacion;
alter table documento_origen
  add constraint documento_origen_no_es_identificacion
  check (tipo_clave <> 'identificacion_tercero' or origen_clave = 'tercero');

comment on constraint documento_origen_no_es_identificacion on documento_origen is
  'La identificación sólo cuenta en el origen «recursos de un tercero», donde '
  'acredita QUIÉN es el tercero. En cualquier otro origen una identificación no '
  'acredita patrimonio, y admitirla dejaría expedientes donde la identificación '
  'pasa por soporte de origen de recursos.';


-- ---------------------------------------------------------------------
-- CONTROL del paso 3. Esperado: tablas = 2, bucket = 1, fn = 1
-- ---------------------------------------------------------------------
select (select count(*) from information_schema.tables
         where table_name in ('origen_declarado','documento_origen')) as tablas,
       (select count(*) from storage.buckets where id = 'origen-recursos') as bucket,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'suficiencia_origen_recursos') as fn;


-- #####################################################################
-- PASO 4 · El cuestionario reforzado, su firma y la Secretaría de Economía
-- #####################################################################
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


-- ---------------------------------------------------------------------
-- CONTROL del paso 4. Esperado: tablas = 2, fecha = 20270301
-- ---------------------------------------------------------------------
select (select count(*) from information_schema.tables
         where table_name in ('cuestionario_reforzado','consulta_secretaria_economia')) as tablas,
       (select valor_numerico::bigint from parametro_regulatorio
         where codigo = 'FECHA_EXIGIBLE_CONSULTA_SE') as fecha;


-- #####################################################################
-- PASO 5 · El asiento en la bitácora, y las comprobaciones
-- #####################################################################
-- =====================================================================
-- Seed · Asientos metodológicos en la bitácora de cada organización
-- =====================================================================
-- Las migrations corren ANTES que los seeds. Un bloque de migration que
-- recorre `organizations` para dejar constancia de una decisión metodológica no
-- encuentra ninguna organización en un proyecto recién creado: en producción el
-- asiento queda, en una base nueva no, y la diferencia no se ve hasta que
-- alguien pide la bitácora.
--
-- Este seed va al final, cuando las organizaciones ya existen, y vuelve a pedir
-- los asientos que sí están expuestos como función. Es idempotente: cada
-- función comprueba si el asiento ya está antes de escribirlo.
--
-- TODO[Sprint D-2]: quedan once migrations con el asiento todavía dentro de un
-- bloque `do $$` suelto (0036, 0038, 0039, 0041, 0044, 0046, 0047, 0048, 0049,
-- 0056 y 0058). En producción esos asientos existen porque las organizaciones
-- ya estaban; en un proyecto nuevo faltan. Se cierran igual que este —
-- extrayendo el cuerpo a una función y llamándola desde aquí— junto con los
-- siete asientos del Manual de la instrucción 48 de la Adenda 4.
-- =====================================================================

do $$
declare
  v_org uuid;
  v_n   int := 0;
begin
  for v_org in select id from organizations loop
    if public.asentar_adenda_5(v_org) then
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice 'Asientos de la Adenda 5 escritos: %', v_n;
end $$;


-- ---------------------------------------------------------------------
-- CONTROL del paso 5
-- ---------------------------------------------------------------------
-- Cada organización tiene que tener su asiento de la Adenda 5. Esperado: la
-- columna `asiento` en 1 para TODAS las filas.
select o.razon_social,
       (select count(*) from evento_auditoria e
         where e.organization_id = o.id
           and e.tipo = 'expediente_reforzado_incorporado') as asiento
  from organizations o
 order by o.razon_social;

-- Y la cadena de auditoría sigue íntegra en todas. Esperado: 0 filas.
select o.razon_social, v.secuencia, v.motivo
  from organizations o, public.verificar_cadena(o.id) v
 order by o.razon_social, v.secuencia;


-- #####################################################################
-- PASO 6 · El OC designado, la vigencia de la aprobación y el acto
-- #####################################################################
-- =====================================================================
-- 0062 · El OC designado, la vigencia de la aprobación, y el acto
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 5 del 01/09/2026,
-- apartado 1, sobre el art. 23 Ter 5 de las RCG.
--
-- La 0059 dejó registrada la aprobación del expediente reforzado, pero con dos
-- huecos que sólo se ven cuando se piensa en el día siguiente:
--
--   1. La autoaprobación se calculaba con `has_rol('oc')`, es decir contra el
--      CONJUNTO de quienes hoy tengan ese rol. Si mañana se le da el rol a una
--      segunda persona, el cálculo cambia solo y sin que nadie lo decida. El
--      Oficial de Cumplimiento es una figura DESIGNADA ante la Secretaría, no
--      una inferencia de los permisos vigentes, y se registra como tal.
--
--   2. Nada ataba la aprobación al acto. El art. 23 Ter 5 exige que la
--      aprobación sea ANTES de operar, y una aprobación que no impide operar
--      sin ella es una constancia, no un control: se cumple cuando alguien se
--      acuerda. Aquí el acto de un expediente de riesgo alto no entra sin una
--      aprobación vigente.
--
-- ---------------------------------------------------------------------
-- Qué NO se inventa aquí
-- ---------------------------------------------------------------------
-- La vigencia de la aprobación NO se fija en un plazo de calendario. Se ata a
-- la evaluación sobre la que se dio: mientras esa siga siendo la vigente, la
-- aprobación cubre; en cuanto hay una evaluación posterior, deja de cubrir y
-- hay que volver a aprobar. Eso se deriva de los datos y no exige elegir un
-- número.
--
-- TODO[Sprint D-2]: si Cumplimiento quiere ADEMÁS un tope de calendario
-- —semestral, anual— es un parámetro regulatorio con su fundamento, no una
-- constante en este archivo. Preguntar antes de ponerlo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. El Oficial de Cumplimiento es designado, no inferido
-- ---------------------------------------------------------------------
alter table organizations
  add column if not exists oc_encargado_user_id uuid references auth.users(id) on delete set null,
  add column if not exists oc_designado_en timestamptz,
  add column if not exists oc_es_titular boolean not null default false;

comment on column organizations.oc_encargado_user_id is
  'Usuario designado como Oficial de Cumplimiento ante la Secretaría. La '
  'autoaprobación se calcula contra ESTE usuario y no contra el conjunto de '
  'quienes hoy tengan rol oc: si mañana se le da el rol a una segunda persona, '
  'el cálculo no debe cambiar solo.';
comment on column organizations.oc_designado_en is
  'Cuándo se registró la designación. La revisión anual puede caer cuando el OC '
  'vigente ya no es el que aprobó, y sin fecha no se sabe quién era entonces.';
comment on column organizations.oc_es_titular is
  'El Oficial de Cumplimiento es además el notario titular o el directivo '
  'único. En una organización de una sola persona la autoaprobación es la '
  'situación normal, no una anomalía: lo que cambia es el compensatorio.';

-- Designar es un acto, y queda asentado.
create or replace function public.designar_oficial_cumplimiento(
  p_org uuid,
  p_user uuid,
  p_es_titular boolean default false
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_anterior uuid;
begin
  if not (public.has_rol('admin') or public.es_admin_kawiil()) then
    raise exception 'Sólo un administrador puede designar al Oficial de Cumplimiento.';
  end if;
  if p_org <> public.current_org_id() and not public.es_admin_kawiil() then
    raise exception 'Esa organización no es la tuya.';
  end if;
  if not exists (select 1 from user_roles where user_id = p_user
                   and organization_id = p_org and rol = 'oc') then
    raise exception
      'El usuario designado tiene que tener el rol de Oficial de Cumplimiento en la '
      'organización. La designación no otorga el permiso: lo hace constar.';
  end if;

  select oc_encargado_user_id into v_anterior from organizations where id = p_org;

  update organizations
     set oc_encargado_user_id = p_user,
         oc_designado_en = now(),
         oc_es_titular = coalesce(p_es_titular, false)
   where id = p_org;

  perform public.registrar_evento(
    p_org, 'oficial_cumplimiento_designado', 'organizations', p_org,
    jsonb_build_object(
      'anterior', v_anterior,
      'nuevo', p_user,
      'es_titular', coalesce(p_es_titular, false),
      'por_que', 'El OC es una figura designada ante la Secretaría, no una inferencia de los '
              || 'roles vigentes. La autoaprobación se calcula contra esta designación para que '
              || 'dar el rol a una segunda persona no cambie el cálculo sin que nadie lo decida.'
    ),
    'persona', auth.uid()
  );
end $$;

revoke all on function public.designar_oficial_cumplimiento(uuid, uuid, boolean) from public, anon;
grant execute on function public.designar_oficial_cumplimiento(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 2. La autoaprobación, contra la designación
-- ---------------------------------------------------------------------
-- Sigue siendo una O y no una Y: hay autoaprobación cuando aprueba el OC
-- designado, Y TAMBIÉN cuando aprueba quien capturó el expediente aunque no sea
-- el OC. Exigir que coincidan las tres cosas dejaría fuera al titular que
-- captura y firma, que es precisamente la estructura de una notaría pequeña.
--
-- Mientras no haya designación se cae a `has_rol('oc')`, que es el
-- comportamiento anterior: quedarse sin marcar sería la dirección peligrosa,
-- porque el hueco se traduciría en expedientes que la auditoría anual deja de
-- revisar al cien por ciento.
create or replace function public.hay_autoaprobacion(
  p_org uuid,
  p_aprobador uuid,
  p_client uuid
)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_oc uuid;
begin
  select oc_encargado_user_id into v_oc from organizations where id = p_org;

  if p_aprobador is not null
     and exists (select 1 from client c where c.id = p_client and c.capturado_por = p_aprobador)
  then
    return true;
  end if;

  if v_oc is not null then
    return p_aprobador is not null and p_aprobador = v_oc;
  end if;

  -- Sin designación, el comportamiento de la 0059.
  return public.has_rol('oc');
end $$;

comment on function public.hay_autoaprobacion(uuid, uuid, uuid) is
  'Si la aprobación la dio quien no puede ser un segundo par de ojos: el OC '
  'designado, o quien capturó el expediente. Nunca lo declara nadie.';

revoke all on function public.hay_autoaprobacion(uuid, uuid, uuid) from public, anon;
grant execute on function public.hay_autoaprobacion(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. La aprobación deja de cubrir cuando el expediente cambia
-- ---------------------------------------------------------------------
create or replace function public.expediente_reforzado_vigente(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from expediente_reforzado e
     where e.client_id = p_client
       and e.aprobado_en is not null
       -- Cubre mientras la evaluación sobre la que se aprobó siga siendo la
       -- vigente. Una evaluación posterior puede haber cambiado los hechos que
       -- justificaron la aprobación, y una firma no se estira sola.
       and e.evaluacion_secuencia is not distinct from (
             select max(a.secuencia) from client_risk_assessment a
              where a.client_id = p_client)
  );
$$;

comment on function public.expediente_reforzado_vigente(uuid) is
  'Si la aprobación del expediente reforzado sigue cubriendo. Deja de cubrir en '
  'cuanto hay una evaluación posterior a aquella sobre la que se firmó: una '
  'aprobación no se estira sola a hechos que nadie miró al aprobar.';

revoke all on function public.expediente_reforzado_vigente(uuid) from public, anon;
grant execute on function public.expediente_reforzado_vigente(uuid) to authenticated;

-- Y `aprobar_expediente_reforzado` pasa a usar la designación.
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
  v_oc     uuid;
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

  if v_nivel <> 'N3' then
    raise warning
      'El expediente % está en nivel % y el expediente reforzado es para N3. Se registra, pero '
      'revisa si es lo que querías.', p_client, v_nivel;
  end if;

  v_auto := public.hay_autoaprobacion(v_org, v_uid, p_client);
  select oc_encargado_user_id into v_oc from organizations where id = v_org;

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
      'oc_designado', v_oc,
      'fuente', 'Kawiil Mx · Adenda 5 del 01/09/2026, apartado 1. Art. 23 Ter 5 de las RCG.',
      'directivo', 'No se creó el rol «directivo»: la regla dice «o su equivalente» y en una '
                || 'notaría el equivalente es el notario titular. Inventar una jerarquía que no '
                || 'existe sería menos defendible que nombrar la que sí.',
      'designacion', case when v_oc is null
        then 'SIN OC DESIGNADO. La autoaprobación se calculó con el rol vigente, que cambia solo '
          || 'si mañana se le da el rol a otra persona. Falta designar al Oficial de '
          || 'Cumplimiento con designar_oficial_cumplimiento().'
        else 'Calculada contra el OC designado, no contra el conjunto de quienes tengan el rol.'
        end,
      'autoaprobacion_nota', case when v_auto
        then 'El aprobador coincide con el Oficial de Cumplimiento designado o con quien capturó '
          || 'el expediente. La aprobación fija responsabilidad y fecha, pero no es un segundo '
          || 'par de ojos. Compensatorio: revisión al 100 % en la auditoría del art. 18 fr. XI.'
        else 'Hay separación real entre quien capturó y quien aprobó.' end,
      'operador', 'El rol operador no puede aprobar, ni por delegación ni por ausencia del '
               || 'titular. Un permiso que se afloja «sólo por hoy» deja de ser un control.'
    ),
    'persona', v_uid
  );

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 4. El acto no entra sin la aprobación
-- ---------------------------------------------------------------------
-- Es lo que convierte la aprobación en un control. Una aprobación que no impide
-- operar sin ella es una constancia: se cumple cuando alguien se acuerda.
alter table operation
  add column if not exists aprobacion_expediente_id uuid
    references expediente_reforzado(id) on delete set null;

comment on column operation.aprobacion_expediente_id is
  'La aprobación del expediente reforzado en la que se apoya este acto. Nula en '
  'los actos de clientes que no son de riesgo alto, donde no hace falta.';

create or replace function public.trg_operacion_exige_aprobacion() returns trigger
language plpgsql set search_path = public as $$
declare
  v_nivel nivel_kyc;
  v_apro  uuid;
begin
  select nivel_kyc into v_nivel from client where id = new.client_id;
  if v_nivel is distinct from 'N3' then
    return new;
  end if;

  if not public.expediente_reforzado_vigente(new.client_id) then
    raise exception
      'Este compareciente está en riesgo alto (N3) y su expediente reforzado no tiene una '
      'aprobación vigente. El art. 23 Ter 5 de las RCG pide la aprobación de un directivo o su '
      'equivalente ANTES de operar, no después: el acto no se registra hasta que el notario '
      'titular, un directivo designado o el Oficial de Cumplimiento apruebe el expediente. Si ya '
      'estaba aprobado, es que hubo una evaluación posterior y hay que volver a aprobarlo sobre '
      'los hechos nuevos.'
      using errcode = 'check_violation';
  end if;

  -- Se deja anclado a CUÁL aprobación se apoyó, para que después se pueda
  -- reconstruir. Sin esto, una reaprobación posterior parecería haber cubierto
  -- un acto que en realidad se registró con otra.
  if new.aprobacion_expediente_id is null then
    select id into v_apro from expediente_reforzado where client_id = new.client_id;
    new.aprobacion_expediente_id := v_apro;
  end if;

  return new;
end $$;

drop trigger if exists operacion_exige_aprobacion on operation;
create trigger operacion_exige_aprobacion
  before insert on operation
  for each row execute function public.trg_operacion_exige_aprobacion();

comment on function public.trg_operacion_exige_aprobacion() is
  'El acto de un compareciente N3 no entra sin aprobación vigente del expediente '
  'reforzado (art. 23 Ter 5). Sólo al INSERTAR: los actos ya registrados no se '
  'invalidan hacia atrás, porque una regla nueva no vuelve ilícito lo que era '
  'válido cuando se hizo.';

-- ---------------------------------------------------------------------
-- 5. Qué expedientes están operando sin aprobación vigente
-- ---------------------------------------------------------------------
-- Los que ya existían cuando esto entró. El disparador no los toca, y sin esta
-- lista quedarían invisibles: un control que sólo mira hacia adelante deja un
-- hueco que nadie vuelve a ver.
create or replace function public.n3_sin_aprobacion_vigente(p_org uuid default null)
returns table (client_id uuid, nombre text, actos int, motivo text)
language sql stable security definer set search_path = public as $$
  select c.id,
         c.nombre_razon_social,
         (select count(*)::int from operation o where o.client_id = c.id),
         case
           when not exists (select 1 from expediente_reforzado e where e.client_id = c.id)
             then 'Nunca se aprobó el expediente reforzado.'
           when exists (select 1 from expediente_reforzado e
                         where e.client_id = c.id and e.aprobado_en is null)
             then 'El expediente está armado pero nadie lo ha aprobado.'
           else 'La aprobación es anterior a la última evaluación: hay que volver a aprobar '
             || 'sobre los hechos nuevos.'
         end
    from client c
   where c.nivel_kyc = 'N3'
     and c.organization_id = coalesce(p_org, public.current_org_id())
     and not public.expediente_reforzado_vigente(c.id)
   order by 3 desc, 2;
$$;

comment on function public.n3_sin_aprobacion_vigente(uuid) is
  'Comparecientes de riesgo alto sin aprobación vigente, con cuántos actos '
  'llevan. El disparador sólo mira hacia adelante; sin esta lista los que ya '
  'estaban quedarían invisibles.';

revoke all on function public.n3_sin_aprobacion_vigente(uuid) from public, anon;
grant execute on function public.n3_sin_aprobacion_vigente(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- CONTROL del paso 6. Esperado: columnas = 3, columna_acto = 1, fns = 4
-- ---------------------------------------------------------------------
select (select count(*) from information_schema.columns
         where table_name = 'organizations'
           and column_name in ('oc_encargado_user_id','oc_designado_en','oc_es_titular')) as columnas,
       (select count(*) from information_schema.columns
         where table_name = 'operation' and column_name = 'aprobacion_expediente_id') as columna_acto,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('designar_oficial_cumplimiento','hay_autoaprobacion',
                             'expediente_reforzado_vigente','n3_sin_aprobacion_vigente')) as fns;

-- Y quién está operando hoy en riesgo alto sin aprobación vigente. El
-- disparador sólo mira hacia adelante: esto es lo que ya estaba. Con
-- Leopoldo Bassoco Nova en N3, se espera verlo aquí hasta que se apruebe.
select o.razon_social, n.nombre, n.actos, n.motivo
  from organizations o, public.n3_sin_aprobacion_vigente(o.id) n
 order by o.razon_social, n.actos desc;
