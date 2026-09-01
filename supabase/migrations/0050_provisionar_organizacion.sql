-- =====================================================================
-- 0050 · Dar de alta una organización que arranque viendo
-- =====================================================================
-- El problema que resuelve, y no es teórico.
--
-- Hasta hoy la única manera de dar de alta un sujeto obligado era correr un
-- seed con UUID escrito a mano. Y una organización creada sin más queda con
-- tres huecos que NO se ven en pantalla:
--
--   1. Sin matriz de riesgo. La función `nueva_version_matriz` de la 0010 crea
--      un esqueleto —«Elemento 1 / Pregunta 1 / Por definir»— cuando no hay de
--      dónde copiar. Un notario que abra su primer expediente se encuentra con
--      eso.
--   2. Sin snapshot del GAFI. La 0045 sólo carga jurisdicciones para las
--      organizaciones que YA tenían filas en `country_risk_list`. Una nueva se
--      queda en cero, y entonces la variable de riesgo país contesta «sin
--      observaciones» para TODOS los países del mundo. No es una pantalla
--      vacía: es un falso negativo silencioso, que es la peor forma de fallar
--      que tiene un sistema de PLD.
--   3. Sin tipologías. El Motor no tendría contra qué comparar y no levantaría
--      un solo hallazgo, con la apariencia de que no hay nada que levantar.
--
-- Los tres se ven igual desde la pantalla: todo en verde. Por eso además de
-- provisionar hay un diagnóstico que los nombra.
--
-- ---------------------------------------------------------------------
-- De dónde se copia, y por qué no de «la más nueva que haya»
-- ---------------------------------------------------------------------
-- La tentación es copiar la plantilla activa de mayor versión que exista para
-- ese sector. Eso mezclaría organizaciones: la matriz de una notaría es SUYA
-- —su Oficial de Cumplimiento puede versionarla conforme al Capítulo II— y
-- copiarla a otra le entregaría a un tercero una metodología ajena.
--
-- Así que la fuente es explícita: `organizations.es_referencia` marca de cuál
-- se provisiona cada sector. Kawiil mantiene esas, y si alguien edita la matriz
-- de una organización de referencia, sabe que está editando la plantilla de
-- todas las que vengan.
--
-- ---------------------------------------------------------------------
-- Qué NO copia
-- ---------------------------------------------------------------------
-- Clientes, actos, avisos, hallazgos y usuarios: son de quien los capturó.
--
-- Las zonas de atención tampoco, pero por otro motivo: no son por organización.
-- Son un catálogo global que mantiene Kawiil, porque la determinación de qué
-- zonas lo son a la luz de la evaluación nacional de riesgos no la toma cada
-- sujeto obligado. Mientras esté vacío, la variable de zona ni puntúa ni se
-- pide, y eso vale para todos por igual.
-- =====================================================================

-- ---------------------------------------------------------------------
-- De dónde se copia
-- ---------------------------------------------------------------------
alter table organizations
  add column if not exists es_referencia boolean not null default false;

comment on column organizations.es_referencia is
  'Esta organización es la plantilla de la que se provisionan las nuevas de su '
  'sector: matriz vigente, tipologías y snapshot del GAFI. Se marca a mano y la '
  'mantiene Kawiil. Editar la matriz de una organización de referencia cambia lo '
  'que heredarán todas las que vengan después.';

create unique index if not exists idx_organizacion_referencia_por_sector
  on organizations ((sectores[1])) where es_referencia;

comment on index idx_organizacion_referencia_por_sector is
  'Una sola referencia por sector. Con dos, «de dónde se copió» dependería del '
  'orden en que la base devolviera las filas, que es no determinista.';

-- Las dos organizaciones de demostración son las referencias de hoy: XVI de
-- Ixim Pay y XII de la notaría. Sólo se marcan si existen, para que esta
-- migration no falle en un proyecto donde todavía no corrieron los seeds.
update organizations set es_referencia = true
 where id in (
   '11111111-1111-1111-1111-111111111111',  -- Ixim Pay, sector XVI
   '12121212-1212-1212-1212-121212121212'   -- Notaría Demo GDL, sector XII
 ) and not es_referencia;

