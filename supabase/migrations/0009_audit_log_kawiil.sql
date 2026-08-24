-- =====================================================================
-- Ikán · Migration 0009 · Lectura de audit_log para admins de Kawiil
-- =====================================================================
-- Cierra un hueco de la 0008: `cambiar_formato_folio()` es security definer,
-- así que un admin de Kawiil SÍ escribe en `audit_log` al cambiar el formato
-- de folio de una organización cliente con el candado cerrado — pero la
-- política de SELECT seguía siendo solo por organización, y un admin de
-- Kawiil no tiene `user_profile` (su privilegio es de plataforma, no de
-- organización), así que `current_org_id()` le devuelve null y no podía leer
-- de vuelta el rastro que él mismo generó.
--
-- Se aplica el mismo bypass que ya tienen `configuracion_folio` y
-- `folio_secuencial` en la 0008. Sigue siendo solo lectura: `audit_log` no
-- tiene política de insert/update/delete para nadie, así que la bitácora
-- únicamente la escriben funciones security definer.
-- =====================================================================

drop policy if exists "audit_select_same_org" on audit_log;
create policy "audit_select_same_org" on audit_log
  for select using (
    organization_id = public.current_org_id() or public.es_admin_kawiil()
  );
