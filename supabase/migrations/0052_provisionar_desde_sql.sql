-- =====================================================================
-- 0052 · La provisión tiene que poder llamarse desde donde se usa
-- =====================================================================
-- Defecto de la 0050, encontrado al ir a usarla.
--
-- `provisionar_organizacion` exige `es_admin_kawiil()`, que resuelve
-- `auth.uid()`. Eso es correcto para una llamada desde la aplicación —dar de
-- alta un sujeto obligado no es del OC de otra organización— pero deja fuera
-- justo las dos formas en que la función se va a usar primero:
--
--   · El SQL Editor de Supabase, donde no hay JWT y `auth.uid()` es nulo.
--   · Un script con la llave de service_role, que tampoco lleva usuario.
--
-- Así que la función quedaba imposible de llamar por quien tenía que llamarla.
--
-- ---------------------------------------------------------------------
-- Por qué dejar pasar a `postgres` no afloja nada
-- ---------------------------------------------------------------------
-- Quien está conectado como superusuario ya puede insertar en `organizations`
-- a mano, saltarse RLS y reescribir esta misma función. El guardia nunca fue
-- una defensa contra él: es una defensa contra un usuario de la aplicación con
-- una sesión válida y sin permiso. Contra ese sigue en pie, sin cambios.
--
-- Lo que se gana es que la vía correcta —la función, que provisiona completo y
-- deja rastro en la bitácora— deje de ser la única que no se puede usar. Cuando
-- el camino bueno está cerrado, lo que ocurre es que alguien inserta la
-- organización a mano y arranca ciega. Que es el problema que la 0050 existía
-- para resolver.
--
-- `session_user` y no `current_user`: dentro de una función SECURITY DEFINER
-- `current_user` es siempre el dueño, así que preguntar por él contestaría
-- «postgres» viniera de donde viniera —y el guardia no serviría para nada—.
-- `session_user` conserva quién se conectó de verdad.
-- =====================================================================

create or replace function public.puede_provisionar()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin_kawiil()
      or session_user in ('postgres', 'supabase_admin')
      or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
$$;

comment on function public.puede_provisionar() is
  'Quién puede dar de alta un sujeto obligado: un admin de Kawiil con sesión, o '
  'una conexión de superusuario o service_role —el SQL Editor y los scripts de '
  'alta, que no llevan usuario—. No afloja nada: quien se conecta así ya puede '
  'escribir en organizations a mano; lo que evita es que la vía correcta, la que '
  'provisiona completo y deja rastro, sea la única cerrada.';

revoke all on function public.puede_provisionar() from public, anon;
grant execute on function public.puede_provisionar() to authenticated;