-- ---------------------------------------------------------------------
-- El diagnóstico: qué le falta a una organización para poder operar
-- ---------------------------------------------------------------------
-- Va primero porque es lo que se puede correr HOY sobre lo que ya está en
-- producción, sin provisionar nada. Los tres huecos de arriba se ven todos
-- iguales desde la aplicación —verde— y esto es lo que los distingue.
create or replace function public.diagnostico_organizacion(p_org uuid)
returns table (
  concepto text,
  cuantos int,
  listo boolean,
  detalle text
)
language sql stable security definer set search_path = public as $$
  select 'Matriz de riesgo vigente'::text,
         count(*)::int,
         count(*) > 0,
         case when count(*) > 0
              then 'Hay una plantilla activa. Los expedientes se pueden calificar.'
              else 'SIN MATRIZ. El expediente se abriría con el esqueleto de la 0010 '
                || '(«Elemento 1 / Pregunta 1 / Por definir»), no con una metodología.'
         end
    from client_risk_template where organization_id = p_org and activa
  union all
  select 'Jurisdicciones del GAFI',
         count(*)::int,
         count(*) > 0,
         case when count(*) > 0
              then 'Cargadas. La variable de riesgo país mide contra algo.'
              else 'SIN SNAPSHOT DEL GAFI. La variable de riesgo país contestaría «sin '
                || 'observaciones» para todos los países. Es un falso negativo silencioso, '
                || 'no una pantalla vacía.'
         end
    from country_risk_list where organization_id = p_org and vigente_hasta is null
  union all
  select 'Tipologías activas',
         count(*)::int,
         count(*) > 0,
         case when count(*) > 0
              then 'El Motor tiene contra qué comparar.'
              else 'SIN TIPOLOGÍAS. El Motor no levantaría un solo hallazgo, con la '
                || 'apariencia de que no hay nada que levantar.'
         end
    from tipologia_av where organization_id = p_org and activa
  union all
  select 'Claves del padrón',
         (select count(*)::int from organizations o
           where o.id = p_org
             and coalesce(o.clave_sujeto_obligado, '') <> ''
             and coalesce(o.clave_actividad, '') <> ''),
         exists (select 1 from organizations o
                  where o.id = p_org
                    and coalesce(o.clave_sujeto_obligado, '') <> ''
                    and coalesce(o.clave_actividad, '') <> ''),
         'Sin clave de sujeto obligado y clave de actividad, el portal del SAT rechaza el aviso.'
  union all
  select 'Usuarios con rol',
         count(*)::int,
         count(*) > 0,
         case when count(*) > 0
              then 'Hay quien entre.'
              else 'SIN USUARIOS. La organización existe y nadie puede abrirla.'
         end
    from user_profile up
    join user_roles ur on ur.user_id = up.id
   where up.organization_id = p_org
  union all
  -- Catálogo GLOBAL, no por organización: la determinación de qué zonas son de
  -- atención a la luz de la evaluación nacional de riesgos es de Kawiil, no de
  -- cada sujeto obligado. Por eso no se provisiona ni se marca como pendiente
  -- de esta organización: se informa, y afecta a todas por igual.
  select 'Zonas de atención (catálogo global)',
         count(*)::int,
         true,
         case when count(*) > 0
              then 'Cargadas. La variable de zona puntúa para todas las organizaciones.'
              else 'Vacía. Mientras lo esté, la variable de zona ni puntúa ni se pide, y eso '
                || 'vale para todas las organizaciones. Cargarla es tarea de Kawiil.'
         end
    from zona_atencion where vigente_hasta is null;
$$;

comment on function public.diagnostico_organizacion(uuid) is
  'Qué le falta a una organización para poder operar. Los huecos que nombra se '
  'ven todos iguales desde la aplicación —verde— y ese es justo el motivo de que '
  'esta función exista.';

