-- =====================================================================
-- Ikán · Alta manual del usuario de la NOTARÍA DEMO (perfil notarias)
-- =====================================================================
-- Igual que el usuario maestro, pero en la organización de la notaría demo
-- (perfil_actividad='notarias'), para ver la UI "vestida" de notaría.
--
-- Requisitos: haber aplicado la migration 0006 y el seed 08 (que crea la org
-- 12121212-…). Pasos:
--   1. Authentication → Users → "Add user":  notaria@demo.mx  (Auto Confirm).
--   2. Copia su UID.
--   3. Pega el UID abajo y corre este bloque.
--
-- Alternativa automatizada: `npm run bootstrap:users` (crea también este usuario).
-- =====================================================================

do $$
declare
  v_uid_text text := 'PEGA_AQUI_EL_UID';                           -- ← UID de auth.users (paso 2)
  v_uid uuid;
  v_org uuid := '12121212-1212-1212-1212-121212121212';            -- Notaría Demo GDL (no cambiar)
begin
  if v_uid_text = 'PEGA_AQUI_EL_UID' then
    raise exception 'Falta pegar el UID real (Authentication → Users) en v_uid_text antes de correr el script.';
  end if;
  v_uid := v_uid_text::uuid;

  insert into user_profile (id, organization_id, nombre, email, activo)
  values (v_uid, v_org, 'Notaría Demo GDL', 'notaria@demo.mx', true)
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        nombre = excluded.nombre,
        email = excluded.email,
        activo = true;

  insert into user_roles (user_id, organization_id, rol)
  select v_uid, v_org, rol
  from unnest(array['oc','admin']::rol_usuario[]) as rol
  on conflict (user_id, organization_id, rol) do nothing;
end $$;

-- Verificación (debe devolver roles = {admin,oc}):
-- select up.email, up.nombre, vr.roles
-- from user_profile up join v_user_roles_simple vr on vr.user_id = up.id
-- where up.email = 'notaria@demo.mx';
