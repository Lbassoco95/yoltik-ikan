-- =====================================================================
-- PASO 6 SUELTO · el OC designado, la vigencia de la aprobación y el acto
-- =====================================================================
-- Mismo contenido que `supabase/migrations/0062_oc_designado_y_aprobacion_del_acto.sql`
-- y que el paso 6 de `apply_0059_0061_por_pasos.sql`. Va aparte porque el
-- editor SQL de Supabase parte el script del lado del cliente antes de
-- mandarlo, y con un archivo largo es fácil que el corte caiga dentro del
-- cuerpo de una función: eso fue lo que produjo el
-- «relation "v_anterior" does not exist», que no venía del SQL sino del texto
-- que llegó partido.
--
-- Aquí las seis funciones llevan etiqueta de dollar-quoting con NOMBRE
-- ($designar$, $autoapro$, $vigente$, $aprobar$, $trgacto$, $sinapro$) en vez
-- de `$$` a secas, para que ningún partidor pueda confundir dónde termina un
-- cuerpo. Se ejecuta ENTERO, de una sola vez, después de los pasos 1 a 5.
--
-- No borra nada.
-- =====================================================================

-- =====================================================================
-- 0062 · El OC designado, la vigencia de la aprobación, y el acto
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 5 del 01/09/2026,
-- apartado 1, sobre el art. 23 Ter 5 de las RCG.
--
-- La 0059 dejó registrada la aprobación del expediente reforzado, pero con dos
-- huecos que sólo se ven cuando se piensa en el día siguiente:
--
--   1. La autoaprobación se calculaba con `has_rol('oc')`, es decir contra el
--      CONJUNTO de quienes hoy tengan ese rol. Si mañana se le da el rol a una
--      segunda persona, el cálculo cambia solo y sin que nadie lo decida. El
--      Oficial de Cumplimiento es una figura DESIGNADA ante la Secretaría, no
--      una inferencia de los permisos vigentes, y se registra como tal.
--
--   2. Nada ataba la aprobación al acto. El art. 23 Ter 5 exige que la
--      aprobación sea ANTES de operar, y una aprobación que no impide operar
--      sin ella es una constancia, no un control: se cumple cuando alguien se
--      acuerda. Aquí el acto de un expediente de riesgo alto no entra sin una
--      aprobación vigente.
--
-- ---------------------------------------------------------------------
-- Qué NO se inventa aquí
-- ---------------------------------------------------------------------
-- La vigencia de la aprobación NO se fija en un plazo de calendario. Se ata a
-- la evaluación sobre la que se dio: mientras esa siga siendo la vigente, la
-- aprobación cubre; en cuanto hay una evaluación posterior, deja de cubrir y
-- hay que volver a aprobar. Eso se deriva de los datos y no exige elegir un
-- número.
--
-- TODO[Sprint D-2]: si Cumplimiento quiere ADEMÁS un tope de calendario
-- —semestral, anual— es un parámetro regulatorio con su fundamento, no una
-- constante en este archivo. Preguntar antes de ponerlo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. El Oficial de Cumplimiento es designado, no inferido
-- ---------------------------------------------------------------------
alter table organizations
  add column if not exists oc_encargado_user_id uuid references auth.users(id) on delete set null,
  add column if not exists oc_designado_en timestamptz,
  add column if not exists oc_es_titular boolean not null default false;

comment on column organizations.oc_encargado_user_id is
  'Usuario designado como Oficial de Cumplimiento ante la Secretaría. La '
  'autoaprobación se calcula contra ESTE usuario y no contra el conjunto de '
  'quienes hoy tengan rol oc: si mañana se le da el rol a una segunda persona, '
  'el cálculo no debe cambiar solo.';
comment on column organizations.oc_designado_en is
  'Cuándo se registró la designación. La revisión anual puede caer cuando el OC '
  'vigente ya no es el que aprobó, y sin fecha no se sabe quién era entonces.';
comment on column organizations.oc_es_titular is
  'El Oficial de Cumplimiento es además el notario titular o el directivo '
  'único. En una organización de una sola persona la autoaprobación es la '
  'situación normal, no una anomalía: lo que cambia es el compensatorio.';

-- Designar es un acto, y queda asentado.
create or replace function public.designar_oficial_cumplimiento(
  p_org uuid,
  p_user uuid,
  p_es_titular boolean default false
)
returns void
language plpgsql security definer set search_path = public as $designar$
declare
  v_anterior uuid;
