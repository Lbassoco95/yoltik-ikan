-- ============================================================
-- Chequeo previo · Los dos demos en el remoto
-- ============================================================
-- Verifica que el Supabase remoto tenga TODO lo que necesitan los dos
-- recorridos del demo:
--
--   XVI · Ixim Pay          activos virtuales, perfil genérico
--   XII · Notaría Demo GDL  fe pública, perfil notarías
--
-- Usa SQL dinámico a propósito: si una tabla no existe todavía, lo REPORTA
-- en vez de tronar. Así se puede correr sobre un remoto a medio migrar y
-- saber exactamente qué falta, que es justo cuando más se necesita.
--
-- Todo debe decir OK. Cualquier ❌ es algo que falta aplicar.
-- ============================================================

drop table if exists _chequeo_demos;
create temp table _chequeo_demos (n int, seccion text, objeto text, estado text);

do $$
declare
  v_n int := 0;
  v_txt text;
  v_num bigint;
begin
  ------------------------------------------------------------------
  -- Esquema
  ------------------------------------------------------------------
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'ESQUEMA', '── migrations aplicadas ──', '');

  -- Se comprueba tabla por tabla con to_regclass, que devuelve null si falta.
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'ESQUEMA', '   0001 · organizations',
    case when to_regclass('public.organizations') is null then '❌ falta' else 'OK' end);
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'ESQUEMA', '   0004 · client / operation',
    case when to_regclass('public.client') is null or to_regclass('public.operation') is null
         then '❌ falta' else 'OK' end);
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'ESQUEMA', '   0005 · hallazgo / tipologia_av',
    case when to_regclass('public.hallazgo') is null then '❌ falta' else 'OK' end);
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'ESQUEMA', '   0007 · expediente del hallazgo',
    case when to_regclass('public.hallazgo_documento') is null then '❌ falta' else 'OK' end);
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'ESQUEMA', '   0008 · folio + platform_admin',
    case when to_regclass('public.platform_admin') is null then '❌ falta' else 'OK' end);
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'ESQUEMA', '   0010 · matriz configurable',
    case when to_regclass('public.client_risk_template') is null then '❌ falta' else 'OK' end);
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'ESQUEMA', '   0011 · parámetros regulatorios',
    case when to_regclass('public.parametro_regulatorio') is null then '❌ falta' else 'OK' end);
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'ESQUEMA', '   0012 · listas de plataforma',
    case when to_regclass('public.lista_fuente') is null then '❌ falta' else 'OK' end);
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'ESQUEMA', '   0013 · revertir carga',
    case when not exists (select 1 from pg_proc where proname='revertir_carga_lista')
         then '❌ falta' else 'OK' end);

  ------------------------------------------------------------------
  -- Demo XVI · Ixim Pay
  ------------------------------------------------------------------
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'DEMO XVI', '── Ixim Pay · activos virtuales ──', '');

  if to_regclass('public.organizations') is not null then
    execute $q$ select razon_social from organizations
                where id = '11111111-1111-1111-1111-111111111111' $q$ into v_txt;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'DEMO XVI', '   organización',
      case when v_txt is null then '❌ no existe'
           when v_txt = 'IXIM PAY, S.A. DE C.V.' then 'OK · ' || v_txt
           else '❌ nombre viejo: ' || v_txt || ' — corre corregir_organizacion_demo.sql' end);
  end if;

  if to_regclass('public.tipologia_av') is not null then
    execute $q$ select count(*) from tipologia_av where sector = 'XVI' $q$ into v_num;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'DEMO XVI', '   tipologías',
      case when v_num >= 8 then 'OK · ' || v_num else '❌ ' || v_num || ' (se esperan 8)' end);
  end if;

  if to_regclass('public.client') is not null then
    execute $q$ select count(*) from client
                where organization_id = '11111111-1111-1111-1111-111111111111' $q$ into v_num;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'DEMO XVI', '   clientes',
      case when v_num > 0 then 'OK · ' || v_num else '❌ sin clientes' end);

    execute $q$ select count(*) from operation
                where organization_id = '11111111-1111-1111-1111-111111111111' $q$ into v_num;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'DEMO XVI', '   operaciones',
      case when v_num > 0 then 'OK · ' || v_num else '❌ sin operaciones' end);
  end if;

  if to_regclass('public.client_risk_template') is not null then
    execute $q$ select count(*) from client_risk_template
                where organization_id = '11111111-1111-1111-1111-111111111111' $q$ into v_num;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'DEMO XVI', '   plantilla de matriz',
      case when v_num > 0 then 'OK · ' || v_num else '❌ falta el seed 05' end);
  end if;

  ------------------------------------------------------------------
  -- Demo XII · Notaría
  ------------------------------------------------------------------
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'DEMO XII', '── Notaría Demo GDL · fe pública ──', '');

  if to_regclass('public.organizations') is not null then
    execute $q$ select coalesce(perfil_actividad, 'generico') from organizations
                where id = '12121212-1212-1212-1212-121212121212' $q$ into v_txt;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'DEMO XII', '   organización y perfil',
      case when v_txt is null then '❌ no existe — falta el seed 08'
           when v_txt = 'notarias' then 'OK · perfil notarias (la UI se viste de notaría)'
           else '❌ perfil = ' || v_txt || ' — la UI saldrá genérica' end);
  end if;

  if to_regclass('public.tipologia_av') is not null then
    execute $q$ select count(*) from tipologia_av where sector = 'XII' $q$ into v_num;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'DEMO XII', '   tipologías XII',
      case when v_num >= 3 then 'OK · ' || v_num else '❌ ' || v_num || ' (se esperan 3)' end);
  end if;

  if to_regclass('public.client') is not null then
    execute $q$ select count(*) from client
                where organization_id = '12121212-1212-1212-1212-121212121212' $q$ into v_num;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'DEMO XII', '   comparecientes',
      case when v_num >= 2 then 'OK · ' || v_num else '❌ ' || v_num || ' (se esperan 2)' end);

    execute $q$ select count(*) from operation
                where organization_id = '12121212-1212-1212-1212-121212121212' $q$ into v_num;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'DEMO XII', '   actos e instrumentos',
      case when v_num >= 4 then 'OK · ' || v_num else '❌ ' || v_num || ' (se esperan 4)' end);
  end if;

  if to_regclass('public.client_risk_template') is not null then
    execute $q$ select count(*) from client_risk_template
                where organization_id = '12121212-1212-1212-1212-121212121212' $q$ into v_num;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'DEMO XII', '   plantilla de matriz XII',
      case when v_num > 0 then 'OK' else '❌ falta el seed 09' end);
  end if;

  if to_regclass('public.hallazgo') is not null then
    execute $q$ select count(*) from hallazgo
                where organization_id = '12121212-1212-1212-1212-121212121212' $q$ into v_num;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'DEMO XII', '   hallazgos generados',
      case when v_num > 0 then 'OK · ' || v_num
           else 'ninguno todavía — corre el motor desde Alertas' end);
  end if;

  ------------------------------------------------------------------
  -- Usuarios
  ------------------------------------------------------------------
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'USUARIOS', '── quién puede entrar ──', '');

  if to_regclass('public.user_profile') is not null then
    for v_txt, v_num in
      execute $q$ select up.email || '  →  ' || o.razon_social ||
                         '  [' || coalesce(o.perfil_actividad, 'generico') || ']', 1
                  from user_profile up
                  join organizations o on o.id = up.organization_id
                  order by o.razon_social, up.email $q$
    loop
      v_n := v_n + 1;
      insert into _chequeo_demos values (v_n, 'USUARIOS', '   ' || v_txt, '');
    end loop;
  end if;

  if to_regclass('public.platform_admin') is not null then
    execute $q$ select count(*) from platform_admin $q$ into v_num;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'USUARIOS', '   admins de plataforma (Kawiil)',
      case when v_num > 0 then 'OK · ' || v_num else '❌ ninguno — la consola no deja entrar' end);
  end if;

  ------------------------------------------------------------------
  -- Plataforma
  ------------------------------------------------------------------
  v_n := v_n + 1;
  insert into _chequeo_demos values (v_n, 'PLATAFORMA', '── configuración común ──', '');

  if to_regclass('public.parametro_regulatorio') is not null then
    execute $q$ select public.parametro_vigente('uma_diaria') $q$ into v_txt;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'PLATAFORMA', '   UMA vigente',
      case when v_txt is null then '❌ sin UMA — el motor devuelve 422 y no corre'
           else 'OK · ' || v_txt end);
  end if;

  if to_regclass('public.lista_fuente') is not null then
    execute $q$ select count(*) from lista_fuente $q$ into v_num;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'PLATAFORMA', '   fuentes de listas',
      case when v_num >= 6 then 'OK · ' || v_num else '❌ ' || v_num || ' (se esperan 6)' end);

    execute $q$ select count(*) from lista_registro where activo $q$ into v_num;
    v_n := v_n + 1;
    insert into _chequeo_demos values (v_n, 'PLATAFORMA', '   personas listadas',
      case when v_num > 0 then 'OK · ' || v_num
           else 'ninguna todavía — se capturan en la consola' end);
  end if;
end
$$;

select seccion, objeto, estado from _chequeo_demos order by n;
