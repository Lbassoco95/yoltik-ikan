-- =====================================================================
-- Ikán · Aplicar migration 0034 en el SQL Editor / API de gestión
-- =====================================================================
-- Convierte el demo en un entorno de demostración declarado, con dos candados
-- que no son cosméticos:
--
--   1. Un aviso de demostración NO PUEDE FIRMARSE. Firmar es el acto por el que
--      el Oficial de Cumplimiento se hace responsable de lo que va al SAT, y un
--      aviso firmado es el que alguien sube al portal sin volver a mirarlo. El
--      candado va en trigger, no en la pantalla.
--
--   2. Al contratar, `retirar_datos_de_demostracion` vacía los datos de prueba
--      y CONSERVA LA BITÁCORA. Sin ella la organización tendría meses de
--      silencio y nadie podría decir si es que no operó o si alguien limpió.
--      La función se niega a tocar una organización que no esté marcada como
--      demostración: es el candado contra el dedazo en el UUID, que no tiene
--      deshacer.
--
-- Marca como demostración las dos organizaciones demo que ya existen, por su
-- UUID y no por el «(DEMO)» del nombre, que se edita.
--
-- No borra nada al aplicarse. Idempotente y en transacción.
-- =====================================================================

begin;

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


-- =====================================================================
-- Verificación
-- =====================================================================
do $$
declare v_n bigint;
begin
  -- 1. Las columnas y la función.
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='organizations'
                    and column_name='es_demostracion')
     or not exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='aviso'
                       and column_name='de_demostracion') then
    raise exception 'FALLA 1: faltan las columnas de demostración';
  end if;
  if to_regprocedure('public.retirar_datos_de_demostracion(uuid,text)') is null then
    raise exception 'FALLA 1b: falta retirar_datos_de_demostracion';
  end if;

  -- 2. Los DOS triggers. Sin el segundo, un aviso de demostración se firma y
  --    puede acabar en el portal del SAT: es el candado del bundle.
  select count(*) into v_n from pg_trigger
   where tgrelid = 'public.aviso'::regclass
     and tgname in ('trg_aviso_demostracion', 'trg_aviso_no_firmar_demo')
     and not tgisinternal;
  if v_n <> 2 then raise exception 'FALLA 2: hay % de 2 triggers de demostración', v_n; end if;

  -- 3. La función de vaciado no quedó al alcance de anon.
  if has_function_privilege('anon', 'public.retirar_datos_de_demostracion(uuid,text)', 'execute') then
    raise exception 'FALLA 3: retirar_datos_de_demostracion quedó abierta a anon';
  end if;

  -- 4. Las dos que esta migration marca quedaron marcadas.
  --
  --    Y NO se comprueba que no haya más, aunque fue lo primero que escribí:
  --    va a haberlas. Habrá un entorno de demostración por cada actividad
  --    vulnerable que se desarrolle, y un bundle que aborte al encontrar la
  --    tercera obliga a editarlo cada vez, que es como se acaba desactivando
  --    una comprobación. Lo que sí se enseña es CUÁLES están marcadas, para
  --    que quien lo corra reconozca la lista.
  select count(*) into v_n from public.organizations
   where es_demostracion
     and id in ('12121212-1212-1212-1212-121212121212',
                '11111111-1111-1111-1111-111111111111');
  if v_n <> 2 then
    raise exception 'FALLA 4: se esperaban 2 organizaciones demo marcadas y hay %', v_n;
  end if;

  -- 5. Ningún aviso YA FIRMADO quedó marcado de demostración: eso significaría
  --    que algo se firmó antes de que existiera el candado y hay que mirarlo.
  select count(*) into v_n from public.aviso where de_demostracion and firmado_por is not null;
  if v_n > 0 then
    raise warning 'AVISO: % aviso(s) de demostración están firmados de antes. El candado '
                  'impide firmar de aquí en adelante, pero ésos hay que revisarlos.', v_n;
  end if;

  -- 6. Cadenas íntegras.
  select count(*) into v_n from public.cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  if v_n <> 0 then raise exception 'FALLA 6: % cadena(s) rota(s)', v_n; end if;
end $$;

select 'entorno de demostración' as bundle,
       (select string_agg(razon_social, ' · ') from public.organizations where es_demostracion)
         as marcadas,
       (select count(*)::text from public.aviso where de_demostracion)
         || ' aviso(s) de demostración' as avisos,
       (select count(*)::text from public.organizations where not es_demostracion)
         || ' organización(es) reales, sin tocar' as reales,
       '6 comprobaciones pasaron' as verificacion;

commit;