revoke all on function public.diagnostico_organizacion(uuid) from public, anon;
grant execute on function public.diagnostico_organizacion(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- La provisión
-- ---------------------------------------------------------------------
create or replace function public.provisionar_organizacion(
  p_rfc text,
  p_razon_social text,
  p_sector sector_av,
  p_perfil_actividad text,
  p_domicilio_fiscal text default null,
  p_representante_legal text default null,
  /** Un sujeto obligado real NO es demostración: el banner ámbar que sale con
   *  esto en verdadero le diría a un notario que lo que está capturando no
   *  cuenta, y sí cuenta. Por eso el valor por omisión es falso y hay que
   *  pedir el otro a propósito. */
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
  -- Dar de alta un sujeto obligado es una operación de Kawiil, no del Oficial
  -- de Cumplimiento de otra organización.
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de Kawiil puede dar de alta una organización.';
  end if;

  if coalesce(btrim(p_rfc), '') = '' or coalesce(btrim(p_razon_social), '') = '' then
    raise exception 'El RFC y la razón social son obligatorios.';
  end if;

  -- La organización de referencia de ese sector. Sin ella no se provisiona:
  -- crear la organización a medias y devolverla como si estuviera lista es
  -- exactamente el error que esta función existe para no repetir.
  select id into v_ref from organizations
   where es_referencia and p_sector = any(sectores)
   limit 1;
  if v_ref is null then
    raise exception 'No hay organización de referencia para el sector %. Marca una con es_referencia antes de provisionar.', p_sector;
  end if;

  -- La clave de actividad del padrón, por sector. No se adivina: sale del
  -- mismo criterio del seed 15.
  v_clave_act := case p_sector when 'XII' then 'FEP' when 'XVI' then 'AVI' else null end;

  -- Idempotente por RFC: volver a correrla completa lo que falte en vez de
  -- fallar. Una provisión a medias por un corte de red se arregla corriéndola
  -- otra vez.
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
    -- Existía. No se pisan razón social ni domicilio —pueden haberse corregido
    -- a mano— pero sí se completan las claves del padrón si faltan, porque sin
    -- ellas el portal del SAT rechaza el aviso.
    update organizations
       set clave_sujeto_obligado = coalesce(clave_sujeto_obligado, upper(btrim(p_rfc))),
           clave_actividad = coalesce(clave_actividad, v_clave_act)
     where id = v_org;
  end if;

  -- --- Matriz de riesgo -------------------------------------------------
  -- Se copia la configuración vigente de la referencia y entra como versión 1
  -- de esta organización: su historial de versiones empieza aquí, no hereda el
  -- ajeno. `notas_version` deja dicho de dónde salió, que es lo que una
  -- verificación va a preguntar.
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

  -- --- Snapshot del GAFI ------------------------------------------------
  -- Todas las jurisdicciones vigentes de la referencia, con su plenario. No es
  -- información de la organización de origen: es el mismo GAFI para todos.
  insert into country_risk_list
    (organization_id, iso2, nombre, nivel, fuente, vigente_desde, vigente_hasta, notas, plenario)
  select v_org, c.iso2, c.nombre, c.nivel, c.fuente, c.vigente_desde, null, c.notas, c.plenario
    from country_risk_list c
   where c.organization_id = v_ref and c.vigente_hasta is null
      on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

  -- --- Tipologías -------------------------------------------------------
  -- Sin aprobación del OC: la que dio el OC de la referencia no vale por el de
  -- esta organización. Entran activas para que el Motor corra desde el primer
  -- día, y `aprobada_por_oc_en` en null deja ver que están pendientes de que su
  -- propio Oficial de Cumplimiento las haga suyas.
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
      'no_copiado', 'Clientes, actos, avisos, hallazgos y usuarios: son de quien los '
                 || 'capturó. Las zonas de atención no se copian porque no son por '
                 || 'organización: son un catálogo global que mantiene Kawiil.',
      'tipologias_sin_aprobar', 'Entran activas pero sin aprobación: la del OC de la '
                             || 'referencia no vale por el de esta organización.'
    ),
    'persona', auth.uid()
  );

  return v_org;
end $$;

comment on function public.provisionar_organizacion is
  'Da de alta un sujeto obligado con lo que necesita para no arrancar ciego: '
  'matriz vigente, snapshot del GAFI y tipologías, copiados de la organización '
  'de referencia de su sector. Idempotente por RFC.';

revoke all on function public.provisionar_organizacion(text, text, sector_av, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.provisionar_organizacion(text, text, sector_av, text, text, text, boolean)
  to authenticated;

revoke insert, update, delete on organizations from anon;
