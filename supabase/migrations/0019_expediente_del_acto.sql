-- =====================================================================
-- Ikán · Migration 0019 · El expediente del acto se arma al capturarlo
-- =====================================================================
-- Problema que resuelve:
--
--   El alta de un acto guardaba compareciente, monto, tipo de acto y país.
--   El aviso mensual de fe pública (layout `fep` del SPPLD) pide, para CUALQUIER
--   acto: número de instrumento público, fecha del acto, y la persona que
--   solicita la formalización con nombre y APELLIDOS POR SEPARADO, fecha de
--   nacimiento, RFC y CURP. Nada de eso se guardaba. El día 17, al armar el
--   aviso, el notario tendría que volver a su protocolo a buscar dato por dato.
--
--   Esta migration NO inventa campos: cada columna corresponde a un campo del
--   instructivo del layout (docs/layouts-sat/instructivo_fep_campos.csv), y el
--   comentario de cada una cita su número.
--
-- Regla de diseño: capturar no bloquea. Los CHECK sólo validan el FORMATO
-- cuando el dato viene; ninguno obliga a llenarlo. Lo que falte se cobra en la
-- pantalla de pendientes del aviso, no rechazando el alta — si el sistema
-- estorba el día a día, el notario deja de capturar y no hay expediente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Sujeto obligado — claves del padrón SAT (rama 2 del layout)
-- ---------------------------------------------------------------------
-- No son derivables del RFC ni del sector: el SAT las asigna al darse de alta
-- en el padrón de actividades vulnerables. Sin ellas el XML no pasa validación.
alter table organizations
  add column if not exists clave_sujeto_obligado text,
  add column if not exists clave_entidad_colegiada text,
  add column if not exists clave_actividad text;

comment on column organizations.clave_sujeto_obligado is
  'Layout fep 2.2 <clave_sujeto_obligado>. Clave del padrón SAT de quien genera el aviso.';
comment on column organizations.clave_entidad_colegiada is
  'Layout fep 2.1 <clave_entidad_colegiada>. Sólo si los avisos se remiten por una entidad colegiada (Colegio de Notarios); null si se envían directo.';
comment on column organizations.clave_actividad is
  'Layout fep 2.3 <clave_actividad>. Clave de la actividad vulnerable (3 caracteres) que asigna el SAT. NO se deriva del sector.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_clave_so_formato') then
    alter table organizations add constraint organizations_clave_so_formato
      check (clave_sujeto_obligado is null or clave_sujeto_obligado ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizations_clave_ec_formato') then
    alter table organizations add constraint organizations_clave_ec_formato
      check (clave_entidad_colegiada is null or clave_entidad_colegiada ~ '^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizations_clave_actividad_formato') then
    alter table organizations add constraint organizations_clave_actividad_formato
      check (clave_actividad is null or clave_actividad ~ '^[A-Z0-9]{3}$');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Compareciente — <persona_aviso> (rama 3.5) y <persona_fisica>/<persona_moral>
-- ---------------------------------------------------------------------
-- `nombre_razon_social` se queda como el nombre de despliegue (lo usan listas,
-- búsquedas y el cruce contra listas restrictivas). Las partes se agregan al
-- lado porque el XML las pide separadas: partir el nombre compuesto después,
-- adivinando dónde termina el nombre y empieza el apellido, produce avisos con
-- datos falsos.
alter table client
  add column if not exists nombre text,
  add column if not exists apellido_paterno text,
  add column if not exists apellido_materno text,
  add column if not exists fecha_nacimiento date,
  add column if not exists fecha_constitucion date,
  add column if not exists pais_nacionalidad_clave text,
  add column if not exists actividad_economica_clave text;

comment on column client.nombre is
  'Layout fep 3.5.1 <nombre>. Sólo persona física. Separado a propósito de nombre_razon_social.';
comment on column client.apellido_paterno is 'Layout fep 3.5.2 <apellido_paterno>. Sólo persona física.';
comment on column client.apellido_materno is 'Layout fep 3.5.3 <apellido_materno>. Sólo persona física.';
comment on column client.fecha_nacimiento is 'Layout fep 3.5.4 <fecha_nacimiento>. Sólo persona física.';
comment on column client.fecha_constitucion is
  'Layout fep 3.6.1.3.*.<persona_moral>.<fecha_constitucion>. Sólo persona moral.';
comment on column client.pais_nacionalidad_clave is
  'Layout fep <pais_nacionalidad>, 2 caracteres del catálogo de países de la UIF. Distinto de `nacionalidad`, que guarda la etiqueta legible ("Mexicana").';
comment on column client.actividad_economica_clave is
  'Layout fep <actividad_economica> (persona física) / <giro_mercantil> (persona moral): 7 dígitos del catálogo de la UIF.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_pais_nacionalidad_formato') then
    alter table client add constraint client_pais_nacionalidad_formato
      check (pais_nacionalidad_clave is null or pais_nacionalidad_clave ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_actividad_economica_formato') then
    alter table client add constraint client_actividad_economica_formato
      check (actividad_economica_clave is null or actividad_economica_clave ~ '^[0-9]{7}$');
  end if;
end $$;

-- El nombre de despliegue se recompone desde las partes cuando las tres están
-- presentes, para que no haya dos verdades. Si el alta es antigua (sin partes),
-- `nombre_razon_social` se queda tal cual: no se adivina cómo partirlo.
create or replace function public.componer_nombre_cliente()
returns trigger language plpgsql as $$
begin
  if new.tipo_persona = 'fisica'
     and nullif(btrim(coalesce(new.nombre, '')), '') is not null
     and nullif(btrim(coalesce(new.apellido_paterno, '')), '') is not null then
    new.nombre_razon_social := btrim(
      btrim(new.nombre) || ' ' || btrim(new.apellido_paterno) ||
      coalesce(' ' || nullif(btrim(coalesce(new.apellido_materno, '')), ''), '')
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_client_componer_nombre on client;
create trigger trg_client_componer_nombre
  before insert or update of nombre, apellido_paterno, apellido_materno, tipo_persona on client
  for each row execute function public.componer_nombre_cliente();

-- ---------------------------------------------------------------------
-- 3. Acto — <datos_operacion> (rama 3.6.1)
-- ---------------------------------------------------------------------
-- `operation.fecha` ya es la fecha del acto (no la de captura: ésa es
-- `capturado_en`), así que NO se agrega otra columna de fecha: dos fechas del
-- acto es una de más. Lo que faltaba era el número de instrumento y el detalle
-- propio del tipo de acto.
alter table operation
  add column if not exists instrumento_publico text,
  add column if not exists datos_acto jsonb not null default '{}'::jsonb;

comment on column operation.instrumento_publico is
  'Layout fep 3.6.1.1 <instrumento_publico>. Número de escritura o póliza. No es único: una escritura puede contener varios actos.';
comment on column operation.datos_acto is
  'Subárbol de <tipo_actividad> del layout fep (3.6.1.3.1 a 3.6.1.3.10), según contraparte.tipo_acto. La forma la define src/lib/aviso/campos-fep.generated.ts; se guarda como jsonb porque cada tipo de acto pide campos distintos.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'operation_instrumento_longitud') then
    alter table operation add constraint operation_instrumento_longitud
      check (instrumento_publico is null or char_length(btrim(instrumento_publico)) between 1 and 20);
  end if;
end $$;

create index if not exists idx_operation_instrumento
  on operation(organization_id, instrumento_publico)
  where instrumento_publico is not null;
