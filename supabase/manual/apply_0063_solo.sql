-- =====================================================================
-- 0063 aplicada SUELTA · custodia de artefactos y conciliación
-- =====================================================================
-- Mismo contenido que `supabase/migrations/0063_custodia_artefactos.sql`.
-- Se ejecuta ENTERO, de una sola vez. No borra nada.
--
-- Necesita la 0058 a la 0062 aplicadas. Si falta alguna, se para con el
-- mensaje en vez de con un error de catálogo.
-- =====================================================================

do $guarda$
begin
  if to_regclass('public.verificacion_identidad') is null then
    raise exception 'Falta la migration 0032: no existe verificacion_identidad.';
  end if;
end $guarda$;

-- =====================================================================
-- 0063 · Custodia: Didit es fuente, Ikán es archivo
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 7 del 01/09/2026,
-- apartado 1. Instrucciones 89 a 94.
--
-- El art. 18 fr. IV de la Ley obliga a conservar el expediente en el domicilio
-- registrado. Hoy Didit es fuente Y archivo: guardamos el resumen y una
-- referencia, y las imágenes del documento —que son la copia que exige la
-- fracción I— viven sólo en el proveedor. Eso no es custodia, es una
-- dependencia: si mañana cambia el proveedor, cambia el contrato o cae el
-- servicio, el expediente deja de ser legible y el plazo de conservación corre
-- igual.
--
-- ---------------------------------------------------------------------
-- Qué se guarda, y qué se queda en el proveedor
-- ---------------------------------------------------------------------
-- Se guardan las imágenes del DOCUMENTO: son la copia de la fracción I y núcleo
-- del expediente.
--
-- NO se guardan la imagen de referencia de la prueba de vida ni el vídeo. Eso
-- es biometría, Kawiil decidió tratarla como dato sensible, y la Adenda 7 §1.1
-- es explícita en que de esos módulos se conserva el PUNTAJE como valor, no la
-- plantilla ni el vídeo. Copiarla multiplicaría dónde vive un dato sensible sin
-- que nadie lo haya pedido, y con conservación a diez años.
--
-- Tampoco se guarda el recorte del retrato del documento: la imagen del
-- documento ya lo contiene, y guardarlo aparte añade una fotografía de rostro
-- sin ningún valor legal adicional.
--
-- ---------------------------------------------------------------------
-- Huella, no confianza
-- ---------------------------------------------------------------------
-- A diez años, lo que hay que poder demostrar no es sólo que se tiene el
-- archivo: es que es EL archivo. Por eso cada artefacto guarda su SHA-256 al
-- lado, calculado al descargarlo.
--
-- ---------------------------------------------------------------------
-- El orden importa, y está escrito aquí para que no se pierda
-- ---------------------------------------------------------------------
-- La Adenda 7 §1.3 instruye una secuencia y advierte del peligro de invertirla:
-- mientras la extracción no esté garantizada y conciliada, la copia del
-- proveedor es la red de seguridad. Reducir la retención en Didit antes de
-- tener conciliación probada vuelve irrecuperable un aviso perdido.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Los artefactos
-- ---------------------------------------------------------------------
do $$ begin
  create type tipo_artefacto as enum (
    'documento_frente',
    'documento_reverso',
    'documento_frente_completo',
    'documento_reverso_completo'
  );
exception when duplicate_object then null; end $$;

comment on type tipo_artefacto is
  'Sólo imágenes del DOCUMENTO. La referencia de prueba de vida y el vídeo no '
  'entran: son biometría, se tratan como dato sensible, y de esos módulos se '
  'conserva el puntaje como valor. El recorte del retrato tampoco: la imagen '
  'del documento ya lo contiene y guardarlo aparte añade una fotografía de '
  'rostro sin valor legal adicional.';

create table if not exists artefacto_verificacion (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete cascade,
  verificacion_id uuid not null references verificacion_identidad(id) on delete cascade,

  tipo tipo_artefacto not null,

  /** Nuestro. El archivo vive aquí, no en el proveedor. */
  storage_path text not null unique,
  nombre_archivo text not null,
  mime_type text,
  tamano_bytes bigint check (tamano_bytes is null or tamano_bytes > 0),

  /**
   * SHA-256 en hexadecimal, calculado al descargar.
   *
   * A diez años hay que poder demostrar que es EL archivo, no sólo que se tiene
   * un archivo.
   */
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),

  /**
   * De dónde se descargó. Dato ADICIONAL, nunca el dato.
   *
   * Las ligas del proveedor vienen firmadas y vencen en horas; guardarlas como
   * el dato principal sería guardar un puntero que caduca. Se conserva para
   * poder rastrear la procedencia, no para volver a leerla.
   */
  url_origen text,
  descargado_en timestamptz not null default now(),

  unique (verificacion_id, tipo)
);

