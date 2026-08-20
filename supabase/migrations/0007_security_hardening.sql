-- =====================================================================
-- Ikán · Migration 0007 · Endurecimiento de seguridad
-- =====================================================================
-- 1. search_path fijo en funciones SECURITY DEFINER (evita hijacking
--    vía search_path del caller — recomendación del linter de Supabase).
-- 2. v_user_roles_simple con security_invoker: la vista respeta el RLS
--    del usuario que consulta en lugar de correr como owner (evitaba
--    el RLS de user_profile/user_roles para cualquier usuario autenticado).
-- 3. WITH CHECK en user_profile_update_admin_or_self: sin él, un usuario
--    podía moverse a sí mismo a otra organización al editar su perfil.
-- =====================================================================

create or replace function public.current_org_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select organization_id
  from public.user_profile
  where id = auth.uid()
  limit 1
$$;

create or replace function public.has_rol(target_rol rol_usuario)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.organization_id = public.current_org_id()
      and ur.rol = target_rol
  )
$$;

alter view public.v_user_roles_simple set (security_invoker = true);

drop policy "user_profile_update_admin_or_self" on user_profile;
create policy "user_profile_update_admin_or_self" on user_profile
  for update using (
    id = auth.uid() or (organization_id = public.current_org_id() and public.has_rol('admin'))
  )
  with check (
    organization_id = public.current_org_id()
    and (id = auth.uid() or public.has_rol('admin'))
  );
