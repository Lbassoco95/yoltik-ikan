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
--   1. Corre SOLO la primera consulta (la de abajo) para ver qué correos
--      existen en Authentication → Users. El correo tiene que existir ya: este
--      script otorga un privilegio, no crea usuarios.
--   2. Cambia el correo del bloque por el que salga en esa lista.
--   3. Corre el bloque completo.
--   4. Verifica con la consulta del final.
--
--   Si el correo que quieres no aparece: Dashboard → Authentication → Users →
--   Add user, marcando "Auto Confirm User". Luego vuelve aquí.
--
-- Para revocar el privilegio:
--   delete from platform_admin where user_id = (
--     select id from auth.users where email = 'correo@kawiil.mx');
-- =====================================================================

-- PASO 1 · Qué correos existen, y cuáles ya son admin de plataforma.
select u.email,
       u.created_at,
       case when pa.user_id is null then 'no' else 'SÍ' end as ya_es_admin_plataforma
from auth.users u
left join platform_admin pa on pa.user_id = u.id
order by u.created_at;

-- PASO 2 · Otorgar el privilegio. Pon arriba el correo exacto del paso 1.
do $$
declare
  v_email text := 'lbassoco@kawiil.mx';      -- ← el correo EXACTO del paso 1
  v_nombre text := 'Administrador Kawiil';   -- ← nombre para la bitácora
  v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);

  if v_uid is null then
    raise exception
      'No existe un usuario con el correo %. Corre primero la consulta del paso 1 para ver los correos que sí existen, o créalo en Authentication → Users.',
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
