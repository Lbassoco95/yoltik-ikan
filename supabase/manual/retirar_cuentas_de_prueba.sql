-- =====================================================================
-- Ikán · Retirar las dos cuentas de prueba con dominio reservado
-- =====================================================================
-- ESTE ARCHIVO SÍ BORRA. No lo corras sin haber leído antes la salida de
-- supabase/manual/revisar_cuentas_de_prueba.sql y sin el visto bueno de Polo.
--
-- QUÉ RETIRA, Y POR QUÉ ESAS DOS Y NO OTRAS
--
--   devin-2fa-test-20260830@example.com
--   devin-notaria-2fa-test@example.com
--
-- Van por nombre EXPLÍCITO, no por patrón. Un `like '%@example.com'` habría
-- sido más corto y habría cazado cualquier cuenta futura que nadie revisó:
-- para un borrado se escribe la lista a mano y se mira una por una.
--
-- La primera es la que obliga a hacer esto. Tiene rol de admin y de oficial de
-- cumplimiento en Notaria Demo GDL, Y de oficial de cumplimiento y operador en
-- IXIM PAY: una cuenta ve datos de dos organizaciones a la vez. Su correo está
-- en example.com, reservado por los RFC 2606 y 6761 para que nadie lo pueda
-- poseer, así que no tiene dueño que la reclame ni la eche de menos.
--
-- QUÉ COMPRUEBA ANTES DE TOCAR NADA
--
--   1. Que el correo sea de dominio reservado. Si alguien edita la lista de
--      arriba y mete un correo real, esto lo para.
--   2. Que no sea administrador de plataforma.
--   3. Que no cuelgue de ella NINGUNA referencia sin cascada — nada de
--      `capturado_por`, `firmado_por`, `resuelto_por`. Si capturó un cliente o
--      firmó un aviso, esto para: eso es evidencia y no se borra.
--   4. Que no tenga eventos en la bitácora encadenada como actor.
--
-- Si cualquiera falla, la transacción entera se va atrás y no se borra nada.
-- Si una cuenta ya no existe, avisa y sigue: se puede correr dos veces.
--
-- QUÉ DEJA ESCRITO
--
-- Antes de borrar, registra un evento en la cadena de auditoría de CADA
-- organización donde la cuenta tenía rol. Quitarle a Ixim Pay un usuario con
-- rol de oficial de cumplimiento es un hecho que su bitácora tiene que poder
-- contar, aunque el usuario fuera de prueba: si sólo quedara el borrado, en su
-- cadena habría un OC que aparece y desaparece sin explicación.
--
-- El actor va como 'sistema', no como persona: esto no lo hace nadie desde la
-- aplicación, lo hace una operación de mantenimiento. Decir 'persona' con un
-- actor nulo sería más cómodo de leer y sería falso.
-- =====================================================================

begin;

do $$
declare
  v_correos text[] := array[
    'devin-2fa-test-20260830@example.com',
    'devin-notaria-2fa-test@example.com'
  ];
  v_correo  text;
  v_u       record;
  v_fk      record;
  v_org     record;
  v_n       bigint;
  v_sin_cascada bigint;
  v_borradas int := 0;
