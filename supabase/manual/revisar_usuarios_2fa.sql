-- =====================================================================
-- Ikán · ¿Quién puede entrar y quién tiene el alta de 2FA a medias?
-- =====================================================================
-- SÓLO LECTURA. No escribe, no borra, no repone nada. Pégalo completo en el
-- SQL Editor y córrelo; se puede correr las veces que haga falta.
--
-- Devuelve UNA sola tabla, a propósito: el SQL Editor de Supabase muestra
-- únicamente el resultado de la última consulta del script.
--
-- QUÉ SIGNIFICA CADA VEREDICTO
--
--   «entra normal»          tiene un factor TOTP confirmado. Nada que hacer.
--
--   «nunca entró»           no tiene factor y no tiene registro de haber
--                           iniciado sesión jamás. Es una cuenta creada y no
--                           usada. Se arregla sola: en cuanto la persona entre
--                           con su contraseña, Ikán la lleva a inscribirse.
--                           NO se le repone nada; no hay nada que reponer.
--
--   «ya entró y sigue sin   éste es el que hay que mirar. Puede ser que
--    factor»                abandonara el alta a medias, o que alguien le
--                           quitara el factor. Ojo con el matiz: GoTrue marca
--                           `last_sign_in_at` al validar la CONTRASEÑA, antes
--                           del segundo factor, así que "ya entró" incluye
--                           "llegó a la pantalla de alta y se fue". No prueba
--                           que haya usado el sistema.
--
--   «alta a medias»         empezó a inscribir un autenticador y no confirmó
--                           el código. Tampoco lo encierra: al volver a
--                           empezar, Ikán limpia el factor pendiente.
--
-- NADIE de esta lista está bloqueado por no tener factor. Un usuario sin
-- factor inicia sesión con su contraseña y se inscribe antes de ver nada.
-- Reponer el segundo factor es SÓLO para quien ya lo tenía y hoy no puede
-- usarlo (perdió el teléfono); a los demás la función los rechaza.
-- =====================================================================

drop table if exists pg_temp.ikan_usuarios;
create temp table ikan_usuarios (
  seccion    text,
  orden      int,
  quien      text,
  donde      text,
  segundo_factor text,
  veredicto  text,
  ultimo_acceso text
);

insert into ikan_usuarios
select
  '1 · Usuarios',
  case
    when r.roles_ajenos is not null then 0             -- lo más raro, hasta arriba
    when f.verificados > 0 then 3                      -- lo que está en orden, al final
    when u.last_sign_in_at is not null then 1          -- lo que hay que mirar, arriba
    else 2
  end,
  coalesce(p.nombre, '(sin perfil en user_profile)') || ' · ' || coalesce(p.email, u.email, '(sin correo)'),
  case
    when a.user_id is not null then coalesce(o.razon_social, '—') || ' [ADMIN DE PLATAFORMA]'
    else coalesce(o.razon_social, '(sin organización)')
  end
    || coalesce(' · ' || nullif(r.roles, ''), '')
    || coalesce('  ///  TAMBIÉN EN OTRA ORGANIZACIÓN: ' || r.roles_ajenos, ''),
  f.verificados || ' confirmado(s), ' || f.pendientes || ' a medias',
  case
    when r.roles_ajenos is not null           then 'REVISAR: tiene roles en más de una organización'
    when f.verificados > 0                    then 'entra normal'
    when f.pendientes  > 0                    then 'alta a medias: no confirmó el código'
    when u.last_sign_in_at is not null        then 'REVISAR: ya entró y sigue sin factor'
    else 'nunca entró: se arregla solo al entrar'
  end,
  coalesce(to_char(u.last_sign_in_at, 'DD/MM/YYYY HH24:MI'), 'nunca')
