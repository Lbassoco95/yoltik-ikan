-- =====================================================================
-- Ikán · Migration 0010 · Matriz de riesgo configurable (fase 1)
-- =====================================================================
-- Decisión de arquitectura (cerrada con el usuario): se EXTIENDE
-- `client_risk_template`, no se migra a tablas normalizadas.
--
-- Razón: una versión de matriz es un documento inmutable y auditable — un
-- examinador de CNBV pregunta "qué metodología estaba vigente en la fecha X".
-- `unique (organization_id, sector, version)` + `activa` ya lo modela. Con
-- tablas normalizadas, editar un renglón mutaría la historia salvo versionando
-- las cuatro tablas en paralelo.
--
-- Los resultados por cliente SIGUEN normalizados en `client_risk_assessment`
-- (migration 0004): eso es dato transaccional, no documento. Un almacén de
-- definición (jsonb versionado) + uno de resultados (tabla). Sin sistemas
-- paralelos.
--
-- PENDIENTE deliberado (nota RCG-0, `src/lib/riesgo/matriz.ts`): el cálculo de
-- `score_total`/`clasificacion` NO se define aquí. La fórmula de ponderación
-- vive en el Excel de Ixim Pay y está en revisión con Kawiil-Cumplimiento.
-- Esta migration valida la ESTRUCTURA del documento, nunca la aritmética.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estado del documento
-- ---------------------------------------------------------------------
do $$ begin
  create type estado_plantilla as enum ('borrador', 'publicada');
exception when duplicate_object then null; end $$;

alter table client_risk_template
  add column if not exists estado estado_plantilla not null default 'publicada',
  add column if not exists creada_por uuid references auth.users(id),
  add column if not exists publicada_por uuid references auth.users(id),
  add column if not exists publicada_en timestamptz,
  add column if not exists notas_version text;

comment on column client_risk_template.estado is
  'borrador = el OC la está armando, nunca activa. publicada = inmutable.';
comment on column client_risk_template.notas_version is
  'Qué cambió respecto de la versión anterior. Lo pide el examinador al comparar versiones.';

-- Lo que ya existía se dio por publicado (estaba en uso).
update client_risk_template
   set publicada_en = coalesce(publicada_en, creada_en)
 where estado = 'publicada' and publicada_en is null;

-- Un borrador nunca puede estar activo.
alter table client_risk_template drop constraint if exists chk_borrador_no_activa;
alter table client_risk_template add constraint chk_borrador_no_activa
  check (not (estado = 'borrador' and activa));

-- Una sola versión activa por organización y sector.
create unique index if not exists idx_template_activa_unica
  on client_risk_template(organization_id, sector) where activa;

-- ---------------------------------------------------------------------
-- 2. Contrato del jsonb `configuracion`
-- ---------------------------------------------------------------------
-- Formaliza la forma que YA tiene el seed de Ixim Pay. No inventa campos:
-- obligatorio = lo que aparece en las 25 variables del seed; opcional =
-- lo que aparece solo en algunas (`aplica_si` en 2 de 6 elementos;
-- `criterio` y `peso` en 1 de 25 variables).
--
-- Deliberadamente NO valida: el rango de `valor` en las opciones (el seed usa
-- 1..3, pero otro sector podría usar otra escala) ni relación alguna entre los
-- valores y `escala_cliente` — eso depende de la fórmula pendiente.
create or replace function public.validar_configuracion_matriz(p_cfg jsonb)
returns void
language plpgsql immutable set search_path = public as $$
declare
  v_el jsonb; v_var jsonb; v_op jsonb; v_banda text; v_b jsonb;
  v_codigos_el text[] := '{}';
  v_codigos_var text[] := '{}';
  v_bandas jsonb[] := '{}';
  i int; j int;
