-- =====================================================================
-- Ikán · Aplicación manual · Migration 0014 + seed 12 (situaciones 69-B)
-- =====================================================================
-- El 69-B del SAT no es una lista plana: publica listados diferenciados por
-- situación jurídica (presunto, definitivo, desvirtuado, sentencia favorable).
-- Se ingieren las cuatro; sólo "definitivo" genera hallazgo.
--
-- Transaccional e idempotente. REQUISITO: la 0012 aplicada.
-- Verificación posterior: supabase/manual/verificar_0012.sql
-- =====================================================================

begin;

-- ============================================================
-- >>> supabase/migrations/0014_situacion_listas.sql
-- ============================================================
-- =====================================================================
-- Ikán · Migration 0014 · Situación dentro de una lista
-- =====================================================================
-- Nace del 69-B del SAT, que no es una lista plana: el SAT publica listados
-- DIFERENCIADOS por situación jurídica del contribuyente.
--
--   presunto             El SAT presume comprobantes sin operaciones reales.
--                        Tiene plazo legal para desvirtuar. NO es un EFOS
--                        confirmado y tratarlo como tal sería falso.
--   definitivo           El SAT confirmó la inexistencia de las operaciones.
--   desvirtuado          El contribuyente demostró que sus operaciones sí
--                        eran reales.
--   sentencia_favorable  Un tribunal ordenó sacarlo del listado.
--
-- Decisión: se ingieren LOS CUATRO, no sólo los definitivos.
--
-- Guardar sólo definitivos parece más limpio y es peor. Los desvirtuados y
-- las sentencias favorables son la PRUEBA de que alguien no es EFOS: sin
-- ellos, el día que un definitivo gana una sentencia simplemente desaparece
-- de la lista y no hay forma de explicar por qué antes marcaba y ahora no.
-- Y el presunto es información de riesgo legítima para debida diligencia
-- reforzada, siempre que nunca se presente como hallazgo confirmado.
--
-- Qué situación BLOQUEA no se decide en el código: vive en `lista_fuente`,
-- para que Kawiil-Cumplimiento pueda cambiarlo sin tocar una línea. Misma
-- regla que los parámetros regulatorios de la 0011.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Qué situaciones bloquean, por fuente
-- ---------------------------------------------------------------------
alter table lista_fuente
  add column if not exists situaciones text[],
  add column if not exists situaciones_bloqueantes text[];

comment on column lista_fuente.situaciones is
  'Situaciones posibles en esta fuente. Null = la fuente no las maneja (OFAC, ONU: estar en la lista es el único estado).';
comment on column lista_fuente.situaciones_bloqueantes is
  'Cuáles de esas situaciones cuentan como coincidencia que exige acción. Null = todas. Lo define Kawiil-Cumplimiento, no el código.';

-- ---------------------------------------------------------------------
-- 2. Situación en el registro y en la bitácora
-- ---------------------------------------------------------------------
alter table lista_registro   add column if not exists situacion text;
alter table lista_movimiento add column if not exists situacion text;

comment on column lista_registro.situacion is
  'Situación vigente dentro de la fuente (ej. definitivo, presunto). Null en fuentes que no las manejan.';
comment on column lista_movimiento.situacion is
  'Situación que fija este movimiento. Un alta con una situación distinta a la vigente ES el cambio de situación, y queda en la bitácora.';

create index if not exists idx_lista_registro_situacion
  on lista_registro (fuente_id, situacion) where activo;

