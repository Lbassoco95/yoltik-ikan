-- =====================================================================
-- Manual · Alta de usuario maestro (leo.bassoco@kawiil.mx)
-- =====================================================================
-- NO es una migration ni un seed: NO lo corre `supabase db reset`. Se ejecuta
-- a mano en el SQL Editor del dashboard, UNA vez, DESPUÉS de haber creado el
-- usuario en Authentication → Users → "Add user" (con su email y contraseña).
--
-- El SQL Editor corre con rol privilegiado (bypassa RLS), así que estos inserts
-- no requieren sesión ni rol especial.
--
-- PASOS:
--   1. Dashboard → Authentication → Users → Add user
--        email: leo.bassoco@kawiil.mx  (marca "Auto Confirm User")
--   2. Copia el UID que aparece en la lista de usuarios (columna UID).
--   3. Pega ese UID abajo en v_uid (un solo lugar) y corre este script.
--   4. En el primer login, enrola 2FA TOTP (obligatorio en Ikán).
--
-- Columnas reales (migration 0001):
--   user_profile: id, organization_id, nombre, email, activo, creado_en
--     · requeridas SIN default: id, organization_id, nombre, email
--     · activo → default true ; creado_en → default now()  (no las pongas)
--   user_roles:   user_id, organization_id, rol   (+ id, otorgado_en default)
--     · rol es enum rol_usuario: 'operador' | 'oc' | 'admin'
--     · unique (user_id, organization_id, rol)
-- =====================================================================

do $$
declare
  v_uid_text text := 'PEGA_AQUI_EL_UID';                           -- ← UID de auth.users (paso 2)
  v_uid uuid;
  v_org uuid := '11111111-1111-1111-1111-111111111111';            -- Ixim Pay (no cambiar)
begin
  -- Se valida como texto ANTES de castear a uuid, para dar un mensaje claro
  -- si olvidaste pegar el UID (si casteáramos en el declare, tronaría antes).
  if v_uid_text = 'PEGA_AQUI_EL_UID' then
    raise exception 'Falta pegar el UID real (Authentication → Users) en v_uid_text antes de correr el script.';
  end if;
  v_uid := v_uid_text::uuid;

  -- Perfil (idempotente).
  insert into user_profile (id, organization_id, nombre, email, activo)
  values (v_uid, v_org, 'Leo Bassoco', 'leo.bassoco@kawiil.mx', true)
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        nombre          = excluded.nombre,
        email           = excluded.email,
        activo          = true;

  -- Los 3 roles (idempotente por el unique user_id+org+rol).
  insert into user_roles (user_id, organization_id, rol)
  select v_uid, v_org, rol
  from unnest(array['operador','oc','admin']::rol_usuario[]) as rol
  on conflict (user_id, organization_id, rol) do nothing;
end $$;

-- Verificación (debe devolver los 3 roles del usuario maestro):
select up.email, up.nombre, up.organization_id, vr.roles
from user_profile up
join v_user_roles_simple vr on vr.user_id = up.id
where up.email = 'leo.bassoco@kawiil.mx';