begin
  -- OJO: siempre `coalesce(jsonb_typeof(x), '')`. Sin el coalesce, una clave
  -- AUSENTE da jsonb_typeof(null) = null, y `null <> 'array'` es null (no true),
  -- así que el chequeo no dispara y el documento inválido se cuela.
  if p_cfg is null or coalesce(jsonb_typeof(p_cfg), '') <> 'object' then
    raise exception 'configuracion debe ser un objeto JSON';
  end if;

  -- ---- elementos ----
  if coalesce(jsonb_typeof(p_cfg->'elementos'), '') <> 'array' or jsonb_array_length(p_cfg->'elementos') = 0 then
    raise exception 'configuracion.elementos debe ser un arreglo con al menos un elemento';
  end if;

  for v_el in select * from jsonb_array_elements(p_cfg->'elementos') loop
    if coalesce(v_el->>'codigo', '') = '' or coalesce(v_el->>'nombre', '') = '' then
      raise exception 'Cada elemento necesita codigo y nombre no vacíos (encontrado: %)', v_el;
    end if;
    if v_el->>'codigo' = any(v_codigos_el) then
      raise exception 'Código de elemento duplicado: %', v_el->>'codigo';
    end if;
    v_codigos_el := v_codigos_el || (v_el->>'codigo');

    if coalesce(jsonb_typeof(v_el->'variables'), '') <> 'array' or jsonb_array_length(v_el->'variables') = 0 then
      raise exception 'El elemento % necesita al menos una variable', v_el->>'codigo';
    end if;

    for v_var in select * from jsonb_array_elements(v_el->'variables') loop
      if coalesce(v_var->>'codigo', '') = '' or coalesce(v_var->>'pregunta', '') = '' then
        raise exception 'Cada variable necesita codigo y pregunta no vacíos (elemento %)', v_el->>'codigo';
      end if;
      -- Único en TODA la plantilla: `client_risk_assessment.respuestas` indexa
      -- por este código, así que un duplicado haría ambigua la respuesta.
      if v_var->>'codigo' = any(v_codigos_var) then
        raise exception 'Código de variable duplicado en la plantilla: %', v_var->>'codigo';
      end if;
      v_codigos_var := v_codigos_var || (v_var->>'codigo');

      if v_var ? 'peso' and coalesce(jsonb_typeof(v_var->'peso'), '') <> 'number' then
        raise exception 'variable %: peso debe ser numérico', v_var->>'codigo';
      end if;

      if coalesce(jsonb_typeof(v_var->'opciones'), '') <> 'array' or jsonb_array_length(v_var->'opciones') = 0 then
        raise exception 'La variable % necesita al menos una opción', v_var->>'codigo';
      end if;
      for v_op in select * from jsonb_array_elements(v_var->'opciones') loop
        if coalesce(jsonb_typeof(v_op->'valor'), '') <> 'number' then
          raise exception 'variable %: cada opción necesita "valor" numérico', v_var->>'codigo';
        end if;
        if coalesce(v_op->>'label', '') = '' then
          raise exception 'variable %: cada opción necesita "label" no vacío', v_var->>'codigo';
        end if;
      end loop;
    end loop;
  end loop;

  -- ---- escala_cliente ----
  if coalesce(jsonb_typeof(p_cfg->'escala_cliente'), '') <> 'object' then
    raise exception 'configuracion.escala_cliente debe ser un objeto con bandas bajo/medio/alto';
  end if;
  foreach v_banda in array array['bajo','medio','alto'] loop
    v_b := p_cfg->'escala_cliente'->v_banda;
    if coalesce(jsonb_typeof(v_b), '') <> 'object' then
      raise exception 'escala_cliente.% falta o no es objeto', v_banda;
    end if;
    if coalesce(jsonb_typeof(v_b->'min'), '') <> 'number' or coalesce(jsonb_typeof(v_b->'max'), '') <> 'number' then
      raise exception 'escala_cliente.% necesita min y max numéricos', v_banda;
    end if;
    if (v_b->>'min')::numeric > (v_b->>'max')::numeric then
      raise exception 'escala_cliente.%: min (%) no puede ser mayor que max (%)',
        v_banda, v_b->>'min', v_b->>'max';
    end if;
    if coalesce(v_b->>'acciones', '') = '' then
      raise exception 'escala_cliente.% necesita "acciones" no vacío', v_banda;
    end if;
    v_bandas := v_bandas || v_b;
  end loop;

  -- Bandas que se traslapan harían ambigua la clasificación. No se exige que
  -- sean contiguas: un hueco es decisión de la metodología, no un error.
  for i in 1..3 loop
    for j in (i + 1)..3 loop
      if (v_bandas[i]->>'min')::numeric <= (v_bandas[j]->>'max')::numeric
         and (v_bandas[j]->>'min')::numeric <= (v_bandas[i]->>'max')::numeric then
        raise exception 'Las bandas de escala_cliente se traslapan: % y %',
          v_bandas[i], v_bandas[j];
      end if;
    end loop;
  end loop;

  -- ---- triggers_alto_de_oficio (opcional) ----
  if p_cfg ? 'triggers_alto_de_oficio' then
    if coalesce(jsonb_typeof(p_cfg->'triggers_alto_de_oficio'), '') <> 'array' then
      raise exception 'triggers_alto_de_oficio debe ser un arreglo';
    end if;
    for v_el in select * from jsonb_array_elements(p_cfg->'triggers_alto_de_oficio') loop
      if coalesce(v_el->>'codigo','') = '' or coalesce(v_el->>'descripcion','') = '' then
        raise exception 'Cada trigger de alto de oficio necesita codigo y descripcion';
      end if;
    end loop;
  end if;
end $$;

create or replace function public.configuracion_matriz_valida(p_cfg jsonb)
returns boolean
language plpgsql immutable set search_path = public as $$
begin
  perform public.validar_configuracion_matriz(p_cfg);
  return true;
exception when others then
  return false;
end $$;

alter table client_risk_template drop constraint if exists chk_configuracion_valida;
alter table client_risk_template add constraint chk_configuracion_valida
  check (public.configuracion_matriz_valida(configuracion));