-- ---------------------------------------------------------------------
-- 3. El trigger propaga la situación
-- ---------------------------------------------------------------------
-- Un alta sobre alguien ya activo, con una situación distinta, es un CAMBIO
-- de situación: se actualiza el registro y la bitácora conserva las dos
-- entradas. Es justo el seguimiento que hace falta cuando un presunto pasa a
-- definitivo, o cuando un definitivo gana una sentencia favorable.
--
-- No se agrega un valor nuevo al enum `accion_movimiento_lista` a propósito:
-- `alter type ... add value` no puede usarse en la misma transacción en que
-- se agrega, lo que obligaría a partir la migration en dos envíos (el
-- problema que ya documenta la 0006). El par (accion, situacion) expresa lo
-- mismo sin esa trampa.
create or replace function public.aplicar_movimiento_lista()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fuente uuid;
  v_registro uuid;
  v_rfc text := nullif(upper(btrim(coalesce(new.rfc, ''))), '');
  v_nombre_norm text := public.normalizar_nombre(new.nombre);
  v_situaciones text[];
begin
  select fuente_id into v_fuente from lista_carga where id = new.carga_id;
  if v_fuente is null then
    raise exception 'La carga % no existe', new.carga_id;
  end if;

  new.rfc := v_rfc;

  -- La situación debe ser una de las que la fuente declara. Si la fuente no
  -- maneja situaciones, no se acepta ninguna: evita que se cuelen etiquetas
  -- inventadas que después nadie sabe interpretar.
  select situaciones into v_situaciones from lista_fuente where id = v_fuente;
  if new.situacion is not null then
    if v_situaciones is null then
      raise exception
        'Esta fuente no maneja situaciones, pero el movimiento traía "%".', new.situacion;
    elsif not (new.situacion = any (v_situaciones)) then
      raise exception
        'Situación "%" no válida para esta fuente. Válidas: %', new.situacion, v_situaciones;
    end if;
  end if;

  select r.id into v_registro
  from lista_registro r
  where r.fuente_id = v_fuente
    and (
      (v_rfc is not null and r.rfc = v_rfc)
      or (v_rfc is null and r.rfc is null and r.nombre_normalizado = v_nombre_norm)
    )
  order by r.activo desc, r.actualizado_en desc
  limit 1;

  if new.accion = 'alta' then
    if v_registro is null then
      insert into lista_registro (
        fuente_id, tipo_entidad, nombre, rfc, curp, identificadores, pais,
        activo, situacion, alta_oficio, alta_fecha, raw_payload
      ) values (
        v_fuente, new.tipo_entidad, new.nombre, v_rfc, new.curp,
        new.identificadores, new.pais,
        true, new.situacion, new.oficio_numero, new.oficio_fecha, to_jsonb(new)
      )
      returning id into v_registro;
    else
      update lista_registro set
        nombre = new.nombre,
        curp = coalesce(new.curp, curp),
        identificadores = case when new.identificadores = '{}'::jsonb
                               then identificadores else new.identificadores end,
        pais = coalesce(new.pais, pais),
        activo = true,
        situacion = coalesce(new.situacion, situacion),
        alta_oficio = coalesce(new.oficio_numero, alta_oficio),
        alta_fecha = coalesce(new.oficio_fecha, alta_fecha),
        baja_oficio = null,
        baja_fecha = null,
        actualizado_en = now()
      where id = v_registro;
    end if;

  else -- baja
    if v_registro is null then
      raise exception
        'No hay registro en esta lista que coincida con % (RFC %). Una baja sólo procede sobre alguien previamente dado de alta.',
        new.nombre, coalesce(v_rfc, 'sin RFC');
    end if;

    update lista_registro set
      activo = false,
      situacion = coalesce(new.situacion, situacion),
      baja_oficio = new.oficio_numero,
      baja_fecha = new.oficio_fecha,
      actualizado_en = now()
    where id = v_registro;
  end if;

  new.registro_id := v_registro;
  return new;
end
$$;