begin
  if not has_table_privilege('auth.users', 'delete') then
    raise exception 'El rol % no puede borrar de auth.users.', current_user;
  end if;

  foreach v_correo in array v_correos loop
    select u.id, u.email, coalesce(p.nombre, '(sin perfil)') as nombre
      into v_u
      from auth.users u
      left join public.user_profile p on p.id = u.id
     where lower(u.email) = lower(v_correo)
       and u.deleted_at is null;

    if not found then
      raise notice 'No existe %, nada que retirar (¿ya se corrió esto?).', v_correo;
      continue;
    end if;

    -- 1. Dominio reservado. Es el candado contra editar la lista a la ligera.
    if not (v_u.email ilike '%@example.com' or v_u.email ilike '%@example.org'
         or v_u.email ilike '%@example.net' or v_u.email ilike '%.test'
         or v_u.email ilike '%.invalid'     or v_u.email ilike '%@localhost') then
      raise exception 'ABORTA: % no es de dominio reservado. Este archivo sólo '
                      'retira cuentas sin dueño posible.', v_u.email;
    end if;

    -- 2. No es de Kawiil.
    if exists (select 1 from public.platform_admin where user_id = v_u.id) then
      raise exception 'ABORTA: % es administrador de plataforma.', v_u.email;
    end if;

    -- 3. Nada suyo sin cascada. Se recorre el catálogo en vez de una lista
    --    escrita a mano, para no perder una columna que alguien añada después.
    v_sin_cascada := 0;
    for v_fk in
      select c.conrelid::regclass::text as tabla, a.attname as columna
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        join pg_class     t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where c.contype = 'f'
         and c.confrelid = 'auth.users'::regclass
         and array_length(c.conkey, 1) = 1
         and n.nspname = 'public'
         and c.confdeltype <> 'c'
    loop
      execute format('select count(*) from %s where %I = $1', v_fk.tabla, v_fk.columna)
        into v_n using v_u.id;
      if v_n > 0 then
        v_sin_cascada := v_sin_cascada + v_n;
        raise warning 'ABORTA por %: % fila(s) en %.%',
          v_u.email, v_n, v_fk.tabla, v_fk.columna;
      end if;
    end loop;
    if v_sin_cascada > 0 then
      raise exception 'ABORTA: de % cuelgan % referencia(s) sin cascada. Eso es '
                      'trabajo hecho con esa cuenta y no se borra; desactívala.',
                      v_u.email, v_sin_cascada;
    end if;

    -- 4. Ni un evento suyo en la bitácora.
    select count(*) into v_n from public.evento_auditoria where actor_id = v_u.id;
    if v_n > 0 then
      raise exception 'ABORTA: % tiene % evento(s) en la bitácora encadenada.',
                      v_u.email, v_n;
    end if;

    -- Registrar ANTES de borrar, mientras todavía se pueden leer sus roles.
    for v_org in
      select ur.organization_id,
             string_agg(distinct ur.rol::text, ', ' order by ur.rol::text) as roles
        from public.user_roles ur
       where ur.user_id = v_u.id
       group by ur.organization_id
    loop
      perform public.registrar_evento(
        v_org.organization_id,
        'usuario_de_prueba_retirado',
        'usuario',
        v_u.id,
        jsonb_build_object(
          'usuario_email',  v_u.email,
          'usuario_nombre', v_u.nombre,
          'roles_que_tenia', v_org.roles,
          'motivo', 'Cuenta de prueba con correo en dominio reservado (RFC 2606/6761): '
                 || 'sin dueño alcanzable. No tenía ninguna referencia sin cascada.'
        ),
        'sistema',
        null
      );
    end loop;

    delete from auth.users where id = v_u.id;
    v_borradas := v_borradas + 1;
    raise notice 'Retirada: % (%)', v_u.email, v_u.nombre;
  end loop;

  raise notice '% cuenta(s) retiradas.', v_borradas;
end $$;

-- ---------------------------------------------------------------------
-- Verificación: ya no están, y las cadenas siguen íntegras
-- ---------------------------------------------------------------------
do $$
declare v_n bigint;
begin
  select count(*) into v_n from auth.users
   where deleted_at is null
     and email in ('devin-2fa-test-20260830@example.com', 'devin-notaria-2fa-test@example.com');
  if v_n > 0 then raise exception 'FALLA: quedan % cuenta(s) sin retirar', v_n; end if;

  select count(*) into v_n from public.user_profile p
   where not exists (select 1 from auth.users u where u.id = p.id);
  if v_n > 0 then raise exception 'FALLA: % perfil(es) huérfanos; la cascada no limpió', v_n; end if;

  select count(*) into v_n from public.cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  if v_n <> 0 then raise exception 'FALLA: % cadena(s) rota(s)', v_n; end if;
end $$;

select 'cuentas de prueba retiradas' as bundle,
       (select count(*) from auth.users where deleted_at is null)::text
         || ' usuarios activos ahora' as padron,
       (select count(*) from public.evento_auditoria
         where tipo = 'usuario_de_prueba_retirado')::text
         || ' evento(s) de retiro en la bitácora' as rastro,
       '3 comprobaciones pasaron' as verificacion;

commit;