-- ---------------------------------------------------------------------
-- El guardia, sustituido dentro de la provisión
-- ---------------------------------------------------------------------
create or replace function public.provisionar_organizacion(
  p_rfc text,
  p_razon_social text,
  p_sector sector_av,
  p_perfil_actividad text,
  p_domicilio_fiscal text default null,
  p_representante_legal text default null,
  p_es_demostracion boolean default false
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org        uuid;
  v_ref        uuid;
  v_clave_act  text;
  v_matriz     int;
  v_paises     int;
  v_tip        int;
begin
  if not public.puede_provisionar() then
    raise exception 'Sólo un administrador de Kawiil puede dar de alta una organización.';
  end if;

  if coalesce(btrim(p_rfc), '') = '' or coalesce(btrim(p_razon_social), '') = '' then
    raise exception 'El RFC y la razón social son obligatorios.';
  end if;

  select id into v_ref from organizations
   where es_referencia and p_sector = any(sectores)
   limit 1;
  if v_ref is null then
    raise exception 'No hay organización de referencia para el sector %. Marca una con es_referencia antes de provisionar.', p_sector;
  end if;

  v_clave_act := case p_sector when 'XII' then 'FEP' when 'XVI' then 'AVI' else null end;

  select id into v_org from organizations where upper(btrim(rfc)) = upper(btrim(p_rfc));

  if v_org is null then
    insert into organizations (
      rfc, razon_social, sectores, perfil_actividad, domicilio_fiscal,
      representante_legal, es_demostracion, es_referencia,
      clave_sujeto_obligado, clave_actividad
    ) values (
      upper(btrim(p_rfc)), btrim(p_razon_social), array[p_sector]::sector_av[],
      p_perfil_actividad, p_domicilio_fiscal, p_representante_legal,
      p_es_demostracion, false,
      upper(btrim(p_rfc)), v_clave_act
    )
    returning id into v_org;
  else
    update organizations
       set clave_sujeto_obligado = coalesce(clave_sujeto_obligado, upper(btrim(p_rfc))),
           clave_actividad = coalesce(clave_actividad, v_clave_act)
     where id = v_org;
  end if;

  insert into client_risk_template
    (organization_id, sector, version, configuracion, activa, estado, notas_version)
  select v_org, p_sector, 1, t.configuracion, true, 'publicada',
         'Provisionada el ' || to_char(now(), 'DD/MM/YYYY') ||
         ' a partir de la matriz vigente de la organización de referencia del sector ' ||
         p_sector || ' (versión ' || t.version || ').'
    from client_risk_template t
   where t.organization_id = v_ref and t.sector = p_sector and t.activa
   order by t.version desc
   limit 1
      on conflict (organization_id, sector, version) do nothing;

  insert into country_risk_list
    (organization_id, iso2, nombre, nivel, fuente, vigente_desde, vigente_hasta, notas, plenario)
  select v_org, c.iso2, c.nombre, c.nivel, c.fuente, c.vigente_desde, null, c.notas, c.plenario
    from country_risk_list c
   where c.organization_id = v_ref and c.vigente_hasta is null
      on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

  insert into tipologia_av
    (organization_id, sector, codigo, nombre, descripcion, regla_dsl, severidad,
     activa, version, fuente, genera_aviso)
  select v_org, t.sector, t.codigo, t.nombre, t.descripcion, t.regla_dsl, t.severidad,
         t.activa, t.version, t.fuente, t.genera_aviso
    from tipologia_av t
   where t.organization_id = v_ref and t.sector = p_sector and t.activa
      on conflict (organization_id, sector, codigo, version) do nothing;

  select count(*) into v_matriz from client_risk_template where organization_id = v_org and activa;
  select count(*) into v_paises from country_risk_list where organization_id = v_org and vigente_hasta is null;
  select count(*) into v_tip    from tipologia_av where organization_id = v_org and activa;

  perform public.registrar_evento(
    v_org, 'organizacion_provisionada', 'organizations', v_org,
    jsonb_build_object(
      'rfc', upper(btrim(p_rfc)),
      'razon_social', btrim(p_razon_social),
      'sector', p_sector,
      'referencia', v_ref,
      'matriz_activa', v_matriz,
      'jurisdicciones_gafi', v_paises,
      'tipologias_activas', v_tip,
      'es_demostracion', p_es_demostracion,
      -- Quién la dio de alta. Con `auth.uid()` nulo —SQL Editor o script— el
      -- evento diría «persona: null», que se lee como si no se supiera quién
      -- fue. Se dice de dónde vino, que es lo que de verdad se sabe.
      'via', case when public.es_admin_kawiil() then 'aplicación'
                  else 'conexión directa (' || session_user || ')' end,
      'no_copiado', 'Clientes, actos, avisos, hallazgos y usuarios: son de quien los '
                 || 'capturó. Las zonas de atención no se copian porque no son por '
                 || 'organización: son un catálogo global que mantiene Kawiil.',
      'tipologias_sin_aprobar', 'Entran activas pero sin aprobación: la del OC de la '
                             || 'referencia no vale por el de esta organización.',
      'listas_por_cubrir', 'Revisar `cobertura_de_listas` antes de operar: hereda las '
                        || 'listas de la referencia, y si a la referencia le falta una '
                        || 'fuente, a esta también.'
    ),
    'persona', auth.uid()
  );

  return v_org;
end $$;

revoke all on function public.provisionar_organizacion(text, text, sector_av, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.provisionar_organizacion(text, text, sector_av, text, text, text, boolean)
  to authenticated;
