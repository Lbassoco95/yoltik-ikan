-- =====================================================================
-- Ikán · Aplicación manual · Migration 0018 (plan de trabajo del hallazgo)
-- =====================================================================
-- El OC decide por tiempo qué hace con cada hallazgo. El sistema propone una
-- fecha; él dispone y puede cambiarla, y el cambio queda en la bitácora.
--
-- Regla de la fecha propuesta: si al detectarse quedan 15 días o más del mes,
-- el último día de ESE mes; si quedan menos, el último del SIGUIENTE. Una
-- fecha imposible se incumple y deja de significar algo.
--
-- Transaccional e idempotente. REQUISITO: la 0007 aplicada (bitácora).
-- =====================================================================

begin;

-- =====================================================================
-- Ikán · Migration 0018 · Plan de trabajo del hallazgo
-- =====================================================================
-- El OC decide POR TIEMPO qué hace con cada hallazgo: si lo cierra este mes,
-- el siguiente, o pone una fecha propia. El sistema propone; él dispone y
-- puede cambiarla después.
--
-- Sin esto, un hallazgo abierto no dice nada: no se sabe si está esperando
-- información o si se quedó olvidado. Y esa diferencia importa cuando llega el
-- día 17 y hay que decidir si el aviso se presenta con expedientes abiertos.
--
-- ---------------------------------------------------------------------
-- La regla de la fecha propuesta
-- ---------------------------------------------------------------------
-- Si al detectarse quedan 15 días o más del mes → el último día de ESE mes.
-- Si quedan menos de 15 → el último día del mes SIGUIENTE.
--
-- El corte en 15 días no es arbitrario: es lo que separa un hallazgo que da
-- tiempo de trabajar dentro del mismo periodo de aviso, de uno que llegó tan
-- tarde que exigirle cierre en el mes sería fijar una fecha que nadie va a
-- cumplir. Una fecha imposible se incumple y deja de significar algo.
-- =====================================================================

alter table hallazgo
  add column if not exists fecha_compromiso date,
  add column if not exists plan_trabajo text,
  add column if not exists compromiso_fijado_por uuid references auth.users(id),
  add column if not exists compromiso_fijado_en timestamptz;

comment on column hallazgo.fecha_compromiso is
  'Cuándo se compromete el OC a resolverlo. La propone el sistema y la puede cambiar. NO es un plazo regulatorio.';
comment on column hallazgo.plan_trabajo is
  'Qué falta para cerrarlo. Es lo que distingue un expediente en curso de uno olvidado.';

create index if not exists idx_hallazgo_compromiso
  on hallazgo (organization_id, fecha_compromiso)
  where estado in ('abierto', 'en_revision');

-- ---------------------------------------------------------------------
-- Fecha propuesta
-- ---------------------------------------------------------------------
create or replace function public.fecha_compromiso_propuesta(p_detectado date default current_date)
returns date
language sql
immutable
as $$
  select case
    when (date_trunc('month', p_detectado) + interval '1 month - 1 day')::date - p_detectado >= 15
      then (date_trunc('month', p_detectado) + interval '1 month - 1 day')::date
    else (date_trunc('month', p_detectado) + interval '2 months - 1 day')::date
  end
$$;

comment on function public.fecha_compromiso_propuesta(date) is
  'Fecha de cierre sugerida: fin de mes si quedan 15 días o más, fin del siguiente si quedan menos. Una fecha imposible se incumple y deja de significar algo.';

-- Al nacer, todo hallazgo trae fecha propuesta. Que llegue con una fecha por
-- omisión, y no en blanco, es lo que evita que se quede sin plan por descuido.
create or replace function public.hallazgo_compromiso_default()
returns trigger
language plpgsql
as $$
begin
  if new.fecha_compromiso is null then
    new.fecha_compromiso := public.fecha_compromiso_propuesta(coalesce(new.creado_en::date, current_date));
  end if;
  return new;
end
$$;

drop trigger if exists trg_hallazgo_compromiso on hallazgo;
create trigger trg_hallazgo_compromiso
  before insert on hallazgo
  for each row execute function public.hallazgo_compromiso_default();

