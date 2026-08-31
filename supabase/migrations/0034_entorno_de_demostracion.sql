-- =====================================================================
-- 0034 · Entorno de demostración
-- =====================================================================
-- El demo no es una maqueta: es el producto entero con datos de mentira, para
-- que un notario recorra el flujo de principio a fin —captura, motor, hallazgo,
-- aviso, bitácora— y decida si lo contrata. Y cuando lo contrate, va a cargar
-- información real en una organización propia.
--
-- Eso plantea un riesgo que no es teórico: que un aviso armado con
-- comparecientes inventados acabe presentado al SAT, o que los datos de prueba
-- de un prospecto queden mezclados con los reales el día que firma.
--
-- Tres cosas, y sólo la primera es cosmética:
--
--   1. La organización se marca, y la marca se VE. Nadie que mire la pantalla
--      puede confundir un expediente de demostración con uno real.
--
--   2. El aviso hereda la marca al nacer, y no puede firmarse. Firmar es el
--      acto por el que un Oficial de Cumplimiento se hace responsable de lo que
--      va al SAT; sobre datos inventados no significa nada y sí puede acabar
--      presentado. El candado vive en un trigger, no en la pantalla: una
--      validación que sólo existe en el front la salta cualquiera con la API.
--
--   3. Al contratar, los datos de prueba se retiran y la BITÁCORA SE QUEDA.
--      Es lo que permite explicar después qué pasó en ese periodo: sin ella,
--      una organización aparecería con seis meses de silencio y nadie sabría si
--      es que no operó o que se borró algo.
--
-- Lo que la limpieza NO toca, además de la bitácora: la metodología, las
-- tipologías, la matriz y los catálogos. Eso es configuración, no datos de
-- prueba, y es justo lo que hace que la organización siga sirviendo el día
-- después. Borrarlo obligaría a resembrar para volver a demostrar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La marca
-- ---------------------------------------------------------------------
alter table organizations
  add column if not exists es_demostracion boolean not null default false;

comment on column organizations.es_demostracion is
  'La organización es un entorno de demostración: datos de prueba, avisos que '
  'no pueden firmarse, y limpieza al contratar. La marca se enseña en pantalla.';

alter table aviso
  add column if not exists de_demostracion boolean not null default false;

comment on column aviso.de_demostracion is
  'Se hereda de la organización al crear el aviso y no cambia después: lo que '
  'nació en una demostración lo fue, aunque la organización deje de serlo.';

-- Las dos organizaciones demo que ya existen. Se identifican por su UUID
-- determinista, no por el «(DEMO)» del nombre: un nombre se edita.
update organizations set es_demostracion = true
 where id in ('12121212-1212-1212-1212-121212121212',   -- Notaría Demo GDL
              '11111111-1111-1111-1111-111111111111');  -- Ixim Pay

-- ---------------------------------------------------------------------
-- 2. El aviso hereda la marca, y marcado no se firma
-- ---------------------------------------------------------------------
create or replace function public.aviso_hereda_demostracion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select o.es_demostracion into new.de_demostracion
    from public.organizations o where o.id = new.organization_id;
  new.de_demostracion := coalesce(new.de_demostracion, false);
  return new;
end $$;

drop trigger if exists trg_aviso_demostracion on aviso;
create trigger trg_aviso_demostracion
  before insert on aviso
  for each row execute function public.aviso_hereda_demostracion();

/**
 * Un aviso de demostración no se firma.
 *
 * Firmar es el acto por el que el Oficial de Cumplimiento se hace responsable
 * de lo que se presenta al SAT. Sobre comparecientes inventados no significa
 * nada, y un aviso firmado es exactamente el que alguien sube al portal sin
 * volver a mirarlo.
 *
 * Va en trigger y no en la pantalla a propósito: una comprobación que sólo
 * vive en el front la salta cualquiera que llame a la API, y esto tiene que
 * aguantar el descuido, no sólo la mala intención.
 */
create or replace function public.aviso_demostracion_no_se_firma()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.de_demostracion and new.firmado_por is not null
     and (old.firmado_por is null or old.firmado_por <> new.firmado_por) then
    raise exception 'Este aviso es de un entorno de demostración y no puede firmarse. '
                    'Firmar compromete al Oficial de Cumplimiento con lo que se presenta '
                    'al SAT, y estos datos son de prueba.';
  end if;
  return new;
