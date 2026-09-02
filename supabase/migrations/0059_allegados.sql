-- =====================================================================
-- 0059 · Allegados: cónyuge, dependientes y sociedades vinculadas
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 5, 01/09/2026,
-- Instrucciones 54–56.
--
-- Diseño:
--   - El sujeto es el cliente. `cliente_allegado` es una tabla hija de `client`.
--   - Cuatro campos del beneficiario controlador, más naturaleza del vínculo
--     y, para persona moral, porcentaje de participación.
--   - Respuestas negativas se guardan con fecha: no basta un campo vacío.
--   - Documentación de allegados solo se exige cuando el cliente es PPE
--     extranjera (`condicion_pep = 'pep_extranjera'`).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catálogos cerrados
-- ---------------------------------------------------------------------
do $$
begin
  create type naturaleza_allegado as enum (
    'conyuge',
    'concubina_concubinario',
    'dependiente_economico',
    'sociedad_vinculo_patrimonial',
    'otro_justificado'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type estado_declaracion as enum (
    'si',
    'no',
    'no_declarado'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 2. Respuestas de cliente sobre allegados
-- ---------------------------------------------------------------------
-- Tres categorías, cada una con su respuesta y su fecha. El timestamp se
-- pone solo cuando cambia la respuesta, no al tocar otros campos del cliente.
alter table client
  add column if not exists allegados_conyuge_declaracion          estado_declaracion,
  add column if not exists allegados_conyuge_respondido_en        timestamptz,
  add column if not exists allegados_dependientes_declaracion     estado_declaracion,
  add column if not exists allegados_dependientes_respondido_en   timestamptz,
  add column if not exists allegados_vinculos_declaracion         estado_declaracion,
  add column if not exists allegados_vinculos_respondido_en       timestamptz;

comment on column client.allegados_conyuge_declaracion is
  '¿El cliente declara cónyuge? `no` es una respuesta válida; `no_declarado` '
  'indica que aún no se pregunta, y para clientes N3 está prohibido.';
comment on column client.allegados_vinculos_declaracion is
  '¿El cliente declara sociedades o asociaciones con vínculos patrimoniales? '
  'Misma lógica que cónyuge y dependientes.';

-- ---------------------------------------------------------------------
-- 3. Tabla de allegados
-- ---------------------------------------------------------------------
create table if not exists cliente_allegado (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references organizations(id) on delete cascade,
  client_id              uuid not null references client(id) on delete cascade,
  capturado_por          uuid references auth.users(id) on delete set null,
  capturado_en           timestamptz not null default now(),

  tipo_persona           tipo_persona not null,

  -- Persona física
  apellido_paterno       text,
  apellido_materno       text,
  nombre                 text,
  fecha_nacimiento       date,
  pais_nacionalidad_clave text,
  curp                   text,
  sin_curp               boolean not null default false,

  -- Persona moral
  nombre_razon_social    text,
  fecha_constitucion     date,
  pais_constitucion_clave text,
  porcentaje_participacion numeric,

  -- Comunes
  rfc                    text,
  sin_rfc                boolean not null default false,

  naturaleza_vinculo     naturaleza_allegado not null,
  justificacion          text,
  requiere_documentacion boolean not null default false
);

comment on table cliente_allegado is
  'Cónyuge, dependientes económicos y sociedades o asociaciones con vínculos '
  'patrimoniales del cliente. Mismo alcance que el beneficiario controlador; '
  'documentación solo cuando el cliente es PPE extranjera.';
comment on column cliente_allegado.requiere_documentacion is
  'Se calcula al insertar: verdadero si `client.condicion_pep = ''pep_extranjera''`.';

-- ---------------------------------------------------------------------
-- 4. Constraints de cliente sobre declaraciones
-- ---------------------------------------------------------------------
-- Para clientes N3, las tres declaraciones deben ser `si` o `no`, nunca `no_declarado`.
alter table client
  drop constraint if exists chk_cliente_allegados_conyuge_requerido,
  drop constraint if exists chk_cliente_allegados_dependientes_requerido,
  drop constraint if exists chk_cliente_allegados_vinculos_requerido;

alter table client
  add constraint chk_cliente_allegados_conyuge_requerido
    check (nivel_kyc <> 'N3' or allegados_conyuge_declaracion in ('si', 'no')),
  add constraint chk_cliente_allegados_dependientes_requerido
    check (nivel_kyc <> 'N3' or allegados_dependientes_declaracion in ('si', 'no')),
  add constraint chk_cliente_allegados_vinculos_requerido
    check (nivel_kyc <> 'N3' or allegados_vinculos_declaracion in ('si', 'no'));

-- ---------------------------------------------------------------------
-- 5. Timestamp de respuesta cuando cambia la declaración
-- ---------------------------------------------------------------------
create or replace function public.trg_cliente_allegados_respondido_en()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.allegados_conyuge_declaracion is not null and NEW.allegados_conyuge_respondido_en is null then
      NEW.allegados_conyuge_respondido_en := now();
    end if;
    if NEW.allegados_dependientes_declaracion is not null and NEW.allegados_dependientes_respondido_en is null then
      NEW.allegados_dependientes_respondido_en := now();
    end if;
    if NEW.allegados_vinculos_declaracion is not null and NEW.allegados_vinculos_respondido_en is null then
      NEW.allegados_vinculos_respondido_en := now();
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.allegados_conyuge_declaracion is distinct from OLD.allegados_conyuge_declaracion then
      NEW.allegados_conyuge_respondido_en := now();
    end if;
    if NEW.allegados_dependientes_declaracion is distinct from OLD.allegados_dependientes_declaracion then
      NEW.allegados_dependientes_respondido_en := now();
    end if;
    if NEW.allegados_vinculos_declaracion is distinct from OLD.allegados_vinculos_declaracion then
      NEW.allegados_vinculos_respondido_en := now();
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_cliente_allegados_respondido_en on client;
create trigger trg_cliente_allegados_respondido_en
  before insert or update on client
  for each row execute function public.trg_cliente_allegados_respondido_en();

-- ---------------------------------------------------------------------
-- 6. Constraints de la tabla de allegados
-- ---------------------------------------------------------------------
-- Persona física: datos de persona física, naturaleza no de moral.
alter table cliente_allegado
  drop constraint if exists chk_allegado_fisica,
  drop constraint if exists chk_allegado_moral,
  drop constraint if exists chk_allegado_otro_justificado,
  drop constraint if exists chk_allegado_porcentaje_solo_moral;

alter table cliente_allegado
  add constraint chk_allegado_fisica
    check (
      tipo_persona <> 'fisica'
      or (
        apellido_paterno is not null
        and nombre is not null
        and fecha_nacimiento is not null
        and pais_nacionalidad_clave is not null
        and naturaleza_vinculo in ('conyuge', 'concubina_concubinario', 'dependiente_economico', 'otro_justificado')
        and porcentaje_participacion is null
      )
    ),
  add constraint chk_allegado_moral
    check (
      tipo_persona <> 'moral'
      or (
        nombre_razon_social is not null
        and fecha_constitucion is not null
        and pais_constitucion_clave is not null
        and porcentaje_participacion is not null
        and naturaleza_vinculo in ('sociedad_vinculo_patrimonial', 'otro_justificado')
      )
    ),
  add constraint chk_allegado_otro_justificado
    check (naturaleza_vinculo <> 'otro_justificado' or justificacion is not null),
  add constraint chk_allegado_porcentaje_solo_moral
    check (porcentaje_participacion is null or tipo_persona = 'moral');

-- ---------------------------------------------------------------------
-- 7. Requiere documentación cuando el cliente es PPE extranjera
-- ---------------------------------------------------------------------
create or replace function public.trg_cliente_allegado_requiere_documentacion()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pep text;
begin
  select condicion_pep into v_pep
    from client
   where id = NEW.client_id;

  NEW.requiere_documentacion := (v_pep = 'pep_extranjera');
  return NEW;
end;
$$;

drop trigger if exists trg_cliente_allegado_requiere_documentacion on cliente_allegado;
create trigger trg_cliente_allegado_requiere_documentacion
  before insert on cliente_allegado
  for each row execute function public.trg_cliente_allegado_requiere_documentacion();

-- ---------------------------------------------------------------------
-- 8. Validar que la categoría esté declarada como `si`
-- ---------------------------------------------------------------------
-- Si el cliente dijo `no` en una categoría, no puede haber filas de esa
-- categoría. Si aún no se pregunta (`no_declarado`) y es N3, tampoco.
create or replace function public.trg_cliente_allegado_validar_declaracion()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_client client%rowtype;
begin
  select * into v_client from client where id = NEW.client_id;

  if NEW.naturaleza_vinculo in ('conyuge', 'concubina_concubinario') then
    if v_client.nivel_kyc = 'N3' and v_client.allegados_conyuge_declaracion is null then
      raise exception 'El cliente N3 debe tener declarado si tiene cónyuge o concubina';
    end if;
    if v_client.allegados_conyuge_declaracion = 'no' then
      raise exception 'El cliente declaró no tener cónyuge ni concubina';
    end if;
  end if;

  if NEW.naturaleza_vinculo = 'dependiente_economico' then
    if v_client.nivel_kyc = 'N3' and v_client.allegados_dependientes_declaracion is null then
      raise exception 'El cliente N3 debe tener declarado si tiene dependientes económicos';
    end if;
    if v_client.allegados_dependientes_declaracion = 'no' then
      raise exception 'El cliente declaró no tener dependientes económicos';
    end if;
  end if;

  if NEW.naturaleza_vinculo in ('sociedad_vinculo_patrimonial') then
    if v_client.nivel_kyc = 'N3' and v_client.allegados_vinculos_declaracion is null then
      raise exception 'El cliente N3 debe tener declarado si tiene vínculos patrimoniales';
    end if;
    if v_client.allegados_vinculos_declaracion = 'no' then
      raise exception 'El cliente declaró no tener vínculos patrimoniales con sociedades';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_cliente_allegado_validar_declaracion on cliente_allegado;
create trigger trg_cliente_allegado_validar_declaracion
  before insert on cliente_allegado
  for each row execute function public.trg_cliente_allegado_validar_declaracion();

-- ---------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------
alter table cliente_allegado enable row level security;

drop policy if exists "cliente_allegado_select_org" on cliente_allegado;
create policy "cliente_allegado_select_org"
  on cliente_allegado
  for select using (
    organization_id = public.current_org_id()
  );

drop policy if exists "cliente_allegado_insert_operador" on cliente_allegado;
create policy "cliente_allegado_insert_operador"
  on cliente_allegado
  for insert with check (
    organization_id = public.current_org_id()
    and (public.has_rol('operador') or public.has_rol('oc') or public.has_rol('admin'))
    and capturado_por = auth.uid()
  );

drop policy if exists "cliente_allegado_update_oc_admin" on cliente_allegado;
create policy "cliente_allegado_update_oc_admin"
  on cliente_allegado
  for update using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

drop policy if exists "cliente_allegado_delete_oc_admin" on cliente_allegado;
create policy "cliente_allegado_delete_oc_admin"
  on cliente_allegado
  for delete using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

revoke all on cliente_allegado from anon;
grant select, insert, update, delete on cliente_allegado to authenticated;

-- `client` ya tiene RLS; los campos nuevos están cubiertos por las políticas
-- existentes de `client`.

-- ---------------------------------------------------------------------
-- 10. Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org
                  and tipo = 'allegados_modelo') then
      continue;
    end if;

    perform public.registrar_evento(
      v_org,
      'allegados_modelo',
      'client',
      null,
      jsonb_build_object(
        'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 5, Instrucciones 54–56, 01/09/2026.',
        'tabla', 'cliente_allegado',
        'reutiliza', 'Cuatro campos del beneficiario_controlador más naturaleza del vínculo.',
        'respuestas_negativas', 'Tres campos de estado_declaracion en client con respondido_en; '
                              || 'prohibido dejar no_declarado para clientes N3.',
        'documentos', 'Sólo cuando client.condicion_pep = ''pep_extranjera''.'
      ),
      'sistema',
      null
    );
  end loop;
end $$;