-- ---------------------------------------------------------------------
-- 3. Inmutabilidad de lo publicado
-- ---------------------------------------------------------------------
create or replace function public.trg_plantilla_inmutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.estado = 'publicada' then
    if new.configuracion is distinct from old.configuracion
       or new.version is distinct from old.version
       or new.sector is distinct from old.sector
       or new.estado is distinct from old.estado then
      raise exception 'Una versión publicada de la matriz es inmutable: crea una versión nueva'
        using hint = 'Usa crear_borrador_matriz() y publícalo con publicar_matriz()';
    end if;
  end if;
  return new;  -- `activa` sí puede cambiar: es lo que mueve la vigencia
end $$;

drop trigger if exists trg_client_risk_template_inmutable on client_risk_template;
create trigger trg_client_risk_template_inmutable
  before update on client_risk_template
  for each row execute function public.trg_plantilla_inmutable();

-- ---------------------------------------------------------------------
-- 4. Borrador → publicación
-- ---------------------------------------------------------------------
create or replace function public.crear_borrador_matriz(
  p_organization_id uuid, p_sector sector_av, p_notas text default null
) returns client_risk_template
language plpgsql security definer set search_path = public as $$
declare v_base client_risk_template; v_nueva client_risk_template; v_version int;
begin
  if not (p_organization_id = public.current_org_id()
          and (public.has_rol('oc') or public.has_rol('admin'))) then
    raise exception 'Solo el OC o el Admin de la organización pueden crear un borrador de matriz';
  end if;

  select * into v_base from client_risk_template
   where organization_id = p_organization_id and sector = p_sector and estado = 'borrador'
   limit 1;
  if found then
    return v_base;  -- ya hay un borrador abierto: no se crean dos en paralelo
  end if;

  select * into v_base from client_risk_template
   where organization_id = p_organization_id and sector = p_sector and activa
   limit 1;

  select coalesce(max(version), 0) + 1 into v_version from client_risk_template
   where organization_id = p_organization_id and sector = p_sector;

  insert into client_risk_template (organization_id, sector, version, configuracion,
                                    activa, estado, creada_por, notas_version)
  values (p_organization_id, p_sector, v_version,
          coalesce(v_base.configuracion,
                   '{"elementos":[{"codigo":"E1","nombre":"Elemento 1","variables":[{"codigo":"V1","pregunta":"Pregunta 1","opciones":[{"valor":1,"label":"Bajo"}]}]}],"escala_cliente":{"bajo":{"min":0,"max":1,"acciones":"Por definir"},"medio":{"min":2,"max":3,"acciones":"Por definir"},"alto":{"min":4,"max":5,"acciones":"Por definir"}}}'::jsonb),
          false, 'borrador', auth.uid(), p_notas)
  returning * into v_nueva;

  return v_nueva;
end $$;

create or replace function public.publicar_matriz(p_template_id uuid)
returns client_risk_template
language plpgsql security definer set search_path = public as $$
declare v_t client_risk_template; v_antes jsonb;
begin
  select * into v_t from client_risk_template where id = p_template_id for update;
  if not found then raise exception 'Plantilla % no existe', p_template_id; end if;

  if not (v_t.organization_id = public.current_org_id() and public.has_rol('oc')) then
    raise exception 'Solo el Oficial de Cumplimiento puede publicar una versión de la matriz';
  end if;
  if v_t.estado <> 'borrador' then
    raise exception 'La plantilla ya está publicada';
  end if;

  perform public.validar_configuracion_matriz(v_t.configuracion);

  select jsonb_build_object('version_anterior', version) into v_antes
    from client_risk_template
   where organization_id = v_t.organization_id and sector = v_t.sector and activa;

  update client_risk_template set activa = false
   where organization_id = v_t.organization_id and sector = v_t.sector and activa;

  -- El trigger de inmutabilidad bloquea cambiar `estado` sobre una publicada;
  -- aquí venimos de 'borrador', así que la transición es legítima.
  update client_risk_template
     set estado = 'publicada', activa = true,
         publicada_por = auth.uid(), publicada_en = now()
   where id = p_template_id
  returning * into v_t;

  insert into audit_log (organization_id, actor, accion, recurso_tipo, recurso_id,
                         antes, despues, motivo)
  values (v_t.organization_id, auth.uid(), 'publicar_matriz', 'client_risk_template',
          v_t.id, v_antes,
          jsonb_build_object('version', v_t.version, 'sector', v_t.sector),
          v_t.notas_version);

  return v_t;
end $$;

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
drop policy if exists "template_select_same_org" on client_risk_template;
create policy "template_select_same_org" on client_risk_template
  for select using (organization_id = public.current_org_id());

-- El OC edita únicamente borradores de su organización. Publicar y crear van
-- por las funciones security definer de arriba.
drop policy if exists "template_update_borrador_oc" on client_risk_template;
create policy "template_update_borrador_oc" on client_risk_template
  for update using (
    organization_id = public.current_org_id()
    and public.has_rol('oc')
    and estado = 'borrador'
  );

drop policy if exists "template_delete_borrador_oc" on client_risk_template;
create policy "template_delete_borrador_oc" on client_risk_template
  for delete using (
    organization_id = public.current_org_id()
    and public.has_rol('oc')
    and estado = 'borrador'
  );