comment on table artefacto_verificacion is
  'Los archivos del expediente de identidad, custodiados por Ikán. Artefactos, '
  'no punteros: un expediente hecho de referencias al proveedor deja de ser '
  'legible si cambia el contrato, y el plazo de conservación del art. 18 fr. IV '
  'corre igual.';

create index if not exists idx_artefacto_verificacion on artefacto_verificacion(verificacion_id);
create index if not exists idx_artefacto_cliente on artefacto_verificacion(client_id);

alter table artefacto_verificacion enable row level security;
drop policy if exists "artefacto_org" on artefacto_verificacion;
create policy "artefacto_org" on artefacto_verificacion for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());
revoke all on artefacto_verificacion from anon;

-- Bucket privado. Son documentos de identidad.
insert into storage.buckets (id, name, public, file_size_limit)
values ('expedientes-identidad', 'expedientes-identidad', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "identidad_docs_select" on storage.objects;
create policy "identidad_docs_select" on storage.objects for select
  using (bucket_id = 'expedientes-identidad'
         and (storage.foldername(name))[1] = public.current_org_id()::text);

-- ---------------------------------------------------------------------
-- 2. La versión del workflow aplicada
-- ---------------------------------------------------------------------
-- Sin ella no se puede reconstruir QUÉ se le practicó a esa persona: el mismo
-- workflow con AML apagado y con AML encendido produce expedientes distintos, y
-- ya pasó —la primera verificación de producción corrió sin barrido de listas
-- porque el módulo se encendió después—.
alter table verificacion_identidad
  add column if not exists workflow_version int,
  add column if not exists features_aplicadas text[];

comment on column verificacion_identidad.features_aplicadas is
  'Qué módulos corrieron REALMENTE en esta sesión, según la decisión del '
  'proveedor. No los que el workflow tiene hoy: un módulo encendido después no '
  'se le practicó a quien se verificó antes.';

-- ---------------------------------------------------------------------
-- 3. Qué le falta a la custodia de un expediente
-- ---------------------------------------------------------------------
create or replace function public.artefactos_faltantes(p_verificacion uuid)
returns table (tipo text, motivo text)
language sql stable security definer set search_path = public as $custodia$
  select t.tipo,
         'No se ha descargado del proveedor. Mientras no esté, el expediente '
         || 'depende de que Didit siga disponible.'
    from (values ('documento_frente'), ('documento_reverso')) as t(tipo)
   where exists (select 1 from verificacion_identidad v
                  where v.id = p_verificacion and v.estado = 'aprobada')
     and not exists (
       select 1 from artefacto_verificacion a
        where a.verificacion_id = p_verificacion and a.tipo::text = t.tipo);
$custodia$;

comment on function public.artefactos_faltantes(uuid) is
  'Los artefactos que una verificación aprobada debería tener custodiados y no '
  'tiene. Sólo se exigen las dos caras del documento: son la copia del art. 18 '
  'fr. I.';

revoke all on function public.artefactos_faltantes(uuid) from public, anon;
grant execute on function public.artefactos_faltantes(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Conciliación: extracción garantizada, no oportunista
-- ---------------------------------------------------------------------
-- Instrucción 89. Un webhook puede perderse, llegar dos veces o llegar fuera de
-- orden. Si la extracción depende sólo de que el aviso llegue, un aviso perdido
-- produce un expediente que SE VE COMPLETO y no tiene nada detrás. Es la misma
-- familia de fallas que esta serie lleva siete documentos persiguiendo: el
-- control que no corrió se ve igual que el que corrió sin hallazgos.
create table if not exists conciliacion_verificacion (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,

  /** El identificador de sesión del proveedor. Es la llave de la idempotencia. */
  didit_session_id text not null,
  verificacion_id uuid references verificacion_identidad(id) on delete set null,

  /** Qué se encontró al comparar proveedor contra Ikán. */
  hallazgo text not null check (hallazgo in (
    'sin_registro',        -- la sesión existe en Didit y no en Ikán
    'sin_artefactos',      -- hay registro pero no se descargaron los archivos
    'estado_divergente',   -- el proveedor dice una cosa y nosotros otra
    'resumen_incompleto'   -- corrió un módulo cuyo resultado no guardamos
  )),
  detalle text,

  detectada_en timestamptz not null default now(),
  resuelta_en timestamptz,
  resuelta_por uuid references auth.users(id),
  nota_resolucion text
);

-- Una sola alerta ABIERTA por sesión y tipo de hallazgo. Índice PARCIAL y no
-- restricción de tabla: la conciliación corre periódicamente y no debe acumular
-- la misma alerta, pero una que se resolvió y volvió a aparecer es una alerta
-- NUEVA y tiene que poder entrar. Incluir `detectada_en` en la llave no servía:
-- `now()` es constante dentro de una transacción, así que resolver y volver a
-- detectar en la misma chocaba consigo mismo.
create unique index if not exists idx_conciliacion_una_abierta
  on conciliacion_verificacion (didit_session_id, hallazgo)
  where resuelta_en is null;

comment on table conciliacion_verificacion is
  'Diferencias entre lo que el proveedor tiene y lo que Ikán custodia. La '
  'conciliación no es redundancia: es la única forma de saber que no falta '
  'nada, porque un webhook perdido deja un expediente que se ve completo.';

create index if not exists idx_conciliacion_abierta
  on conciliacion_verificacion(organization_id) where resuelta_en is null;

alter table conciliacion_verificacion enable row level security;
drop policy if exists "conciliacion_org" on conciliacion_verificacion;
create policy "conciliacion_org" on conciliacion_verificacion for all
  using (organization_id is null or organization_id = public.current_org_id())
  with check (organization_id is null or organization_id = public.current_org_id());
revoke all on conciliacion_verificacion from anon;

-- Registrar un hallazgo es idempotente por sesión y tipo mientras siga abierto:
-- la conciliación corre periódicamente y no debe acumular la misma alerta.
create or replace function public.registrar_hallazgo_conciliacion(
  p_session text,
  p_hallazgo text,
  p_org uuid default null,
  p_verificacion uuid default null,
  p_detalle text default null
)
returns uuid
language plpgsql security definer set search_path = public as $conc$
declare
  v_id uuid;
begin
  select id into v_id from conciliacion_verificacion
   where didit_session_id = p_session and hallazgo = p_hallazgo and resuelta_en is null
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into conciliacion_verificacion
    (organization_id, didit_session_id, verificacion_id, hallazgo, detalle)
  values (p_org, p_session, p_verificacion, p_hallazgo, p_detalle)
  returning id into v_id;

  if p_org is not null then
    perform public.registrar_evento(
      p_org, 'conciliacion_hallazgo', 'verificacion_identidad', p_verificacion,
      jsonb_build_object(
        'sesion', p_session,
        'hallazgo', p_hallazgo,
        'detalle', p_detalle,
        'por_que', 'Un webhook puede perderse y dejar un expediente que se ve completo sin '
                || 'tener nada detrás. La conciliación es la única forma de saber que no falta '
                || 'nada.'
      ),
      'sistema', null
    );
  end if;

  return v_id;
end $conc$;

revoke all on function public.registrar_hallazgo_conciliacion(text, text, uuid, uuid, text)
  from public, anon;

-- ---------------------------------------------------------------------
-- 5. La secuencia que NO se puede invertir
-- ---------------------------------------------------------------------
-- Instrucción 94, como parámetro y no como nota en un documento: mientras esto
-- sea false, nadie debe reducir la retención en Didit.
-- `parametro_regulatorio` no admitía booleanos y este lo es. Se extiende el
-- catálogo de unidades en vez de disfrazarlo de porcentaje o de día: un valor
-- guardado bajo una unidad que no le corresponde es un dato que miente sobre sí
-- mismo, y aquí lo que importa es que pase por el mismo régimen de versión y
-- firma que la UMA y las bandas de la escala.
--
-- Y se hace con guarda. Rehacer un CHECK a partir de una lista escrita a mano
-- borra en silencio lo que otras migrations hayan añadido: la 0044 ya había
-- sumado la unidad `operacion`, y la primera versión de este bloque la habría
-- tirado. Lo cazó la prueba de comportamiento sobre una base limpia.
do $unidades$
declare
  v_admitidas text[] := array['mxn','uma','dia','anio','porcentaje','operacion','booleano'];
  v_huerfanas text;
begin
  select string_agg(distinct unidad, ', ') into v_huerfanas
    from parametro_regulatorio where not (unidad = any(v_admitidas));
  if v_huerfanas is not null then
    raise exception
      'Hay parámetros con unidades que esta migration no contempla: %. Añádelas a la lista '
      'antes de rehacer la restricción, o se perderían sin que nadie se entere.', v_huerfanas;
  end if;

  alter table parametro_regulatorio drop constraint if exists parametro_regulatorio_unidad_check;
  alter table parametro_regulatorio
    add constraint parametro_regulatorio_unidad_check
    check (unidad in ('mxn','uma','dia','anio','porcentaje','operacion','booleano'));
end $unidades$;

insert into parametro_regulatorio
  (codigo, nombre, valor_numerico, unidad, sector, vigente_desde, fuente, notas)
select 'CONCILIACION_PROBADA', 'La conciliación de sesiones está probada en producción',
       0, 'booleano', '*', current_date,
       'Kawiil Mx · Adenda 7 del 01/09/2026, apartado 1.3 e instrucción 94.',
       'Cero = todavía NO. Mientras valga cero, la copia del proveedor es la red de '
       || 'seguridad y NO debe reducirse la retención en Didit: un aviso perdido se volvería '
       || 'irrecuperable y el expediente quedaría incompleto sin que nadie se entere hasta '
       || 'que alguien lo pida. Lo pone en uno Cumplimiento, cuando la conciliación haya '
       || 'corrido y se haya documentado.'
 where not exists (select 1 from parametro_regulatorio where codigo = 'CONCILIACION_PROBADA');

-- ---------------------------------------------------------------------
-- 6. Exportar el expediente sin el proveedor
-- ---------------------------------------------------------------------
-- Instrucción 93, y también la 118 de la Adenda 8: la obligación de conservar
-- sobrevive a la baja del cliente. El art. 8 del Reglamento concede diez días
-- hábiles para atender un requerimiento; en la práctica debe resolverse en
-- minutos, y no se sabe si se puede hasta que se prueba.
create or replace function public.expediente_exportable(p_client uuid)
returns table (seccion text, listo boolean, detalle text)
language sql stable security definer set search_path = public as $exp$
  select 'Identificación del compareciente'::text,
         c.nombre_razon_social is not null,
         coalesce(c.nombre_razon_social, '(sin nombre)')
    from client c where c.id = p_client
  union all
  select 'Copia del documento de identidad (art. 18 fr. I)',
         exists (select 1 from artefacto_verificacion a
                  where a.client_id = p_client and a.tipo = 'documento_frente'),
         case when exists (select 1 from artefacto_verificacion a
                            where a.client_id = p_client and a.tipo = 'documento_frente')
              then 'Custodiada por Ikán, con huella.'
              else 'SÓLO EN EL PROVEEDOR. El expediente no se puede leer sin acceso a Didit.'
         end
  union all
  select 'Resultado de la verificación',
         exists (select 1 from verificacion_identidad v
                  where v.client_id = p_client and v.estado = 'aprobada'),
         'Decisión, fecha y módulos aplicados.'
  union all
  select 'Evaluación de riesgo',
         exists (select 1 from client_risk_assessment a where a.client_id = p_client),
         'Con la versión de matriz que la produjo.'
  union all
  select 'Bitácora encadenada',
         exists (select 1 from evento_auditoria e
                  join client c2 on c2.id = p_client
                 where e.organization_id = c2.organization_id),
         'Los eventos que permiten reconstruir qué se hizo y cuándo.';
$exp$;

comment on function public.expediente_exportable(uuid) is
  'Si el expediente de un compareciente se puede leer completo SIN acceso al '
  'proveedor. Guardar una liga a Didit no es custodia: es una dependencia.';

revoke all on function public.expediente_exportable(uuid) from public, anon;
grant execute on function public.expediente_exportable(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- CONTROL. Esperado: tablas = 2, bucket = 1, fns = 3, permiso = 0
-- ---------------------------------------------------------------------
select (select count(*) from information_schema.tables
         where table_name in ('artefacto_verificacion','conciliacion_verificacion')) as tablas,
       (select count(*) from storage.buckets where id = 'expedientes-identidad') as bucket,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('artefactos_faltantes','registrar_hallazgo_conciliacion',
                             'expediente_exportable')) as fns,
       (select valor_numerico::int from parametro_regulatorio
         where codigo = 'CONCILIACION_PROBADA') as permiso_reducir_retencion;

-- Y qué expedientes NO se podrían leer hoy sin acceso a Didit. Mientras la
-- columna diga false, la copia del documento vive sólo en el proveedor.
select c.nombre_razon_social, e.seccion, e.listo
  from client c, public.expediente_exportable(c.id) e
 where e.seccion = 'Copia del documento de identidad (art. 18 fr. I)'
 order by e.listo, c.nombre_razon_social;