begin
  if not (public.has_rol('admin') or public.es_admin_kawiil()) then
    raise exception 'Sólo un administrador puede designar al Oficial de Cumplimiento.';
  end if;
  if p_org <> public.current_org_id() and not public.es_admin_kawiil() then
    raise exception 'Esa organización no es la tuya.';
  end if;
  if not exists (select 1 from user_roles where user_id = p_user
                   and organization_id = p_org and rol = 'oc') then
    raise exception
      'El usuario designado tiene que tener el rol de Oficial de Cumplimiento en la '
      'organización. La designación no otorga el permiso: lo hace constar.';
  end if;

  v_anterior := (select oc_encargado_user_id from organizations where id = p_org);

  update organizations
     set oc_encargado_user_id = p_user,
         oc_designado_en = now(),
         oc_es_titular = coalesce(p_es_titular, false)
   where id = p_org;

  perform public.registrar_evento(
    p_org, 'oficial_cumplimiento_designado', 'organizations', p_org,
    jsonb_build_object(
      'anterior', v_anterior,
      'nuevo', p_user,
      'es_titular', coalesce(p_es_titular, false),
      'por_que', 'El OC es una figura designada ante la Secretaría, no una inferencia de los '
              || 'roles vigentes. La autoaprobación se calcula contra esta designación para que '
              || 'dar el rol a una segunda persona no cambie el cálculo sin que nadie lo decida.'
    ),
    'persona', auth.uid()
  );
end $designar$;

