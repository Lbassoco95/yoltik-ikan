-- =====================================================================
-- Ikán · Cuentas con correo de dominio reservado, y qué cuelga de ellas
-- =====================================================================
-- SÓLO LECTURA. No escribe, no borra, no desactiva. Se puede correr las veces
-- que haga falta.
--
-- POR QUÉ EXISTE ESTE ARCHIVO
--
-- En el padrón de producción aparecieron cuentas con correo @example.com,
-- creadas al probar el alta de segundo factor. Una de ellas tiene roles de
-- admin y de oficial de cumplimiento, y su segundo factor confirmado.
--
-- El problema no es que sean de prueba: es que example.com, .test, .invalid y
-- .localhost están RESERVADOS por los RFC 2606 y 6761 precisamente para que
-- nadie los pueda poseer. Eso significa que esas cuentas no tienen dueño
-- alcanzable — nadie puede recibir un correo de recuperación, nadie puede
-- reclamarlas, y nadie las va a echar de menos si alguien las usa. Una cuenta
-- con rol de admin en esa situación es una llave sin cerradura conocida.
--
-- QUÉ HACER CON LO QUE SALGA: nada todavía. Este archivo sólo dice qué hay y
-- qué se llevaría por delante quitarlas. Borrar un usuario de `auth.users`
-- arrastra en cascada su perfil y sus roles, pero las columnas que apuntan a
-- él desde el resto del sistema (`capturado_por`, `firmado_por`,
-- `resuelto_por`…) NO son en cascada, así que hay que verlas antes: si esa
-- cuenta capturó un cliente o firmó un aviso, borrarla toca evidencia.
--
-- Con la lista delante se decide entre desactivar (conserva el rastro) o
-- borrar (sólo si no cuelga nada). Esa decisión es de Polo, no de este
-- archivo.
-- =====================================================================

drop table if exists pg_temp.ikan_prueba;
create temp table ikan_prueba (
  seccion text,
  orden   int,
  cuenta  text,
  detalle text,
  cuantos text
);

do $$
declare
  v_u      record;
  v_fk     record;
  v_n      bigint;
  v_total  bigint;
  v_hay    boolean := false;
begin
  for v_u in
    select u.id, u.email, u.last_sign_in_at,
           coalesce(p.nombre, '(sin perfil)') as nombre,
           (select count(*) from auth.mfa_factors f
             where f.user_id = u.id and f.status = 'verified') as factores,
           (select string_agg(distinct ur.rol::text || ' en ' || coalesce(o.razon_social, '?'), '; ')
              from public.user_roles ur
              left join public.organizations o on o.id = ur.organization_id
             where ur.user_id = u.id) as roles,
           exists (select 1 from public.platform_admin pa where pa.user_id = u.id) as es_kawiil
      from auth.users u
      left join public.user_profile p on p.id = u.id
     where u.deleted_at is null
       -- Dominios reservados por RFC 2606 y 6761: nadie los puede poseer.
       and (   u.email ilike '%@example.com'
            or u.email ilike '%@example.org'
            or u.email ilike '%@example.net'
            or u.email ilike '%.test'
            or u.email ilike '%.invalid'
            or u.email ilike '%@localhost')
     order by u.email
  loop
    v_hay := true;

    insert into ikan_prueba values ('1 · La cuenta', 1,
      v_u.nombre || ' · ' || v_u.email,
      coalesce(v_u.roles, 'sin roles')
        || case when v_u.es_kawiil then '  ///  ES ADMIN DE PLATAFORMA' else '' end,
      v_u.factores || ' factor(es) confirmado(s); último acceso '
        || coalesce(to_char(v_u.last_sign_in_at, 'DD/MM/YYYY HH24:MI'), 'nunca'));

    -- Qué apunta a esta cuenta desde el esquema public. Se recorre el catálogo
    -- en vez de escribir la lista a mano: así no se escapa ninguna columna
    -- nueva que alguien añada después.
    v_total := 0;
    -- Se distingue la cascada del resto, y es la distinción que decide.
    -- `user_profile.id` y `user_roles.user_id` son `on delete cascade`: son la
    -- cuenta misma, se van con ella y no son evidencia de nada. Contarlas como
    -- referencias que impiden borrar era un falso positivo que empujaba a
    -- conservar basura. Lo que pesa son las columnas SIN cascada
    -- —`capturado_por`, `firmado_por`, `resuelto_por`—: ésas apuntan a trabajo
    -- hecho, y borrar la cuenta las dejaría en null o rompería el borrado.
    for v_fk in
      select c.conrelid::regclass::text as tabla,
             a.attname as columna,
             c.confdeltype = 'c' as en_cascada
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        join pg_class    t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where c.contype = 'f'
         and c.confrelid = 'auth.users'::regclass
         and array_length(c.conkey, 1) = 1
         and n.nspname = 'public'
       order by 1, 2
    loop
      execute format('select count(*) from %s where %I = $1', v_fk.tabla, v_fk.columna)
        into v_n using v_u.id;
      if v_n > 0 then
        if not v_fk.en_cascada then v_total := v_total + v_n; end if;
        insert into ikan_prueba values ('2 · Qué cuelga de ella', 2,
          v_u.email,
          v_fk.tabla || '.' || v_fk.columna
            || case when v_fk.en_cascada
                    then '   (en cascada: se va con la cuenta, no es evidencia)'
                    else '   ← SIN cascada: es trabajo hecho' end,
          v_n || ' fila(s)');
      end if;
    end loop;

    -- La bitácora encadenada no tiene llave foránea a auth.users a propósito
    -- (un rastro que desaparece con lo auditado no es un rastro), así que hay
    -- que preguntarle aparte.
    select count(*) into v_n from public.evento_auditoria where actor_id = v_u.id;
    if v_n > 0 then
      v_total := v_total + v_n;
      insert into ikan_prueba values ('2 · Qué cuelga de ella', 2,
        v_u.email, 'evento_auditoria.actor_id (bitácora: NO se puede borrar)',
        v_n || ' evento(s)');
    end if;

    insert into ikan_prueba values ('3 · Qué se puede hacer', 3,
      v_u.email,
      case
        when v_total = 0
          then 'Sólo cuelga su propia cuenta (todo en cascada): se puede borrar '
               || 'sin tocar evidencia de nadie.'
        else 'Cuelgan ' || v_total || ' referencia(s) SIN cascada, o sea trabajo '
             || 'hecho con esa cuenta. NO borrar: desactivar el perfil y quitarle '
             || 'roles y factor conserva el rastro.'
      end,
      v_total || ' referencia(s) sin cascada');
  end loop;

  if not v_hay then
    insert into ikan_prueba values ('0 · Resumen', 0, 'Ninguna cuenta con dominio reservado',
      'No hay @example.com, .test, .invalid ni @localhost en el padrón.', '');
  else
    insert into ikan_prueba values ('0 · Resumen', 0,
      (select count(distinct cuenta)::text from ikan_prueba where seccion = '1 · La cuenta')
        || ' cuenta(s) con dominio reservado',
      'Nadie puede poseer esos dominios: son cuentas sin dueño alcanzable.',
      'revisa la sección 3 para saber qué admite cada una');
  end if;
end $$;

select seccion, orden, cuenta, detalle, cuantos
from ikan_prueba
order by seccion, cuenta, detalle;
