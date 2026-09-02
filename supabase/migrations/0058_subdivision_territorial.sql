-- =====================================================================
-- 0058 · La subdivisión territorial: una prohibición no cabe en un ISO2
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 4 del 01/09/2026,
-- apartado 2. Instrucciones 35, 36 y 46.
--
-- ---------------------------------------------------------------------
-- El problema, que no tiene salida por ninguna de las dos vías obvias
-- ---------------------------------------------------------------------
-- La Orden Ejecutiva 13685 cubre Crimea; la 14065 cubre Donetsk y Lugansk «o
-- las demás regiones de Ucrania que determine el Secretario del Tesoro». Son
-- prohibiciones SUBNACIONALES, y un código de país no las puede expresar.
--
-- Forzarlo falla en las dos direcciones:
--
--   · Ucrania entera en nivel 1 sobrebloquea a un país completo. Un
--     compareciente de Leópolis no tiene nada que ver con Crimea.
--   · Ucrania sólo en nivel 2 pierde justo el supuesto que la norma prohíbe: la
--     operación con la región ocupada pasa como riesgo alto y sigue adelante.
--
-- Así que la subdivisión es una DIMENSIÓN PROPIA. Ucrania se queda en nivel 2
-- como país —tiene programa territorial activo, eso es correcto— y la
-- prohibición vive en la subdivisión.
--
-- ---------------------------------------------------------------------
-- Un campo con dos usos, construido una vez
-- ---------------------------------------------------------------------
-- La misma dimensión sirve para México: entidad federativa y municipio, que es
-- lo que la instrucción 46 y las zonas de atención necesitan. Construir dos
-- mecanismos para «la parte de un país donde ocurre algo» es garantizar que se
-- desincronicen.
--
-- ---------------------------------------------------------------------
-- Obligatoria sólo donde hace falta
-- ---------------------------------------------------------------------
-- Opcional en general y OBLIGATORIA cuando el país sea Ucrania o Rusia. Pedirla
-- siempre encarece la captura sin ganancia: en la inmensa mayoría de los actos
-- la subdivisión no cambia nada, y un campo obligatorio que casi nunca importa
-- enseña a rellenarlo de cualquier manera.
-- =====================================================================

-- ---------------------------------------------------------------------
-- El catálogo de subdivisiones con riesgo
-- ---------------------------------------------------------------------
-- Sólo las que tienen nivel. No es un catálogo de todas las subdivisiones del
-- mundo: es la lista de las que cambian la calificación, y crece cuando una
-- autoridad lo determina.
create table if not exists subdivision_riesgo (
  /** ISO 3166-2 completo, con el país delante: «UA-43». Lleva el país dentro a
   *  propósito, porque «43» no identifica nada por sí solo. */
  clave text primary key check (clave ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'),
  pais_iso2 text not null check (length(pais_iso2) = 2),
  nombre text not null,
  nivel_territorial text not null
    check (nivel_territorial in ('prohibicion', 'riesgo_alto', 'atencion')),
  /** De dónde sale. Obligatoria: una subdivisión en nivel de prohibición
   *  bloquea operaciones, y eso no se sostiene sin fundamento escrito. */
  derivacion text not null check (btrim(derivacion) <> ''),
  /**
   * Si la cobertura NO se pudo confirmar contra fuente primaria.
   *
   * Jersón y Zaporiyia se cargan por prudencia —la orientación pública de OFAC
   * las trata junto con Donetsk y Lugansk— pero no se localizó la
   * determinación del Secretario del Tesoro que las incorpore formalmente. Se
   * marca en vez de omitirse: omitirlas dejaría pasar operaciones con regiones
   * ocupadas, y afirmarlas sin marca las presentaría como confirmadas.
   */
  pendiente_confirmacion boolean not null default false,
  vigente_desde date not null default current_date,
  vigente_hasta date
);

comment on table subdivision_riesgo is
  'Subdivisiones con nivel de riesgo propio (ISO 3166-2). Existe porque una '
  'prohibición subnacional no cabe en un código de país: Ucrania entera en nivel '
  '1 sobrebloquea un país completo, y sólo en nivel 2 pierde el supuesto que la '
  'norma prohíbe.';

alter table subdivision_riesgo enable row level security;
drop policy if exists "subdivision_riesgo_select" on subdivision_riesgo;
create policy "subdivision_riesgo_select" on subdivision_riesgo for select using (true);
drop policy if exists "subdivision_riesgo_write_kawiil" on subdivision_riesgo;
create policy "subdivision_riesgo_write_kawiil" on subdivision_riesgo for all
  using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());
