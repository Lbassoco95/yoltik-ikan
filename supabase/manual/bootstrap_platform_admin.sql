-- =====================================================================
-- Ikán · Alta de un administrador de plataforma (Kawiil)
-- =====================================================================
-- `platform_admin` (migration 0008) es un privilegio GLOBAL que cruza
-- organizaciones. No vive en `user_roles`, que es por organización: un admin
-- de Kawiil no administra una notaría, administra la plataforma.
--
-- Sin una fila aquí, la consola de administración no deja entrar y
-- `revertir_carga_lista()` rechaza la llamada. La tabla nace vacía a
-- propósito: el privilegio se otorga a mano, nunca por registro automático.
--
-- CÓMO USARLO
--   1. Cambia el correo de abajo por el tuyo (el de auth.users).
--   2. Corre el bloque completo.
--   3. Verifica con la consulta del final.
--
-- Para revocar el privilegio:
--   delete from platform_admin where user_id = (
--     select id from auth.users where email = 'correo@kawiil.mx');
-- =====================================================================

do $$
declare
  v_email text := 'leo.bassoco@kawiil.mx';   -- ← cámbialo si es otro
  v_nombre text := 'Administrador Kawiil';   -- ← nombre para la bitácora
  v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);

  if v_uid is null then
    raise exception
      'No existe un usuario con el correo %. Créalo primero en Authentication → Users, o corrige el correo en este script.',
      v_email;
  end if;

  insert into platform_admin (user_id, nombre, otorgado_por)
  values (v_uid, v_nombre, v_uid)
  on conflict (user_id) do update set nombre = excluded.nombre;
end
$$;

-- Verificación: debe devolver una fila con tu correo.
select pa.nombre,
       u.email,
       pa.otorgado_en,
       'Ya puedes entrar a la consola de administración' as nota
from platform_admin pa
join auth.users u on u.id = pa.user_id;
