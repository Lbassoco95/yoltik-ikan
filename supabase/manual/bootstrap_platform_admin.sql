-- =====================================================================
-- Ikán · Administradores de plataforma (Kawiil)
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
--   Pega el archivo completo y córrelo. Es seguro correrlo siempre:
--     · Te dice quién tiene el privilegio hoy y qué correos existen.
--     · Si YA hay al menos un administrador, no toca nada y te lo dice.
--     · Sólo otorga cuando la tabla está vacía, o cuando pones `true` en
--       `v_forzar` para agregar a alguien más.
--
--   Nunca lanza excepción: si el correo no existe o ya hay administradores,
--   lo dice en un aviso y devuelve la tabla igual. Un script de diagnóstico no
--   debería fallar por lo que ya está bien.
--
-- Para revocar:
--   delete from platform_admin where user_id = (
--     select id from auth.users where lower(email) = lower('correo@kawiil.mx'));
-- =====================================================================

-- El SQL Editor de Supabase muestra SÓLO el resultado de la última consulta,
-- así que todo el diagnóstico sale en una sola tabla al final.

do $$
declare
  -- Correo de quien va a administrar la plataforma. Tiene que existir ya en
  -- Authentication → Users: esto otorga un privilegio, no crea usuarios.
  v_email  text := 'leo.bassoco@kawiil.mx';
  v_nombre text := 'Administrador Kawiil';
  -- Ponlo en true SÓLO para agregar a otra persona cuando ya hay admins.
  v_forzar boolean := false;
  v_uid uuid;
  v_ya  int;
begin
  select count(*) into v_ya from platform_admin;

  if v_ya > 0 and not v_forzar then
    raise notice 'Ya hay % administrador(es) de plataforma. No se tocó nada.', v_ya;
    return;
  end if;

  select id into v_uid from auth.users where lower(email) = lower(v_email);

  if v_uid is null then
    raise notice 'El correo % no existe en auth.users. Mira la tabla de abajo y usa uno de ésos, o créalo en Authentication → Users con "Auto Confirm User".', v_email;
    return;
  end if;

  insert into platform_admin (user_id, nombre, otorgado_por)
  values (v_uid, v_nombre, v_uid)
  on conflict (user_id) do update set nombre = excluded.nombre;

  raise notice 'Privilegio otorgado a %.', v_email;
end $$;

-- Resultado único: quién existe y quién entra a la consola.
select u.email,
       case when pa.user_id is null then 'no'
            else 'SÍ — entra con este correo y su contraseña de Supabase' end
         as admin_de_plataforma,
       pa.nombre,
       pa.otorgado_en,
       u.created_at as usuario_creado
from auth.users u
left join platform_admin pa on pa.user_id = u.id
order by (pa.user_id is null), u.created_at;