revoke all on function public.designar_oficial_cumplimiento(uuid, uuid, boolean) from public, anon;
grant execute on function public.designar_oficial_cumplimiento(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 2. La autoaprobación, contra la designación
-- ---------------------------------------------------------------------
-- Sigue siendo una O y no una Y: hay autoaprobación cuando aprueba el OC
-- designado, Y TAMBIÉN cuando aprueba quien capturó el expediente aunque no sea
-- el OC. Exigir que coincidan las tres cosas dejaría fuera al titular que
-- captura y firma, que es precisamente la estructura de una notaría pequeña.
--
-- Mientras no haya designación se cae a `has_rol('oc')`, que es el
-- comportamiento anterior: quedarse sin marcar sería la dirección peligrosa,
-- porque el hueco se traduciría en expedientes que la auditoría anual deja de
-- revisar al cien por ciento.
create or replace function public.hay_autoaprobacion(
  p_org uuid,
  p_aprobador uuid,
  p_client uuid
)
returns boolean
language plpgsql stable security definer set search_path = public as $autoapro$
declare
  v_oc uuid;
begin
  v_oc := (select oc_encargado_user_id from organizations where id = p_org);

  if p_aprobador is not null
     and exists (select 1 from client c where c.id = p_client and c.capturado_por = p_aprobador)
  then
    return true;
  end if;

  if v_oc is not null then
    return p_aprobador is not null and p_aprobador = v_oc;
  end if;

  -- Sin designación, el comportamiento de la 0059.
  return public.has_rol('oc');
end $autoapro$;

comment on function public.hay_autoaprobacion(uuid, uuid, uuid) is
  'Si la aprobación la dio quien no puede ser un segundo par de ojos: el OC '
  'designado, o quien capturó el expediente. Nunca lo declara nadie.';

revoke all on function public.hay_autoaprobacion(uuid, uuid, uuid) from public, anon;
grant execute on function public.hay_autoaprobacion(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. La aprobación deja de cubrir cuando el expediente cambia
-- ---------------------------------------------------------------------
create or replace function public.expediente_reforzado_vigente(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $vigente$
  select exists (
    select 1
      from expediente_reforzado e
     where e.client_id = p_client
       and e.aprobado_en is not null
       -- Cubre mientras la evaluación sobre la que se aprobó siga siendo la
       -- vigente. Una evaluación posterior puede haber cambiado los hechos que
       -- justificaron la aprobación, y una firma no se estira sola.
       and e.evaluacion_secuencia is not distinct from (
             select max(a.secuencia) from client_risk_assessment a
              where a.client_id = p_client)
  );
$vigente$;

comment on function public.expediente_reforzado_vigente(uuid) is
  'Si la aprobación del expediente reforzado sigue cubriendo. Deja de cubrir en '
  'cuanto hay una evaluación posterior a aquella sobre la que se firmó: una '
  'aprobación no se estira sola a hechos que nadie miró al aprobar.';

revoke all on function public.expediente_reforzado_vigente(uuid) from public, anon;
grant execute on function public.expediente_reforzado_vigente(uuid) to authenticated;

-- Y `aprobar_expediente_reforzado` pasa a usar la designación.
create or replace function public.aprobar_expediente_reforzado(
  p_client uuid,
  p_calidad calidad_aprobacion,
  p_notas text default null
)
returns uuid
language plpgsql security definer set search_path = public as $aprobar$
declare
  v_org    uuid;
  v_uid    uuid := auth.uid();
  v_id     uuid;
  v_auto   boolean;
  v_seq    bigint;
  v_nivel  nivel_kyc;
  v_oc     uuid;
begin
  select organization_id, nivel_kyc into v_org, v_nivel from client where id = p_client;
  if v_org is null then
    raise exception 'El cliente % no existe.', p_client;
  end if;
  if v_org <> public.current_org_id() and not public.es_admin_kawiil() then
    raise exception 'Ese expediente no es de tu organización.';
  end if;

  -- Instrucción 51: el operador NO aprueba nunca, ni por delegación ni por
  -- ausencia del titular. Si el titular no está, el expediente espera. Un
  -- permiso que se afloja «sólo por hoy» deja de ser un control.
  if not (public.has_rol('oc') or public.has_rol('admin') or public.es_admin_kawiil()) then
    raise exception
      'Sólo el Oficial de Cumplimiento, el notario titular o un directivo designado pueden '
      'aprobar un expediente reforzado. El rol operador no aprueba, ni por ausencia del titular: '
      'si el titular no está, el expediente espera.';
  end if;

  if v_nivel <> 'N3' then
    raise warning
      'El expediente % está en nivel % y el expediente reforzado es para N3. Se registra, pero '
      'revisa si es lo que querías.', p_client, v_nivel;
  end if;

  v_auto := public.hay_autoaprobacion(v_org, v_uid, p_client);
  v_oc := (select oc_encargado_user_id from organizations where id = v_org);

  select max(a.secuencia) into v_seq
    from client_risk_assessment a where a.client_id = p_client;

  insert into expediente_reforzado
    (organization_id, client_id, aprobado_por, aprobado_en, calidad,
     autoaprobacion, evaluacion_secuencia, notas)
  values (v_org, p_client, v_uid, now(), p_calidad, v_auto, v_seq, nullif(btrim(p_notas), ''))
      on conflict (client_id) do update
     set aprobado_por = excluded.aprobado_por,
         aprobado_en = excluded.aprobado_en,
         calidad = excluded.calidad,
         autoaprobacion = excluded.autoaprobacion,
         evaluacion_secuencia = excluded.evaluacion_secuencia,
         notas = excluded.notas
  returning id into v_id;

  perform public.registrar_evento(
    v_org, 'expediente_reforzado_aprobado', 'client', p_client,
    jsonb_build_object(
      'calidad', p_calidad,
      'autoaprobacion', v_auto,
      'evaluacion_secuencia', v_seq,
      'oc_designado', v_oc,
      'fuente', 'Kawiil Mx · Adenda 5 del 01/09/2026, apartado 1. Art. 23 Ter 5 de las RCG.',
      'directivo', 'No se creó el rol «directivo»: la regla dice «o su equivalente» y en una '
                || 'notaría el equivalente es el notario titular. Inventar una jerarquía que no '
                || 'existe sería menos defendible que nombrar la que sí.',
      'designacion', case when v_oc is null
        then 'SIN OC DESIGNADO. La autoaprobación se calculó con el rol vigente, que cambia solo '
          || 'si mañana se le da el rol a otra persona. Falta designar al Oficial de '
          || 'Cumplimiento con designar_oficial_cumplimiento().'
        else 'Calculada contra el OC designado, no contra el conjunto de quienes tengan el rol.'
        end,
      'autoaprobacion_nota', case when v_auto
        then 'El aprobador coincide con el Oficial de Cumplimiento designado o con quien capturó '
          || 'el expediente. La aprobación fija responsabilidad y fecha, pero no es un segundo '
          || 'par de ojos. Compensatorio: revisión al 100 % en la auditoría del art. 18 fr. XI.'
        else 'Hay separación real entre quien capturó y quien aprobó.' end,
      'operador', 'El rol operador no puede aprobar, ni por delegación ni por ausencia del '
               || 'titular. Un permiso que se afloja «sólo por hoy» deja de ser un control.'
    ),
    'persona', v_uid
  );

  return v_id;
end $aprobar$;

-- ---------------------------------------------------------------------
-- 4. El acto no entra sin la aprobación
-- ---------------------------------------------------------------------
-- Es lo que convierte la aprobación en un control. Una aprobación que no impide
-- operar sin ella es una constancia: se cumple cuando alguien se acuerda.
alter table operation
  add column if not exists aprobacion_expediente_id uuid
    references expediente_reforzado(id) on delete set null;

comment on column operation.aprobacion_expediente_id is
  'La aprobación del expediente reforzado en la que se apoya este acto. Nula en '
  'los actos de clientes que no son de riesgo alto, donde no hace falta.';

create or replace function public.trg_operacion_exige_aprobacion() returns trigger
language plpgsql set search_path = public as $trgacto$
declare
  v_nivel nivel_kyc;
  v_apro  uuid;
begin
  v_nivel := (select nivel_kyc from client where id = new.client_id);
  if v_nivel is distinct from 'N3' then
    return new;
  end if;

  if not public.expediente_reforzado_vigente(new.client_id) then
    raise exception
      'Este compareciente está en riesgo alto (N3) y su expediente reforzado no tiene una '
      'aprobación vigente. El art. 23 Ter 5 de las RCG pide la aprobación de un directivo o su '
      'equivalente ANTES de operar, no después: el acto no se registra hasta que el notario '
      'titular, un directivo designado o el Oficial de Cumplimiento apruebe el expediente. Si ya '
      'estaba aprobado, es que hubo una evaluación posterior y hay que volver a aprobarlo sobre '
      'los hechos nuevos.'
      using errcode = 'check_violation';
  end if;

  -- Se deja anclado a CUÁL aprobación se apoyó, para que después se pueda
  -- reconstruir. Sin esto, una reaprobación posterior parecería haber cubierto
  -- un acto que en realidad se registró con otra.
  if new.aprobacion_expediente_id is null then
    v_apro := (select id from expediente_reforzado where client_id = new.client_id);
    new.aprobacion_expediente_id := v_apro;
  end if;

  return new;
end $trgacto$;

drop trigger if exists operacion_exige_aprobacion on operation;
create trigger operacion_exige_aprobacion
  before insert on operation
  for each row execute function public.trg_operacion_exige_aprobacion();

comment on function public.trg_operacion_exige_aprobacion() is
  'El acto de un compareciente N3 no entra sin aprobación vigente del expediente '
  'reforzado (art. 23 Ter 5). Sólo al INSERTAR: los actos ya registrados no se '
  'invalidan hacia atrás, porque una regla nueva no vuelve ilícito lo que era '
  'válido cuando se hizo.';

-- ---------------------------------------------------------------------
-- 5. Qué expedientes están operando sin aprobación vigente
-- ---------------------------------------------------------------------
-- Los que ya existían cuando esto entró. El disparador no los toca, y sin esta
-- lista quedarían invisibles: un control que sólo mira hacia adelante deja un
-- hueco que nadie vuelve a ver.
create or replace function public.n3_sin_aprobacion_vigente(p_org uuid default null)
returns table (client_id uuid, nombre text, actos int, motivo text)
language sql stable security definer set search_path = public as $sinapro$
  select c.id,
         c.nombre_razon_social,
         (select count(*)::int from operation o where o.client_id = c.id),
         case
           when not exists (select 1 from expediente_reforzado e where e.client_id = c.id)
             then 'Nunca se aprobó el expediente reforzado.'
           when exists (select 1 from expediente_reforzado e
                         where e.client_id = c.id and e.aprobado_en is null)
             then 'El expediente está armado pero nadie lo ha aprobado.'
           else 'La aprobación es anterior a la última evaluación: hay que volver a aprobar '
             || 'sobre los hechos nuevos.'
         end
    from client c
   where c.nivel_kyc = 'N3'
     and c.organization_id = coalesce(p_org, public.current_org_id())
     and not public.expediente_reforzado_vigente(c.id)
   order by 3 desc, 2;
$sinapro$;

comment on function public.n3_sin_aprobacion_vigente(uuid) is
  'Comparecientes de riesgo alto sin aprobación vigente, con cuántos actos '
  'llevan. El disparador sólo mira hacia adelante; sin esta lista los que ya '
  'estaban quedarían invisibles.';

revoke all on function public.n3_sin_aprobacion_vigente(uuid) from public, anon;
grant execute on function public.n3_sin_aprobacion_vigente(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- CONTROL. Esperado: columnas = 3, columna_acto = 1, fns = 4
-- ---------------------------------------------------------------------
select (select count(*) from information_schema.columns
         where table_name = 'organizations'
           and column_name in ('oc_encargado_user_id','oc_designado_en','oc_es_titular')) as columnas,
       (select count(*) from information_schema.columns
         where table_name = 'operation' and column_name = 'aprobacion_expediente_id') as columna_acto,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('designar_oficial_cumplimiento','hay_autoaprobacion',
                             'expediente_reforzado_vigente','n3_sin_aprobacion_vigente')) as fns;

-- Y quién está operando hoy en riesgo alto sin aprobación vigente. El
-- disparador sólo mira hacia adelante: esto es lo que ya estaba. Con Leopoldo
-- Bassoco Nova en N3, se espera verlo aquí hasta que se apruebe su expediente.
select o.razon_social, n.nombre, n.actos, n.motivo
  from organizations o, public.n3_sin_aprobacion_vigente(o.id) n
 order by o.razon_social, n.actos desc;