-- ---------------------------------------------------------------------
-- 4. La vista distingue lo que bloquea de lo que sólo informa
-- ---------------------------------------------------------------------
-- `bloqueante` es la columna que separa un hallazgo de una señal. El motor
-- levanta hallazgo sólo con las bloqueantes; las demás se le muestran al OC
-- como contexto para debida diligencia reforzada, nunca como confirmación.
--
-- Se DEJA CAER y se recrea, no `create or replace`: las columnas nuevas van
-- en medio, y `replace` sólo admite agregar al final. Con replace truena con
-- «cannot change name of view column».
drop view if exists v_listas_vigentes;
create view v_listas_vigentes
with (security_invoker = true) as
  select r.id            as registro_id,
         f.codigo        as fuente,
         f.nombre        as fuente_nombre,
         f.naturaleza,
         r.tipo_entidad,
         r.nombre,
         r.nombre_normalizado,
         r.nombres_alternos,
         r.rfc,
         r.curp,
         r.identificadores,
         r.pais,
         r.situacion,
         (f.situaciones_bloqueantes is null
          or r.situacion is null
          or r.situacion = any (f.situaciones_bloqueantes)) as bloqueante,
         r.alta_oficio,
         r.alta_fecha,
         r.actualizado_en
  from lista_registro r
  join lista_fuente f on f.id = r.fuente_id
  where r.activo
    and f.activa;

comment on view v_listas_vigentes is
  'Personas y entidades listadas. `bloqueante` separa la coincidencia que exige acción de la que sólo informa (ej. un presunto del 69-B).';

-- ============================================================
-- >>> supabase/seed/12_situaciones_69b.sql
-- ============================================================
-- =====================================================================
-- Seed · Situaciones del listado 69-B del SAT
-- =====================================================================
-- Requiere la migration 0014.
--
-- El SAT publica listados DIFERENCIADOS por situación jurídica. Las cuatro
-- se ingieren; sólo una genera hallazgo.
--
-- Fuente de los estados: portal de Datos Abiertos del SAT, artículo 69-B
-- (omawww.sat.gob.mx/tramitesyservicios/Paginas/datos_abiertos_articulo69b.htm).
-- Cifras de referencia a 2026, de fuentes secundarias, sólo para dimensionar:
-- ~5,539 RFC en total — 4,558 definitivos, 282 presuntos, 139 desvirtuados,
-- 560 con sentencia favorable. NO se siembra ningún RFC: los registros entran
-- por carga, nunca por seed.
--
-- Por qué sólo 'definitivo' bloquea:
--   · presunto            tiene plazo legal para desvirtuar. Presentarlo como
--                         EFOS confirmado sería falso. Se conserva como señal
--                         para debida diligencia reforzada.
--   · desvirtuado         demostró que sus operaciones eran reales. Es la
--   · sentencia_favorable prueba de que NO es EFOS, y por eso se guarda: sin
--                         ella no se podría explicar por qué alguien dejó de
--                         marcar.
--
-- PENDIENTE_CONFIRMAR con Kawiil-Cumplimiento: si un presunto debe además
-- disparar alguna medida, y no sólo mostrarse.
-- =====================================================================

update lista_fuente
   set situaciones = array['presunto', 'definitivo', 'desvirtuado', 'sentencia_favorable'],
       situaciones_bloqueantes = array['definitivo'],
       url_oficial = 'http://omawww.sat.gob.mx/tramitesyservicios/Paginas/datos_abiertos_articulo69b.htm',
       frecuencia_objetivo = 'PENDIENTE_CONFIRMAR (el SAT publica en general trimestral)',
       notas = 'Naturaleza FISCAL, no sanción de lavado: son contribuyentes con operaciones presuntamente simuladas. '
               'Se marca así a propósito para que el OC no trate un EFOS como si fuera un sancionado OFAC. '
               'Se ingieren las cuatro situaciones; sólo "definitivo" genera hallazgo. No hay API: el SAT publica CSV '
               'en su portal de Datos Abiertos.'
 where codigo = 'sat_69b';

-- La lista de la UIF no maneja situaciones: estar bloqueado es el único
-- estado. Se deja explícito para que el trigger rechace etiquetas inventadas.
update lista_fuente
   set situaciones = null,
       situaciones_bloqueantes = null
 where codigo in ('uif_bloqueadas', 'ofac_sdn', 'onu_consolidada', 'ue_sanciones');

commit;
