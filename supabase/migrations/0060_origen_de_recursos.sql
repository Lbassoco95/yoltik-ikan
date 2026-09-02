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