end $$;

drop trigger if exists trg_aviso_no_firmar_demo on aviso;
create trigger trg_aviso_no_firmar_demo
  before update on aviso
  for each row execute function public.aviso_demostracion_no_se_firma();

-- ---------------------------------------------------------------------
-- 3. Retirar los datos de prueba al contratar
-- ---------------------------------------------------------------------
/**
 * Vacía los datos operativos de una organización de demostración.
 *
 * La lista de tablas va ESCRITA A MANO y no se deduce del catálogo. Un barrido
 * genérico por `organization_id` se llevaría la metodología, las tipologías y
 * la matriz de riesgo, que son configuración y no datos de prueba: sin ellas la
 * organización deja de servir para volver a demostrar y habría que resembrar.
 *
 * La bitácora encadenada NO aparece en la lista, y no por olvido: la 0021 la
 * dejó sin llave foránea justamente para que sobreviva a lo que audita. Si se
 * borrara, esta organización tendría un hueco de meses y nadie podría decir si
 * es que no operó o si alguien limpió algo.
 */
create or replace function public.retirar_datos_de_demostracion(
  p_organization_id uuid,
  p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     record;
  v_motivo  text := btrim(coalesce(p_motivo, ''));
  v_borrado jsonb := '{}'::jsonb;
  v_tabla   text;
  v_n       bigint;
begin
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de plataforma puede retirar datos de demostración.';
  end if;

  if length(v_motivo) < 10 then
    raise exception 'Escribe el motivo (al menos 10 caracteres): normalmente «el cliente '
                    'contrató y va a cargar información real».';
  end if;

  select id, razon_social, es_demostracion into v_org
    from public.organizations where id = p_organization_id;
  if not found then
    raise exception 'No existe esa organización.';
  end if;

  -- El candado que importa. Sin él, un dedazo en el UUID vacía a un cliente
  -- real, y esto no tiene deshacer.
  if not v_org.es_demostracion then
    raise exception '«%» NO está marcada como entorno de demostración. Esta función sólo '
                    'vacía organizaciones de prueba; si de verdad quieres borrar datos de '
                    'un cliente real, eso es otra conversación.', v_org.razon_social;
  end if;

  -- En este orden: lo que cuelga antes que aquello de lo que cuelga. Varias van
  -- solas por cascada, pero contarlas una a una deja constancia de cuánto se
  -- retiró de cada cosa, que es lo que se enseña al terminar.
  foreach v_tabla in array array[
    'aviso', 'hallazgo', 'motor_run', 'operation', 'client'
  ] loop
    execute format('with quitadas as (delete from public.%I where organization_id = $1 returning 1)
                    select count(*) from quitadas', v_tabla)
      into v_n using p_organization_id;
    v_borrado := v_borrado || jsonb_build_object(v_tabla, v_n);
  end loop;

  -- A su propia cadena, que sigue en pie y ahora explica el hueco.
  perform public.registrar_evento(
    p_organization_id,
    'datos_de_demostracion_retirados',
    'organizations',
    p_organization_id,
    jsonb_build_object(
      'organizacion', v_org.razon_social,
      'motivo', v_motivo,
      'retirado', v_borrado,
      'se_conserva', 'La bitácora encadenada, la metodología, las tipologías, la matriz de '
                  || 'riesgo y los catálogos. Lo primero para poder explicar este periodo; '
                  || 'lo demás para que la organización siga sirviendo sin resembrar.',
      'retirado_por', auth.uid()
    ),
    'persona', auth.uid());

  return jsonb_build_object(
    'organizacion', v_org.razon_social,
    'retirado', v_borrado,
    'bitacora', 'intacta'
  );
end $$;

comment on function public.retirar_datos_de_demostracion(uuid, text) is
  'Vacía los datos operativos de una organización de demostración conservando '
  'la bitácora y la configuración. Sólo administradores de plataforma, y sólo '
  'sobre organizaciones marcadas es_demostracion.';

revoke all on function public.retirar_datos_de_demostracion(uuid, text) from public, anon;
grant execute on function public.retirar_datos_de_demostracion(uuid, text) to authenticated;