-- Cambiar el compromiso queda en la bitácora, como cualquier otro movimiento
-- del expediente: mover una fecha para no incumplirla es una decisión, y las
-- decisiones se registran.
create or replace function public.hallazgo_bitacora_compromiso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fecha_compromiso is distinct from old.fecha_compromiso then
    insert into hallazgo_bitacora (hallazgo_id, tipo, descripcion, usuario)
    values (
      new.id, 'nota',
      'Fecha de compromiso: ' || coalesce(old.fecha_compromiso::text, 'sin fijar') ||
        ' → ' || coalesce(new.fecha_compromiso::text, 'sin fijar') ||
        coalesce('. Plan: ' || nullif(new.plan_trabajo, ''), ''),
      auth.uid()
    );
  end if;
  return new;
end
$$;

drop trigger if exists trg_hallazgo_bitacora_compromiso on hallazgo;
create trigger trg_hallazgo_bitacora_compromiso
  after update on hallazgo
  for each row execute function public.hallazgo_bitacora_compromiso();

-- ---------------------------------------------------------------------
-- Rezago: lo que lleva demasiado abierto sin que nadie lo mueva
-- ---------------------------------------------------------------------
-- Un expediente que se está trabajando NO es rezago, aunque lleve meses: la
-- señal no es la antigüedad sino el silencio. Por eso se mira la última
-- actividad de la bitácora, no la fecha de creación.
create or replace view v_hallazgos_rezagados
with (security_invoker = true) as
  select h.id,
         h.organization_id,
         h.folio,
         h.tipologia_codigo,
         h.tipologia_nombre,
         h.severidad,
         h.estado,
         h.creado_en,
         h.fecha_compromiso,
         h.plan_trabajo,
         (current_date - h.creado_en::date) as dias_abierto,
         coalesce(
           (select max(b.creado_en) from hallazgo_bitacora b where b.hallazgo_id = h.id),
           h.creado_en
         )::date as ultima_actividad,
         (current_date - coalesce(
           (select max(b.creado_en) from hallazgo_bitacora b where b.hallazgo_id = h.id),
           h.creado_en
         )::date) as dias_sin_actividad,
         case
           when h.fecha_compromiso < current_date then 'compromiso_vencido'
           when current_date - coalesce(
                  (select max(b.creado_en) from hallazgo_bitacora b where b.hallazgo_id = h.id),
                  h.creado_en)::date >= 90 then 'sin_actividad_90_dias'
           else 'en_curso'
         end as situacion
  from hallazgo h
  where h.estado in ('abierto', 'en_revision');

comment on view v_hallazgos_rezagados is
  'Hallazgos abiertos con su situación. El rezago se mide por SILENCIO (90 días sin actividad en la bitácora), no por antigüedad: un expediente que se está trabajando no es rezago aunque lleve meses.';

commit;

-- =====================================================================
-- Verificación
-- =====================================================================
-- Se agregó después: este bundle terminaba sin decir nada. Una sola tabla,
-- porque el SQL Editor de Supabase sólo muestra la última consulta.
select 'columnas del plan de trabajo' as objeto,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'hallazgo'
           and column_name in ('fecha_compromiso','plan_trabajo',
                               'compromiso_fijado_por','compromiso_fijado_en'))::text
         || ' de 4' as estado,
       'el OC fija cuándo cierra cada hallazgo' as para_que
union all
select 'regla de los 15 días',
       case when public.fecha_compromiso_propuesta(date '2026-08-16') = date '2026-08-31'
             and public.fecha_compromiso_propuesta(date '2026-08-17') = date '2026-09-30'
            then 'correcta' else 'REVISAR' end,
       'con 15 días o más de margen el compromiso cae este mes; si no, el siguiente'
union all
select 'vista de rezago',
       case when to_regclass('public.v_hallazgos_rezagados') is not null
            then 'creada' else 'FALTA' end,
       'el rezago se mide por silencio, no por antigüedad';
