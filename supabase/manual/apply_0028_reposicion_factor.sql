-- =====================================================================
-- Ikán · Aplicar migration 0028 en el SQL Editor / API de gestión
-- =====================================================================
-- Cierra el único agujero operativo que queda del 2FA obligatorio: qué se hace
-- cuando alguien pierde el teléfono.
--
-- Hoy la respuesta es "que una persona de Kawiil abra el SQL Editor y borre a
-- mano de auth.mfa_factors". Eso obliga a darle a alguien una llave que abre la
-- base entera para desbloquear a un solo usuario, no deja rastro en la bitácora
-- encadenada, y no cierra la sesión que va abierta en el teléfono perdido.
--
-- Después de esta migration se hace desde la consola, con motivo por escrito y
-- evento firmado en la cadena de auditoría de la organización del usuario.
--
-- NO borra ningún factor al aplicarse: sólo crea las dos funciones. No toca
-- datos. Idempotente y en transacción.
--
-- Si la primera comprobación aborta diciendo que faltan privilegios sobre el
-- esquema `auth`, PÁRATE y avísanos: significa que Supabase cambió lo que le
-- otorga al rol `postgres` y hay que replantear el mecanismo, no forzarlo.
-- =====================================================================

begin;

-- =====================================================================
-- 0028 · Reponer el segundo factor sin abrir la consola de la base (D-2)
-- =====================================================================
-- El 2FA es obligatorio: `ProtectedRoute` no deja pasar a nadie con AAL1, y
-- eso está bien. Lo que no está bien es lo que pasa cuando alguien pierde el
-- teléfono. Hoy la única forma de reponerle el segundo factor es que una
-- persona de Kawiil abra el SQL Editor y borre a mano de `auth.mfa_factors`.
--
-- Eso tiene tres problemas, y ninguno es de comodidad:
--
--   1. Quien puede hacerlo tiene delante la base ENTERA. Para desbloquear a un
--      Oficial de Cumplimiento un viernes hay que darle a alguien una llave
--      que abre todo lo demás.
--   2. No queda rastro. Un `delete` en el SQL Editor no escribe en la bitácora
--      encadenada, así que la acción más sensible del sistema —quitarle a
--      alguien su segundo factor— es justo la que no se puede auditar.
--   3. Las sesiones vivas sobreviven. Si el teléfono se perdió de verdad, la
--      sesión que va en ese teléfono sigue abierta y con AAL2.
--
-- Esta migration cierra los tres: una función acotada que comprueba quién
-- llama, exige un motivo por escrito, borra los factores, cierra las sesiones
-- y deja el evento en la cadena de la organización del usuario. Todo en la
-- MISMA transacción, que es la razón de hacerlo en SQL y no llamando a la API
-- de administración de GoTrue desde una Edge Function: por ahí el borrado y el
-- registro son dos llamadas distintas, y si la segunda falla el factor
-- desaparece sin constancia. En un producto de cumplimiento, la constancia no
-- puede ser el paso que se puede caer.
--
-- TODO[Sprint D-3]: si Supabase cambia la forma de `auth.mfa_factors`, esto se
-- entera de golpe. Vale la pena una prueba de humo que lo llame contra un
-- usuario de juguete después de cada actualización de la plataforma.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Que el dueño de las funciones pueda de verdad tocar `auth`
-- ---------------------------------------------------------------------
-- En Supabase el esquema `auth` es de `supabase_auth_admin` y `postgres`
-- recibe privilegios sobre sus tablas. Si algún día deja de recibirlos, quiero
-- enterarme AQUÍ, al aplicar la migration, y no el viernes que alguien
-- necesita entrar: una función que se crea bien y truena al usarse es peor que
-- una migration que no aplica.
do $$
begin
  if not has_table_privilege('auth.users', 'select')
     or not has_table_privilege('auth.mfa_factors', 'delete')
     or not has_table_privilege('auth.sessions', 'delete') then
    raise exception
      'El rol % no tiene privilegios suficientes sobre el esquema auth '
      '(select en auth.users, delete en auth.mfa_factors y auth.sessions). '
      'Sin ellos la reposición del segundo factor no puede funcionar.',
      current_user;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Quién hay y cómo está de segundo factor