revoke all on subdivision_riesgo from anon;
revoke insert, update, delete on subdivision_riesgo from authenticated;
grant select on subdivision_riesgo to authenticated;

-- Las seis del apartado 2.1, con su fundamento.
insert into subdivision_riesgo
  (clave, pais_iso2, nombre, nivel_territorial, derivacion, pendiente_confirmacion)
values
  ('UA-43', 'UA', 'República Autónoma de Crimea', 'prohibicion',
   'Orden Ejecutiva 13685, definida en 31 CFR § 589.306: comprende el territorio terrestre y las '
   || 'áreas marítimas sobre las que se reclame soberanía o jurisdicción con base en esa '
   || 'pretensión. Confirmada contra fuente primaria.', false),
  ('UA-40', 'UA', 'Ciudad de Sebastopol', 'prohibicion',
   'Orden Ejecutiva 13685 y 31 CFR § 589.306, como parte del territorio de Crimea. Confirmada '
   || 'contra fuente primaria.', false),
  ('UA-14', 'UA', 'Óblast de Donetsk', 'prohibicion',
   'Orden Ejecutiva 14065, que cubre las llamadas repúblicas populares de Donetsk y Lugansk. '
   || 'Confirmada contra fuente primaria.', false),
  ('UA-09', 'UA', 'Óblast de Lugansk', 'prohibicion',
   'Orden Ejecutiva 14065, que cubre las llamadas repúblicas populares de Donetsk y Lugansk. '
   || 'Confirmada contra fuente primaria.', false),
  ('UA-65', 'UA', 'Óblast de Jersón', 'prohibicion',
   'La orientación pública de OFAC la trata junto con Donetsk y Lugansk como región bajo '
   || 'ocupación, pero NO se localizó la determinación del Secretario del Tesoro que la '
   || 'incorpore formalmente como región cubierta bajo la OE 14065. Se carga por prudencia y '
   || 'queda marcada como pendiente: omitirla dejaría pasar operaciones con una región ocupada.',
   true),
  ('UA-23', 'UA', 'Óblast de Zaporiyia', 'prohibicion',
   'La orientación pública de OFAC la trata junto con Donetsk y Lugansk como región bajo '
   || 'ocupación, pero NO se localizó la determinación del Secretario del Tesoro que la '
   || 'incorpore formalmente como región cubierta bajo la OE 14065. Se carga por prudencia y '
   || 'queda marcada como pendiente: omitirla dejaría pasar operaciones con una región ocupada.',
   true)
on conflict (clave) do update
  set nivel_territorial = excluded.nivel_territorial,
      derivacion = excluded.derivacion,
      pendiente_confirmacion = excluded.pendiente_confirmacion,
      nombre = excluded.nombre;

-- ---------------------------------------------------------------------
-- Dónde se captura
-- ---------------------------------------------------------------------
-- En el domicilio del compareciente y en la ubicación del inmueble, que es lo
-- que dice el apartado 2.2.
alter table client
  add column if not exists subdivision_clave text references subdivision_riesgo(clave),
  /**
   * «Se preguntó y el domicilio está fuera de las regiones alcanzadas».
   *
   * Distinto de `subdivision_clave is null`, que es «no se ha preguntado». Sin
   * esta distinción, quien contesta «ninguna de las listadas» deja el
   * expediente con el campo vacío, el aviso sigue pidiéndolo para siempre, y un
   * aviso que no se puede quitar contestando enseña a ignorarlo —que es peor
   * que no tenerlo—.
   */
  add column if not exists subdivision_fuera_de_lista boolean not null default false;

alter table client drop constraint if exists client_subdivision_coherente;
alter table client
  add constraint client_subdivision_coherente
  check (not (subdivision_fuera_de_lista and subdivision_clave is not null));
alter table operation
  add column if not exists subdivision_inmueble text references subdivision_riesgo(clave);

comment on column client.subdivision_clave is
  'Subdivisión (ISO 3166-2) del domicilio del compareciente. Opcional en '
  'general, OBLIGATORIA cuando el país sea Ucrania o Rusia: pedirla siempre '
  'encarece la captura sin ganancia, y un campo obligatorio que casi nunca '
  'importa enseña a rellenarlo de cualquier manera.';