from auth.users u
left join public.user_profile  p on p.id = u.id
left join public.organizations o on o.id = p.organization_id
left join public.platform_admin a on a.user_id = u.id
-- Los roles se separan por organización a propósito.
--
-- `user_roles` es único por (user_id, organization_id, rol), así que un rol
-- REPETIDO en la lista de alguien sólo puede significar una cosa: que ese
-- usuario lo tiene en DOS organizaciones distintas. La primera versión de este
-- archivo los agregaba sin mirar la organización y los pegaba a la del perfil,
-- que es justo lo que escondía el hallazgo: salía "admin, oc, oc, operador" y
-- parecía un duplicado inofensivo.
--
-- Un usuario con roles fuera de su organización ve datos de las dos. Es el
-- patrón que cerró la 0022 a nivel de RLS; aquí se mira a nivel de padrón.
left join lateral (
  select
    string_agg(distinct ur.rol::text, ', ' order by ur.rol::text)
      filter (where ur.organization_id is not distinct from p.organization_id) as roles,
    string_agg(distinct ur.rol::text || ' en ' || coalesce(o2.razon_social, ur.organization_id::text), '; '
               order by ur.rol::text || ' en ' || coalesce(o2.razon_social, ur.organization_id::text))
      filter (where ur.organization_id is distinct from p.organization_id) as roles_ajenos
    from public.user_roles ur
    left join public.organizations o2 on o2.id = ur.organization_id
   where ur.user_id = u.id
) r on true
left join lateral (
  select count(*) filter (where mf.status = 'verified')  as verificados,
         count(*) filter (where mf.status <> 'verified') as pendientes
    from auth.mfa_factors mf where mf.user_id = u.id
) f on true
where u.deleted_at is null;

-- ---------------------------------------------------------------------
-- Lo que hay que saber sin leer la lista entera
-- ---------------------------------------------------------------------
-- El conteo de factores se saca de auth.mfa_factors, NO del veredicto.
--
-- La primera versión contaba `veredicto = 'entra normal'` y lo rotulaba «con
-- su segundo factor puesto». En cuanto el caso de roles cruzados pasó a ganarle
-- al de factor puesto en el `case`, alguien que SÍ tenía su factor dejó de
-- contarse y el resumen bajó de 2 a 1 sin que nadie hubiera perdido nada. Un
-- resumen que mide una cosa y dice otra asusta en la dirección equivocada.
insert into ikan_usuarios
select '0 · Resumen', 1,
       (select count(*) from auth.users where deleted_at is null) || ' usuarios activos',
       (select count(distinct f.user_id)
          from auth.mfa_factors f
          join auth.users u on u.id = f.user_id and u.deleted_at is null
         where f.status = 'verified') || ' con su segundo factor puesto',
       count(*) filter (where veredicto like 'REVISAR%') || ' para revisar',
       case when count(*) filter (where veredicto like 'REVISAR%') = 0
            then 'nada urgente: los pendientes se resuelven al entrar'
            -- «Para revisar» no quiere decir «sin factor»: un usuario con
            -- roles en dos organizaciones se revisa aunque su 2FA esté bien.
            else 'mira las filas que dicen REVISAR (no todas son por falta de factor)' end,
       ''
from ikan_usuarios where seccion = '1 · Usuarios';

-- Cuántos admins de Kawiil hay. Con uno solo, si esa persona pierde el
-- teléfono no queda nadie que pueda reponerle el factor y se vuelve al SQL
-- Editor: la 0028 deja de servir justo en el caso que la motivó.
insert into ikan_usuarios
select '0 · Resumen', 2,
       count(*) || ' admin(s) de plataforma',
       'son quienes pueden reponer un segundo factor',
       '',
       case when count(*) < 2
            then 'CON UNO SOLO NO HAY RED: si pierde el teléfono, nadie se lo repone'
            else 'hay más de uno; se pueden reponer entre ellos' end,
       ''
from public.platform_admin;

-- Reposiciones hechas hasta hoy. Hoy debería ser 0; a partir de aquí, cada una
-- deja su rastro y esta línea es por dónde se mira.
insert into ikan_usuarios
select '0 · Resumen', 3,
       count(*) || ' reposición(es) de segundo factor registradas',
       'en la bitácora encadenada, desde que existe la 0028',
       '',
       case when count(*) = 0 then 'ninguna todavía' else 'revisa quién y por qué' end,
       coalesce(to_char(max(registrado_en), 'DD/MM/YYYY HH24:MI'), '—')
from public.evento_auditoria where tipo = 'segundo_factor_repuesto';

select seccion, orden, quien, donde, segundo_factor, veredicto, ultimo_acceso
from ikan_usuarios
order by seccion, orden, quien;
