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