comment on column client.subdivision_fuera_de_lista is
  'Se preguntó y el domicilio está fuera de las regiones alcanzadas. Distinto '
  'de la columna en null, que es «no se ha preguntado»: sin la distinción, el '
  'aviso no se puede quitar contestando y eso enseña a ignorarlo.';
comment on column operation.subdivision_inmueble is
  'Subdivisión (ISO 3166-2) donde está el inmueble. La prohibición es '
  'subnacional: un inmueble en Crimea y otro en Leópolis no son el mismo acto '
  'aunque los dos estén en Ucrania.';

-- ---------------------------------------------------------------------
-- Los países que exigen subdivisión
-- ---------------------------------------------------------------------
-- En una tabla y no en un check literal: mañana el Secretario del Tesoro
-- determina otra región y la lista cambia sin migration. Un `in ('UA','RU')`
-- escrito dentro de una restricción obliga a soltarla y recrearla.
create table if not exists pais_exige_subdivision (
  pais_iso2 text primary key check (length(pais_iso2) = 2),
  motivo text not null check (btrim(motivo) <> '')
);

comment on table pais_exige_subdivision is
  'Países donde la subdivisión es obligatoria. En tabla y no en un check '
  'literal: la lista cambia por determinación de una autoridad, y un `in (...)` '
  'dentro de una restricción obliga a soltarla y recrearla para añadir uno.';

insert into pais_exige_subdivision (pais_iso2, motivo)
values
  ('UA', 'Hay regiones bajo prohibición territorial —Crimea, Sebastopol, Donetsk, Lugansk— y el '
      || 'país entero está en riesgo alto. Sin subdivisión no se puede distinguir un acto en '
      || 'Leópolis de uno en una región ocupada.'),
  ('RU', 'El programa Ukraine-/Russia-related alcanza a Rusia y a regiones cubiertas de Ucrania. '
      || 'La subdivisión es lo que permite saber cuál.')
on conflict (pais_iso2) do update set motivo = excluded.motivo;

alter table pais_exige_subdivision enable row level security;
drop policy if exists "pais_exige_subdivision_select" on pais_exige_subdivision;
create policy "pais_exige_subdivision_select" on pais_exige_subdivision for select using (true);
drop policy if exists "pais_exige_subdivision_write_kawiil" on pais_exige_subdivision;
create policy "pais_exige_subdivision_write_kawiil" on pais_exige_subdivision for all
  using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());
revoke all on pais_exige_subdivision from anon;
revoke insert, update, delete on pais_exige_subdivision from authenticated;
grant select on pais_exige_subdivision to authenticated;

-- ---------------------------------------------------------------------
-- Qué falta capturar, para que se vea en vez de pasar
-- ---------------------------------------------------------------------
-- No es un check. Un check rechazaría el alta del cliente, y eso obligaría a
-- tener el dato ANTES de poder guardar nada: en una notaría el compareciente
-- está delante y el expediente se completa en pasos. Lo correcto es dejar
-- guardar y que el pendiente sea visible y bloquee el ACTO, no la captura.
create or replace function public.subdivision_pendiente(p_client uuid)
returns table (pais text, motivo text)
language sql stable security definer set search_path = public as $$
  select p.pais_iso2, p.motivo
    from client c
    join pais_exige_subdivision p
      on p.pais_iso2 = upper(coalesce(
           case when c.tipo_persona = 'moral' then c.pais_constitucion_clave
                else c.pais_residencia_iso2 end,
           c.pais_nacionalidad_clave, ''))
   where c.id = p_client
     and coalesce(btrim(c.subdivision_clave), '') = ''
     -- Contestar «ninguna de las listadas» es una respuesta, no una omisión.
     and not c.subdivision_fuera_de_lista;
$$;

comment on function public.subdivision_pendiente(uuid) is
  'Si a este expediente le falta la subdivisión y su país la exige. No es un '
  'check porque rechazar el alta obligaría a tener el dato antes de poder '
  'guardar nada, y en una notaría el expediente se completa en pasos: se deja '
  'guardar, y el pendiente bloquea el acto, no la captura.';