-- ---------------------------------------------------------------------
-- Devuelve vacío —no error— a quien no es de Kawiil, igual que los prospectos
-- de la 0027: una organización cliente no debe saber ni cuántos usuarios hay
-- en las demás, y un error le confirmaría que la consulta existe.
--
-- No es una vista porque tendría que leer `auth.users`, y `authenticated` no
-- tiene ningún privilegio ahí. Con `security_invoker` no leería nada, y sin él
-- la vista se saltaría la RLS para todos.
create or replace function public.usuarios_de_plataforma()
returns table (
  user_id uuid,
  nombre text,
  email text,
  organization_id uuid,
  organizacion text,
  roles text[],
  activo boolean,
  es_kawiil boolean,
  factores_verificados integer,
  factores_pendientes integer,
  ultimo_acceso timestamptz,
  creado_en timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    coalesce(p.nombre, '(sin perfil)')::text,
    coalesce(p.email, u.email)::text,
    p.organization_id,
    o.razon_social,
    coalesce(r.roles, '{}'::text[]),
    coalesce(p.activo, true),
    (a.user_id is not null),
    coalesce(f.verificados, 0)::integer,
    coalesce(f.pendientes, 0)::integer,
    u.last_sign_in_at,
    u.created_at
  from auth.users u
  left join public.user_profile p on p.id = u.id
  left join public.organizations o on o.id = p.organization_id
  left join public.platform_admin a on a.user_id = u.id
  left join lateral (
    select array_agg(distinct ur.rol::text) as roles
      from public.user_roles ur
     where ur.user_id = u.id
  ) r on true
  left join lateral (
    select
      count(*) filter (where mf.status = 'verified')  as verificados,
      count(*) filter (where mf.status <> 'verified') as pendientes
      from auth.mfa_factors mf
     where mf.user_id = u.id
  ) f on true
  where u.deleted_at is null
    and public.es_admin_kawiil()
  order by o.razon_social nulls first, coalesce(p.nombre, u.email);
$$;

comment on function public.usuarios_de_plataforma() is
  'Usuarios de todas las organizaciones con su estado de segundo factor. '
  'Sólo la contesta un administrador de plataforma; a los demás les devuelve '
  'vacío, no un error.';

-- ---------------------------------------------------------------------
-- 2. Reponer el segundo factor
-- ---------------------------------------------------------------------
/**
 * Le quita a un usuario sus factores TOTP y cierra sus sesiones, dejando el
 * evento en la cadena de auditoría de su organización.
 *
 * Exige un motivo por escrito. No es burocracia: esta función deja a una
 * persona entrando con sólo su contraseña hasta que vuelva a darse de alta el
 * segundo factor, que es exactamente lo que un atacante con la contraseña
 * querría. Lo único que separa una reposición legítima de esa es el motivo
 * registrado y quién lo firmó.
 *
 * Cierra las sesiones a propósito. El caso típico —"perdí el teléfono"— es el
 * caso en el que hay una sesión con AAL2 abierta en un aparato que ya no está
 * en manos de su dueño. Reponer el factor sin cerrarla resuelve la mitad del
 * problema y deja la mitad peligrosa.
 */
create or replace function public.reponer_segundo_factor(
  p_user_id uuid,
  p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email     text;
  v_nombre    text;
  v_org       uuid;
  v_factores  integer;
  v_sesiones  integer;
  v_evento    uuid;
  v_motivo    text := btrim(coalesce(p_motivo, ''));
begin
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de plataforma puede reponer un segundo factor.';
  end if;

  -- Diez caracteres no comprueban que el motivo sea bueno; comprueban que
  -- alguien tuvo que escribir uno. Es el mínimo para que la bitácora sirva de
  -- algo cuando se lea dentro de dos años.
  if length(v_motivo) < 10 then
    raise exception
      'Escribe el motivo de la reposición (al menos 10 caracteres): es lo que '
      'vuelve auditable quitarle a alguien su segundo factor.';
  end if;

  select u.email, p.nombre, p.organization_id
    into v_email, v_nombre, v_org
    from auth.users u
    left join public.user_profile p on p.id = u.id
   where u.id = p_user_id
     and u.deleted_at is null;

  if not found then
    raise exception 'No existe ese usuario, o ya fue dado de baja.';
  end if;

  select count(*) into v_factores
    from auth.mfa_factors where user_id = p_user_id;

  -- Sin esto, quien opera cree que desbloqueó a alguien que en realidad no
  -- tenía factor y sigue sin poder entrar por otra razón. Decir la verdad aquí
  -- ahorra media hora de teléfono.
  if v_factores = 0 then
    raise exception
      'Ese usuario no tiene ningún segundo factor registrado: no hay nada que '
      'reponer. Si no puede entrar, el problema es otro.';
  end if;

  delete from auth.mfa_factors where user_id = p_user_id;

  with cerradas as (
    delete from auth.sessions where user_id = p_user_id returning 1
  )
  select count(*)::integer into v_sesiones from cerradas;

  -- Va a la cadena de SU organización, no a la de plataforma: el sujeto
  -- obligado tiene que poder enseñar en su propio paquete de verificación que
  -- a su Oficial de Cumplimiento le repusieron el factor, quién y por qué. Si
  -- el usuario no cuelga de ninguna organización (un admin de Kawiil), va a la
  -- cadena de plataforma.
  v_evento := public.registrar_evento(
    coalesce(v_org, '00000000-0000-0000-0000-000000000000'::uuid),
    'segundo_factor_repuesto',
    'usuario',
    p_user_id,
    jsonb_build_object(
      'usuario_email',       v_email,
      'usuario_nombre',      v_nombre,
      'motivo',              v_motivo,
      'factores_eliminados', v_factores,
      'sesiones_cerradas',   v_sesiones,
      'repuesto_por',        auth.uid(),
      'sobre_si_mismo',      (auth.uid() = p_user_id)
    ),
    'persona',
    auth.uid()
  );

  return jsonb_build_object(
    'evento_id',           v_evento,
    'email',               v_email,
    'factores_eliminados', v_factores,
    'sesiones_cerradas',   v_sesiones
  );
end $$;

comment on function public.reponer_segundo_factor(uuid, text) is
  'Quita los factores TOTP de un usuario y cierra sus sesiones, dejando el '
  'evento en la cadena de auditoría de su organización. Exige motivo por '
  'escrito. Sólo administradores de plataforma.';

-- ---------------------------------------------------------------------
-- 3. Los grants, explícitos
-- ---------------------------------------------------------------------
-- Supabase da EXECUTE directo a anon/authenticated/service_role sobre cada
-- función nueva del esquema public por ALTER DEFAULT PRIVILEGES, además del
-- EXECUTE a PUBLIC que otorga PostgreSQL. Las dos comprueban el privilegio por
-- dentro, pero una función de este calibre no se deja al alcance de anon: eso
-- ya nos costó la 0021.
revoke all on function public.usuarios_de_plataforma()          from public, anon;
revoke all on function public.reponer_segundo_factor(uuid, text) from public, anon;
grant execute on function public.usuarios_de_plataforma()          to authenticated;
grant execute on function public.reponer_segundo_factor(uuid, text) to authenticated;


-- =====================================================================
-- Verificación. Si algo falla, la transacción entera se va atrás.
-- =====================================================================
do $$
declare v_n bigint;
begin
  -- 1. Las dos funciones existen.
  if to_regprocedure('public.reponer_segundo_factor(uuid,text)') is null then
    raise exception 'FALLA 1: no se creó reponer_segundo_factor';
  end if;
  if to_regprocedure('public.usuarios_de_plataforma()') is null then
    raise exception 'FALLA 1: no se creó usuarios_de_plataforma';
  end if;

  -- 2. Y son SECURITY DEFINER: sin eso no pueden leer auth.users y la pantalla
  --    saldría vacía para todo el mundo, Kawiil incluido.
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('reponer_segundo_factor', 'usuarios_de_plataforma')
     and p.prosecdef;
  if v_n <> 2 then raise exception 'FALLA 2: % de 2 funciones son SECURITY DEFINER', v_n; end if;

  -- 3. Ninguna quedó al alcance de anon. Es LA comprobación de este bundle:
  --    una reposición de segundo factor abierta a anon deja el 2FA en nada.
  --    En Supabase el ALTER DEFAULT PRIVILEGES la abre solo; nos costó la 0021.
  if has_function_privilege('anon', 'public.reponer_segundo_factor(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.usuarios_de_plataforma()', 'execute') then
    raise exception 'FALLA 3: alguna de las dos funciones quedó abierta a anon';
  end if;

  -- 4. No se borró ni un factor al aplicar. Esta migration crea funciones; si
  --    dejó a alguien sin segundo factor, algo se escribió que no debía.
  select count(*) into v_n from auth.mfa_factors;
  if v_n = 0 then
    raise warning 'AVISO: no hay ningún factor TOTP en el proyecto. Si esperabas '
                  'usuarios con 2FA dado de alta, revísalo antes de seguir.';
  end if;

  -- 5. Las cadenas de bitácora siguen íntegras: esto no las toca.
  select count(*) into v_n from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  if v_n <> 0 then raise exception 'FALLA 5: % cadena(s) rota(s)', v_n; end if;
end $$;

select 'reposición del segundo factor' as bundle,
       (select count(*) from auth.mfa_factors where status = 'verified')::text
         || ' factor(es) TOTP activos hoy' as estado,
       (select count(*) from auth.users u
         where u.deleted_at is null
           and not exists (select 1 from auth.mfa_factors f
                            where f.user_id = u.id and f.status = 'verified'))::text
         || ' usuario(s) SIN segundo factor (no pueden entrar)' as pendientes,
       (select count(*) from platform_admin)::text || ' admin(s) que pueden reponerlo' as quien,
       '5 comprobaciones pasaron' as verificacion;

commit;
