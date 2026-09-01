-- =====================================================================
-- 0051 · El diagnóstico también mira POR FUENTE, no sólo el total
-- =====================================================================
-- Lo que se escapó, y cómo.
--
-- La 0050 contaba las filas de `country_risk_list` por organización y daba por
-- buena cualquier cifra mayor que cero. Con eso, la notaría demo salía en verde
-- con 26 jurisdicciones. Pero su tipología XII-03 tamiza contra CUATRO fuentes
-- —gafi_negra, gafi_gris, ofac_sancionado y onu— y las filas estaban repartidas
-- así:
--
--     gafi_negra        3
--     gafi_gris        22
--     ofac_sancionado   1     ← sólo Irán
--     onu               0     ← ninguna
--
-- Una tipología que dice tamizar contra OFAC y ONU, y que en la práctica sólo
-- puede disparar por Irán en OFAC y nunca por ONU. Un compareciente de un país
-- sancionado que no sea Irán pasa sin levantar nada, y la pantalla lo enseña
-- todo en verde: 26 jurisdicciones, tipología activa, expediente completo.
--
-- Es el mismo falso negativo silencioso que la 0050 existía para cazar, un
-- nivel más abajo. Contar el total no basta: hay que comprobar que cada fuente
-- que una regla dice mirar tenga contra qué mirar.
--
-- ---------------------------------------------------------------------
-- Qué NO hace esta migration
-- ---------------------------------------------------------------------
-- No rellena las listas. Los países sancionados por OFAC y por el Consejo de
-- Seguridad de la ONU son un dato normativo con fuente oficial, y ponerlos «a
-- ojo» sería exactamente lo que este proyecto no hace. Esta migration deja el
-- hueco a la vista y con nombre; llenarlo es de Kawiil-Cumplimiento.
-- =====================================================================

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
    from country_risk_list
   where organization_id = p_org and vigente_hasta is null
     and fuente in ('gafi_negra', 'gafi_gris')
  union all
  -- ------------------------------------------------------------------
  -- Lo que la 0050 no miraba: cada fuente que una tipología dice tamizar
  -- ------------------------------------------------------------------
  -- Una regla que nombra cuatro fuentes y sólo tiene datos en dos no está a
  -- medias: está dando por limpio lo que no revisó. Y no se ve, porque el total
  -- de filas sale en verde.
  select 'Fuentes que las tipologías tamizan sin datos',
         count(*)::int,
         count(*) = 0,
         case when count(*) = 0
              then 'Todas las fuentes que las reglas activas dicen mirar tienen contra qué mirar.'
              else 'HAY REGLAS TAMIZANDO CONTRA LISTAS VACÍAS: ' || string_agg(f, ', ' order by f)
                || '. Cada una es un tamiz que deja pasar todo y reporta que no encontró nada.'
         end
    from (
      select distinct f.fuente as f
        from tipologia_av t
       cross join lateral jsonb_array_elements_text(
                    coalesce(t.regla_dsl -> 'fuentes', '[]'::jsonb)) f(fuente)
       where t.organization_id = p_org and t.activa
         and not exists (
               select 1 from country_risk_list c
                where c.organization_id = p_org
                  and c.vigente_hasta is null
                  and c.fuente::text = f.fuente)
    ) vacias
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
  -- cada sujeto obligado.
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
  'Qué le falta a una organización para poder operar. Mira POR FUENTE y no sólo '
  'el total: una regla que nombra cuatro listas y tiene datos en dos no está a '
  'medias, está dando por limpio lo que no revisó, y el total de filas sale en '
  'verde igual.';

revoke all on function public.diagnostico_organizacion(uuid) from public, anon;
grant execute on function public.diagnostico_organizacion(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- El detalle, para saber QUÉ falta en cada fuente
-- ---------------------------------------------------------------------
create or replace function public.cobertura_de_listas(p_org uuid)
returns table (
  fuente text,
  tamizada_por text,
  filas_vigentes int
)
language sql stable security definer set search_path = public as $$
  select f.fuente,
         string_agg(distinct t.codigo, ', ' order by t.codigo),
         (select count(*)::int from country_risk_list c
           where c.organization_id = p_org
             and c.vigente_hasta is null
             and c.fuente::text = f.fuente)
    from tipologia_av t
   cross join lateral jsonb_array_elements_text(
                coalesce(t.regla_dsl -> 'fuentes', '[]'::jsonb)) f(fuente)
   where t.organization_id = p_org and t.activa
   group by f.fuente
   order by 3, 1;
$$;

comment on function public.cobertura_de_listas(uuid) is
  'Por cada fuente que las tipologías activas dicen tamizar: qué reglas la usan '
  'y cuántas filas vigentes tiene. Un cero aquí es una regla que deja pasar todo.';

revoke all on function public.cobertura_de_listas(uuid) from public, anon;
grant execute on function public.cobertura_de_listas(uuid) to authenticated;