revoke all on function public.subdivision_pendiente(uuid) from public, anon;
grant execute on function public.subdivision_pendiente(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- El nivel territorial de un expediente, país Y subdivisión
-- ---------------------------------------------------------------------
-- La subdivisión GANA cuando es más severa. Es todo el punto: Ucrania es riesgo
-- alto y Crimea es prohibición, y quedarse con el país perdería la prohibición.
--
-- Lo que NO hace es al revés: una subdivisión de nivel menor no rebaja el país.
-- Un óblast tranquilo dentro de un país sancionado sigue estando en un país
-- sancionado.
create or replace function public.nivel_territorial_del_expediente(p_client uuid)
returns table (nivel text, origen text, detalle text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_org       uuid;
  v_sub       text;
  v_nivel_sub text;
  v_det_sub   text;
  v_nivel_pais int;
  v_iso_pais  text;
begin
  select organization_id, subdivision_clave into v_org, v_sub from client where id = p_client;
  if v_org is null then
    return;
  end if;

  -- El país más severo de los capturados, con el entero de country_risk_list
  -- (donde MÁS ES PEOR: 3 prohibición, 2 riesgo alto, 1 atención).
  select max(c.nivel), min(c.iso2) into v_nivel_pais, v_iso_pais
    from client cl
    join country_risk_list c
      on c.organization_id = cl.organization_id
     and c.vigente_hasta is null
     and c.iso2 in (upper(coalesce(cl.pais_nacionalidad_clave, '')),
                    upper(coalesce(cl.pais_residencia_iso2, '')),
                    upper(coalesce(cl.pais_constitucion_clave, '')))
   where cl.id = p_client;

  if v_sub is not null then
    select s.nivel_territorial,
           s.nombre || case when s.pendiente_confirmacion
                            then ' (cobertura pendiente de confirmación documental)'
                            else '' end
      into v_nivel_sub, v_det_sub
      from subdivision_riesgo s
     where s.clave = v_sub and s.vigente_hasta is null;
  end if;

  -- La subdivisión gana sólo si es MÁS severa.
  if v_nivel_sub = 'prohibicion'
     or (v_nivel_sub = 'riesgo_alto' and coalesce(v_nivel_pais, 0) < 2) then
    return query select v_nivel_sub, 'subdivisión ' || v_sub, v_det_sub;
    return;
  end if;

  if v_nivel_pais is null then
    return;
  end if;

  return query select
    case v_nivel_pais when 3 then 'prohibicion' when 2 then 'riesgo_alto' else 'atencion' end,
    'país ' || v_iso_pais,
    'nivel del país capturado'::text;
end $$;

comment on function public.nivel_territorial_del_expediente(uuid) is
  'El nivel territorial mirando país Y subdivisión. La subdivisión gana cuando '
  'es más severa —Ucrania es riesgo alto y Crimea prohibición— pero nunca '
  'rebaja: un óblast tranquilo dentro de un país sancionado sigue estando en un '
  'país sancionado.';

revoke all on function public.nivel_territorial_del_expediente(uuid) from public, anon;
grant execute on function public.nivel_territorial_del_expediente(uuid) to authenticated;

do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org and tipo = 'subdivision_territorial_incorporada') then
      continue;
    end if;
    perform public.registrar_evento(
      v_org, 'subdivision_territorial_incorporada', 'subdivision_riesgo', null,
      jsonb_build_object(
        'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 4 del 01/09/2026, apartado 2. '
               || 'Instrucciones 35, 36 y 46.',
        'por_que', 'Una prohibición subnacional no cabe en un código de país. Ucrania entera en '
                || 'nivel 1 sobrebloquea un país completo; sólo en nivel 2 pierde el supuesto que '
                || 'la norma prohíbe.',
        'ucrania', 'Se queda en nivel 2 COMO PAÍS —tiene programa territorial activo— y la '
                || 'prohibición vive en la subdivisión.',
        'obligatoriedad', 'Opcional en general, obligatoria cuando el país sea Ucrania o Rusia. '
                       || 'Un campo obligatorio que casi nunca importa enseña a rellenarlo de '
                       || 'cualquier manera.',
        'pendientes', 'Jersón (UA-65) y Zaporiyia (UA-23) se cargan por prudencia y quedan '
                   || 'marcadas: la orientación pública de OFAC las trata como regiones ocupadas, '
                   || 'pero no se localizó la determinación del Secretario del Tesoro que las '
                   || 'incorpore formalmente bajo la OE 14065.',
        'no_rebaja', 'La subdivisión gana sólo cuando es MÁS severa. Un óblast tranquilo dentro '
                  || 'de un país sancionado sigue estando en un país sancionado.'
      ),
      'sistema', null
    );
  end loop;
end $$;
