-- =====================================================================
-- 0053 aplicada POR PASOS
-- =====================================================================
-- Mismo contenido que `supabase/migrations/0053_regimenes_onu_ofac.sql`,
-- partido para correrlo a mano en el SQL Editor, que envuelve todo el script
-- en una sola transacción y revierte hasta el principio si algo falla a la
-- mitad.
--
--   Paso 1 · las dos tablas y sus políticas
--   Paso 2 · el cargador de la lectura del 01/09/2026
--   Paso 3 · la proyección a country_risk_list y las dos funciones de pendientes
--   Paso 4 · correr la carga y la proyección
-- =====================================================================


-- #####################################################################
-- PASO 1 · Las dos tablas
-- #####################################################################
-- ---------------------------------------------------------------------
-- Los regímenes
-- ---------------------------------------------------------------------
create table if not exists regimen_sancion (
  id uuid primary key default gen_random_uuid(),
  autoridad text not null check (autoridad in ('onu', 'ofac')),
  /** Identificador ESTABLE: número de resolución en la ONU, nombre exacto del
   *  programa en OFAC. Nunca el nombre traducido ni la posición en la lista:
   *  las dos cosas cambian sin que cambie el régimen. */
  clave text not null,
  nombre text not null,
  /** Clasificación de KAWIIL, no de la fuente. OFAC publica nombre y fecha; la
   *  distinción territorial/personal la hacemos nosotros a partir del objeto de
   *  cada programa, y así debe citarse en el Manual. */
  clase text not null check (clase in ('territorial', 'personal', 'tematico', 'mixto')),
  /** Los tres niveles del eje territorial, en texto. Ver la nota 2 de arriba:
   *  el entero de `country_risk_list` va al revés y confundirlos invertiría el
   *  riesgo sin que se note. Null en los regímenes personales y temáticos, que
   *  no producen países. */
  nivel_territorial text check (nivel_territorial in ('prohibicion', 'riesgo_alto', 'atencion')),
  /** «Program Last Updated» de OFAC. Es el campo natural para detectar
   *  movimiento sin volver a leer todo. Null en la ONU, que no lo publica así. */
  actualizado_fuente date,
  /** La versión: la fecha en que se leyó la página oficial. Las dos listas
   *  cambian sin aviso, así que una carga sin fecha de lectura no se puede
   *  explicar después. */
  leido_en date not null,
  vigente boolean not null default true,
  notas text,
  unique (autoridad, clave, leido_en)
);

comment on table regimen_sancion is
  'Regímenes de sanciones de la ONU y programas de OFAC. Catálogo GLOBAL: las '
  'listas son las mismas para todos los sujetos obligados (Dirección, 01/09/2026). '
  'La clase territorial/personal es metodología de Kawiil bajo el Cap. II Quáter '
  'de las RCG, no viene de la fuente, y así debe citarse en el Manual.';
comment on column regimen_sancion.clase is
  'Territorial alimenta la variable de país; personal alimenta el cribado de '
  'nombres. Son controles distintos: un programa de contraterrorismo no dice '
  'nada sobre ningún país, designa personas, y meterlas en una variable de país '
  'marca a quien no debe y deja de marcar a quien sí.';

-- ---------------------------------------------------------------------
-- La relación país–régimen, uno a varios
-- ---------------------------------------------------------------------
-- Instrucción 31. Un país puede estar alcanzado por varios regímenes a la vez
-- —Irán lo está por la ONU y por OFAC— y la evidencia tiene que poder mostrar
-- CUÁLES, no un booleano. Con un booleano, «Irán está sancionado» y «Irán está
-- sancionado por dos autoridades independientes» se ven igual, y no lo son.
create table if not exists regimen_pais (
  regimen_id uuid not null references regimen_sancion(id) on delete cascade,
  iso2 text not null check (length(iso2) = 2),
  nota text,
  primary key (regimen_id, iso2)
);

comment on table regimen_pais is
  'Qué jurisdicciones alcanza cada régimen. Uno a varios en los dos sentidos: '
  'un régimen puede cubrir varios países y un país puede estar bajo varios '
  'regímenes. La evidencia debe poder decir cuáles, no sí o no.';

create index if not exists idx_regimen_pais_iso2 on regimen_pais(iso2);

alter table regimen_sancion enable row level security;
alter table regimen_pais enable row level security;
drop policy if exists "regimen_sancion_select" on regimen_sancion;
create policy "regimen_sancion_select" on regimen_sancion for select using (true);
drop policy if exists "regimen_sancion_write_kawiil" on regimen_sancion;
create policy "regimen_sancion_write_kawiil" on regimen_sancion for all
  using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());
drop policy if exists "regimen_pais_select" on regimen_pais;
create policy "regimen_pais_select" on regimen_pais for select using (true);
drop policy if exists "regimen_pais_write_kawiil" on regimen_pais;
create policy "regimen_pais_write_kawiil" on regimen_pais for all
  using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());

revoke all on regimen_sancion from anon;
revoke all on regimen_pais from anon;
revoke insert, update, delete on regimen_sancion from authenticated;
revoke insert, update, delete on regimen_pais from authenticated;
grant select on regimen_sancion to authenticated;
grant select on regimen_pais to authenticated;



-- #####################################################################
-- PASO 2 · El cargador
-- #####################################################################
-- =====================================================================
-- El cargador de la lectura del 01/09/2026
-- =====================================================================
-- Idempotente por (autoridad, clave, leido_en): volver a correrlo no duplica.
-- Y falla RUIDOSAMENTE si el número de regímenes no es el esperado
-- (instrucción 32): un cambio silencioso en una lista de sanciones es el tipo
-- de error que nadie nota hasta la visita de verificación.
drop function if exists public.cargar_regimenes_2026_09();
create or replace function public.cargar_regimenes_2026_09()
-- Los nombres de salida llevan sufijo a propósito: dentro de plpgsql un
-- parámetro de salida que se llame igual que una columna hace ambigua toda
-- referencia a ella, y el error sale hasta que se ejecuta.
returns table (autoridad_leida text, regimenes int, jurisdicciones int)
language plpgsql security definer set search_path = public as $$
declare
  v_lectura   constant date := date '2026-09-01';
  v_esp_onu   constant int  := 15;   -- quince comités, dice la página
  v_esp_ofac  constant int  := 37;   -- treinta y siete programas activos
  v_id        uuid;
  v_n         int;
  v_faltan    text;
begin
  if not public.puede_provisionar() then
    raise exception 'Sólo un administrador de Kawiil puede cargar regímenes de sanciones.';
  end if;

  -- -----------------------------------------------------------------
  -- ONU · los 15 comités del Consejo de Seguridad
  -- -----------------------------------------------------------------
  -- La clave es el NÚMERO DE RESOLUCIÓN, que es el identificador estable. Los
  -- nombres de los comités cambian de forma; las resoluciones no.
  insert into regimen_sancion (autoridad, clave, nombre, clase, nivel_territorial, leido_en, notas)
  values
    ('onu', '2713', 'Al-Shabaab Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    -- No tiene país: designa personas y entidades asociadas a ISIL y Al-Qaida
    -- en cualquier jurisdicción. No debe alimentar la variable de país.
    ('onu', '1267', 'ISIL (Da''esh) & Al-Qaida Sanctions Committee', 'tematico', null, v_lectura,
     'Designa personas y entidades en cualquier jurisdicción. No produce países: va al cribado de nombres.'),
    ('onu', '1518', '1518 Sanctions Committee (Iraq)', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '1533', 'The Democratic Republic of Congo Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '1591', 'The Sudan Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    -- Régimen de designación individual sin designados actuales. Se incluye por
    -- completitud; conviene distinguirlo de los que tienen medidas territoriales
    -- activas, y por eso lo dice su nota.
    ('onu', '1636', '1636 Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura,
     'Nace de la investigación del atentado contra Rafiq Hariri. Designación individual sin designados actuales.'),
    ('onu', '1718', '1718 Sanctions Committee (DPRK)', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '1737', '1737 Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '1970', 'Libya Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    -- Designa personas asociadas al Talibán. Es defendible mapearlo a
    -- Afganistán para la variable de país y OBLIGATORIO tratarlo como lista de
    -- personas. Se hacen las dos cosas y se marca mixto.
    ('onu', '1988', '1988 Sanctions Committee', 'mixto', 'riesgo_alto', v_lectura,
     'Designa personas asociadas al Talibán. Alimenta la variable de país (Afganistán) Y el cribado de nombres.'),
    ('onu', '2048', 'Guinea-Bissau Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '2140', '2140 Sanctions Committee (Yemen)', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '2206', 'South Sudan Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '2653', '2653 Sanctions Committee (Haiti)', 'territorial', 'riesgo_alto', v_lectura, null),
    -- No lleva el país en el nombre; su página de medidas confirma que se
    -- refiere a la República Centroafricana.
    ('onu', '2745', '2745 Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura,
     'El nombre no lleva el país. Su página de medidas confirma que se refiere a la República Centroafricana.')
  on conflict (autoridad, clave, leido_en) do nothing;

  -- Las catorce jurisdicciones de la ONU, por resolución.
  insert into regimen_pais (regimen_id, iso2)
  select r.id, m.iso2
    from (values
      ('2713', 'SO'), ('1518', 'IQ'), ('1533', 'CD'), ('1591', 'SD'),
      ('1636', 'LB'), ('1718', 'KP'), ('1737', 'IR'), ('1970', 'LY'),
      ('1988', 'AF'), ('2048', 'GW'), ('2140', 'YE'), ('2206', 'SS'),
      ('2653', 'HT'), ('2745', 'CF')
    ) as m(clave, iso2)
    join regimen_sancion r
      on r.autoridad = 'onu' and r.clave = m.clave and r.leido_en = v_lectura
      on conflict do nothing;

  -- -----------------------------------------------------------------
  -- OFAC · los 37 programas activos
  -- -----------------------------------------------------------------
  -- La clave es el NOMBRE EXACTO del programa, que es lo que OFAC publica de
  -- forma estable. `actualizado_fuente` es su «Program Last Updated».
  --
  -- La columna `clase` NO es de OFAC. OFAC dice expresamente que no mantiene
  -- una lista de países; la separación territorial/personal la hace Kawiil a
  -- partir del objeto de cada programa. Veinticuatro territoriales y trece
  -- personales.
  insert into regimen_sancion (autoridad, clave, nombre, clase, nivel_territorial, actualizado_fuente, leido_en, notas)
  values
    ('ofac', 'Afghanistan-Related Sanctions', 'Afghanistan-Related Sanctions', 'territorial', 'riesgo_alto', date '2022-02-25', v_lectura, null),
    -- Territorial, pero su vinculación son «Balcanes occidentales», que no es
    -- un país. Qué jurisdicciones lo componen no lo dice la adenda, y elegirlas
    -- por mi cuenta sería inventar metodología. Se carga SIN países.
    ('ofac', 'Balkans-Related Sanctions', 'Balkans-Related Sanctions', 'territorial', 'riesgo_alto', date '2025-11-20', v_lectura,
     'PENDIENTE: «Balcanes occidentales» no es un país. Falta que Cumplimiento diga qué jurisdicciones lo componen.'),
    ('ofac', 'Belarus Sanctions', 'Belarus Sanctions', 'territorial', 'riesgo_alto', date '2026-07-23', v_lectura, null),
    ('ofac', 'Burma-Related Sanctions', 'Burma-Related Sanctions', 'territorial', 'riesgo_alto', date '2026-05-28', v_lectura, null),
    ('ofac', 'Central African Republic Sanctions', 'Central African Republic Sanctions', 'territorial', 'riesgo_alto', date '2023-12-08', v_lectura, null),
    ('ofac', 'Chinese Military Companies Sanctions', 'Chinese Military Companies Sanctions', 'personal', null, date '2022-06-01', v_lectura,
     'Lista de empresas, no de jurisdicción. No produce países.'),
    ('ofac', 'Counter Narcotics Trafficking Sanctions', 'Counter Narcotics Trafficking Sanctions', 'personal', null, date '2026-08-20', v_lectura, null),
    ('ofac', 'Counter Terrorism Sanctions', 'Counter Terrorism Sanctions', 'personal', null, date '2026-08-28', v_lectura, null),
    ('ofac', 'Countering America''s Adversaries Through Sanctions Act-Related', 'Countering America''s Adversaries Through Sanctions Act-Related', 'personal', null, date '2026-02-24', v_lectura, null),
    ('ofac', 'Cuba Sanctions', 'Cuba Sanctions', 'territorial', 'prohibicion', date '2026-08-20', v_lectura,
     'Nivel 1: la propia OFAC cita a Cuba como ejemplo de programa «broad-based and oriented geographically».'),
    ('ofac', 'Cyber-Related Sanctions', 'Cyber-Related Sanctions', 'personal', null, date '2026-08-24', v_lectura, null),
    ('ofac', 'Democratic Republic of the Congo-Related Sanctions', 'Democratic Republic of the Congo-Related Sanctions', 'territorial', 'riesgo_alto', date '2026-07-10', v_lectura, null),
    ('ofac', 'Ethiopia-Related Sanctions', 'Ethiopia-Related Sanctions', 'territorial', 'riesgo_alto', date '2022-02-08', v_lectura, null),
    ('ofac', 'Foreign Interference in a United States Election Sanctions', 'Foreign Interference in a United States Election Sanctions', 'personal', null, date '2024-12-31', v_lectura, null),
    ('ofac', 'Global Magnitsky Sanctions', 'Global Magnitsky Sanctions', 'personal', null, date '2026-05-28', v_lectura, null),
    ('ofac', 'Hong Kong-Related Sanctions', 'Hong Kong-Related Sanctions', 'territorial', 'riesgo_alto', date '2026-07-17', v_lectura, null),
    ('ofac', 'Hostages and Wrongfully Detained U.S. Nationals Sanctions', 'Hostages and Wrongfully Detained U.S. Nationals Sanctions', 'personal', null, date '2025-03-25', v_lectura, null),
    ('ofac', 'International Criminal Court-Related Sanctions', 'International Criminal Court-Related Sanctions', 'personal', null, date '2026-08-18', v_lectura, null),
    ('ofac', 'Iran Sanctions', 'Iran Sanctions', 'territorial', 'prohibicion', date '2026-08-28', v_lectura,
     'Nivel 1: la propia OFAC cita a Irán como ejemplo de programa «broad-based and oriented geographically».'),
    ('ofac', 'Iraq-Related Sanctions', 'Iraq-Related Sanctions', 'territorial', 'riesgo_alto', date '2025-07-09', v_lectura, null),
    ('ofac', 'Lebanon-Related Sanctions', 'Lebanon-Related Sanctions', 'territorial', 'riesgo_alto', date '2026-02-27', v_lectura, null),
    ('ofac', 'Libya Sanctions', 'Libya Sanctions', 'territorial', 'riesgo_alto', date '2026-05-28', v_lectura, null),
    ('ofac', 'Magnitsky Sanctions', 'Magnitsky Sanctions', 'personal', null, date '2023-08-17', v_lectura,
     'De origen ruso, pero designa personas. No produce país.'),
    ('ofac', 'Mali-Related Sanctions', 'Mali-Related Sanctions', 'territorial', 'riesgo_alto', date '2026-05-28', v_lectura,
     'El régimen de la ONU sobre Malí terminó en 2023; el programa de OFAC sigue activo. Son fuentes independientes.'),
    ('ofac', 'Nicaragua-related Sanctions', 'Nicaragua-related Sanctions', 'territorial', 'riesgo_alto', date '2026-04-16', v_lectura, null),
    ('ofac', 'Non-Proliferation Sanctions', 'Non-Proliferation Sanctions', 'personal', null, date '2026-08-24', v_lectura, null),
    ('ofac', 'North Korea Sanctions', 'North Korea Sanctions', 'territorial', 'prohibicion', date '2026-03-12', v_lectura,
     'Nivel 1 por embargo amplio y territorial.'),
    -- Instrucción 33: pendiente confirmar el alcance tras la sustitución del
    -- programa. Entra como riesgo alto —lo que su programa territorial activo
    -- sostiene hoy— y NO como prohibición, que es justo lo que está por
    -- confirmarse. Suponer el nivel más severo sin haberlo verificado sería
    -- inventar en la dirección contraria.
    ('ofac', 'Promoting Accountability for Assad and Regional Stabilization (PAARSS)', 'Promoting Accountability for Assad and Regional Stabilization (PAARSS)', 'territorial', 'riesgo_alto', date '2026-08-24', v_lectura,
     'PENDIENTE (instrucción 33): confirmar el alcance de Siria tras sustituir Syria Sanctions por PAARSS antes de asignarle nivel 1.'),
    ('ofac', 'Rough Diamond Trade Controls', 'Rough Diamond Trade Controls', 'personal', null, date '2018-06-18', v_lectura, null),
    ('ofac', 'Russian Harmful Foreign Activities Sanctions', 'Russian Harmful Foreign Activities Sanctions', 'territorial', 'riesgo_alto', date '2026-08-26', v_lectura, null),
    ('ofac', 'Somalia Sanctions', 'Somalia Sanctions', 'territorial', 'riesgo_alto', date '2023-05-24', v_lectura, null),
    ('ofac', 'South Sudan-Related Sanctions', 'South Sudan-Related Sanctions', 'territorial', 'riesgo_alto', date '2023-12-08', v_lectura, null),
    ('ofac', 'Sudan and Darfur Sanctions', 'Sudan and Darfur Sanctions', 'territorial', 'riesgo_alto', date '2026-06-26', v_lectura, null),
    ('ofac', 'Transnational Criminal Organizations', 'Transnational Criminal Organizations', 'personal', null, date '2026-06-23', v_lectura, null),
    -- La adenda lo vincula a «Ucrania y Rusia» y lo cuenta entre los 24
    -- territoriales de nivel 2. El nivel 1 alcanza sólo a «las regiones
    -- cubiertas de Ucrania», no al país entero, y esa distinción territorial no
    -- se puede expresar con un ISO2: queda anotada aquí y pendiente de que
    -- Cumplimiento diga cómo capturarla.
    ('ofac', 'Ukraine-/Russia-related Sanctions', 'Ukraine-/Russia-related Sanctions', 'territorial', 'riesgo_alto', date '2026-05-08', v_lectura,
     'El nivel 1 alcanza sólo las regiones cubiertas de Ucrania, no el país entero. Un ISO2 no distingue regiones; pendiente de criterio.'),
    ('ofac', 'Venezuela-Related Sanctions', 'Venezuela-Related Sanctions', 'territorial', 'riesgo_alto', date '2026-08-27', v_lectura, null),
    ('ofac', 'Yemen-related Sanctions', 'Yemen-related Sanctions', 'territorial', 'riesgo_alto', date '2021-11-18', v_lectura, null)
  on conflict (autoridad, clave, leido_en) do nothing;

  -- Las jurisdicciones de los programas territoriales de OFAC.
  -- «Balkans-Related» no aparece: no se sabe qué países lo componen.
  insert into regimen_pais (regimen_id, iso2)
  select r.id, m.iso2
    from (values
      ('Afghanistan-Related Sanctions', 'AF'),
      ('Belarus Sanctions', 'BY'),
      ('Burma-Related Sanctions', 'MM'),
      ('Central African Republic Sanctions', 'CF'),
      ('Cuba Sanctions', 'CU'),
      ('Democratic Republic of the Congo-Related Sanctions', 'CD'),
      ('Ethiopia-Related Sanctions', 'ET'),
      ('Hong Kong-Related Sanctions', 'HK'),
      ('Iran Sanctions', 'IR'),
      ('Iraq-Related Sanctions', 'IQ'),
      ('Lebanon-Related Sanctions', 'LB'),
      ('Libya Sanctions', 'LY'),
      ('Mali-Related Sanctions', 'ML'),
      ('Nicaragua-related Sanctions', 'NI'),
      ('North Korea Sanctions', 'KP'),
      ('Promoting Accountability for Assad and Regional Stabilization (PAARSS)', 'SY'),
      ('Russian Harmful Foreign Activities Sanctions', 'RU'),
      ('Somalia Sanctions', 'SO'),
      ('South Sudan-Related Sanctions', 'SS'),
      ('Sudan and Darfur Sanctions', 'SD'),
      ('Ukraine-/Russia-related Sanctions', 'UA'),
      ('Ukraine-/Russia-related Sanctions', 'RU'),
      ('Venezuela-Related Sanctions', 'VE'),
      ('Yemen-related Sanctions', 'YE')
    ) as m(clave, iso2)
    join regimen_sancion r
      on r.autoridad = 'ofac' and r.clave = m.clave and r.leido_en = v_lectura
      on conflict do nothing;

  -- -----------------------------------------------------------------
  -- Que falle ruidosamente (instrucción 32)
  -- -----------------------------------------------------------------
  select count(*) into v_n from regimen_sancion
   where autoridad = 'onu' and leido_en = v_lectura;
  if v_n <> v_esp_onu then
    raise exception 'La ONU debía tener % regímenes en la lectura del % y hay %. Un cambio en una lista de sanciones no puede pasar en silencio.',
      v_esp_onu, v_lectura, v_n;
  end if;

  select count(*) into v_n from regimen_sancion
   where autoridad = 'ofac' and leido_en = v_lectura;
  if v_n <> v_esp_ofac then
    raise exception 'OFAC debía tener % programas en la lectura del % y hay %. Un cambio en una lista de sanciones no puede pasar en silencio.',
      v_esp_ofac, v_lectura, v_n;
  end if;

  -- Y que ningún ISO2 se haya escrito mal. Un país que no está en el catálogo
  -- de la UIF no lo va a poder cruzar nadie: la fila existiría, no marcaría a
  -- nadie nunca, y el conteo saldría en verde.
  --
  -- HUECO CONOCIDO Y DECLARADO: 'SS'. El catálogo de países de la UIF que usa
  -- el layout de fe pública tiene 249 valores y NO incluye Sudán del Sur, que
  -- es independiente desde 2011. La consecuencia va más allá de las sanciones:
  -- hoy un compareciente de Sudán del Sur no se puede capturar con su clave de
  -- país, así que la fila de sanciones que se carga aquí no va a cruzar con
  -- nadie hasta que el catálogo lo incluya.
  --
  -- Se declara en vez de quitarlo. Quitar la fila haría desaparecer el hueco de
  -- la vista y dejaría la resolución 2206 sin jurisdicción, que es peor: el
  -- régimen existe, el país existe, y lo que falta es el catálogo.
  select string_agg(distinct rp.iso2, ', ') into v_faltan
    from regimen_pais rp
    join regimen_sancion r on r.id = rp.regimen_id and r.leido_en = v_lectura
   where rp.iso2 <> 'SS'
     and not exists (
     select 1 from catalogo_valor cv
       join catalogo_sat c on c.id = cv.catalogo_id and c.codigo = 'pais'
      where cv.clave = rp.iso2 and cv.vigente_hasta is null);
  if v_faltan is not null then
    raise exception 'Estos códigos de país no están en el catálogo de la UIF y no cruzarían con nada: %', v_faltan;
  end if;

  return query
    select r.autoridad,
           count(distinct r.id)::int,
           count(distinct rp.iso2)::int
      from regimen_sancion r
      left join regimen_pais rp on rp.regimen_id = r.id
     where r.leido_en = v_lectura
     group by r.autoridad
     order by r.autoridad;
end $$;

comment on function public.cargar_regimenes_2026_09() is
  'Carga la lectura del 01/09/2026 de las páginas oficiales del Consejo de '
  'Seguridad y de OFAC. Idempotente. Falla ruidosamente si el número de '
  'regímenes cambia o si un ISO2 no está en el catálogo de la UIF: una fila con '
  'un código mal escrito existiría, no marcaría a nadie nunca, y el conteo '
  'saldría en verde.';

revoke all on function public.cargar_regimenes_2026_09() from public, anon, authenticated;
grant execute on function public.cargar_regimenes_2026_09() to authenticated;



-- #####################################################################
-- PASO 3 · La proyección y los pendientes
-- #####################################################################
-- =====================================================================
-- Proyectar los regímenes territoriales a `country_risk_list`
-- =====================================================================
-- Instrucción 29: sustituir el país que tenía la notaría y los seis de Ixim Pay
-- por la unión de ambas fuentes. La unión da del orden de treinta
-- jurisdicciones, que es un orden de magnitud distinto de uno o de seis.
--
-- Lo viejo NO se borra: se cierra con `vigente_hasta`. Los expedientes que se
-- calificaron con esas filas tienen que poder explicarse, y una fila borrada no
-- explica nada. Es la misma regla que el snapshot del GAFI.
--
-- Sólo los TERRITORIALES y los MIXTOS. Los personales y los temáticos no
-- producen países: van al cribado de nombres, que es otra tabla y otro control.
drop function if exists public.proyectar_sanciones_a_paises(date);
create or replace function public.proyectar_sanciones_a_paises(
  p_lectura date default date '2026-09-01'
)
returns table (organizacion text, lista text, altas int, cerradas int)
language plpgsql security definer set search_path = public as $$
declare
  v_org       uuid;
  v_nombre    text;
  v_fuente    fuente_lista;
  v_autoridad text;
  v_altas     int;
  v_cerradas  int;
begin
  if not public.puede_provisionar() then
    raise exception 'Sólo un administrador de Kawiil puede proyectar las listas de sanciones.';
  end if;

  if not exists (select 1 from regimen_sancion where leido_en = p_lectura) then
    raise exception 'No hay regímenes cargados con fecha de lectura %. Corre primero el cargador.', p_lectura;
  end if;

  for v_org, v_nombre in select id, razon_social from organizations order by razon_social loop
    foreach v_autoridad in array array['onu', 'ofac'] loop
      v_fuente := case v_autoridad when 'onu' then 'onu'::fuente_lista
                                   else 'ofac_sancionado'::fuente_lista end;

      -- Cerrar lo que ya no está. No se borra: un expediente calificado contra
      -- una lista tiene que poder explicarse después.
      update country_risk_list c
         set vigente_hasta = p_lectura
       where c.organization_id = v_org
         and c.fuente = v_fuente
         and c.vigente_hasta is null
         and c.vigente_desde < p_lectura;
      get diagnostics v_cerradas = row_count;

      -- Y poner la unión de los regímenes territoriales y mixtos.
      --
      -- `nivel` es el ENTERO de country_risk_list, donde más es peor: 3 para
      -- una prohibición, 2 para riesgo alto. NO es el nivel de la Adenda 3, que
      -- va al revés; la traducción se hace aquí y en un solo sitio.
      insert into country_risk_list
        (organization_id, iso2, nombre, nivel, fuente, vigente_desde, plenario, notas)
      select v_org,
             rp.iso2,
             coalesce(cv.descripcion, rp.iso2),
             case when bool_or(r.nivel_territorial = 'prohibicion') then 3 else 2 end,
             v_fuente,
             p_lectura,
             'lectura ' || to_char(p_lectura, 'DD/MM/YYYY'),
             -- Qué regímenes lo alcanzan, no un booleano: la evidencia tiene que
             -- poder decir cuáles.
             string_agg(r.clave, ', ' order by r.clave)
        from regimen_sancion r
        join regimen_pais rp on rp.regimen_id = r.id
        left join catalogo_valor cv
               on cv.clave = rp.iso2 and cv.vigente_hasta is null
              and cv.catalogo_id = (select id from catalogo_sat where codigo = 'pais')
       where r.leido_en = p_lectura
         and r.autoridad = v_autoridad
         and r.vigente
         and r.clase in ('territorial', 'mixto')
       group by rp.iso2, cv.descripcion
          on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;
      get diagnostics v_altas = row_count;

      organizacion := v_nombre;
      lista := v_autoridad;
      altas := v_altas;
      cerradas := v_cerradas;
      return next;
    end loop;

    perform public.registrar_evento(
      v_org, 'sanciones_proyectadas', 'country_risk_list', null,
      jsonb_build_object(
        'lectura', p_lectura,
        'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 3 del 01/09/2026, leída de las '
               || 'páginas oficiales del Consejo de Seguridad y de OFAC el 01/09/2026.',
        'criterio', 'Sólo los regímenes territoriales y mixtos. Los personales no producen '
                 || 'países: un programa de contraterrorismo designa personas, y meterlas en '
                 || 'una variable de país marca a quien no debe y deja de marcar a quien sí.',
        'clasificacion', 'La separación territorial/personal es metodología de Kawiil bajo el '
                      || 'Cap. II Quáter de las RCG. OFAC dice expresamente que no mantiene una '
                      || 'lista de países, así que ninguna cifra es autoritativa y ésta hay que '
                      || 'poder derivarla.',
        'peso', 'Las resoluciones del Consejo de Seguridad vinculan a México y su omisión es '
             || 'difícilmente defendible. OFAC es derecho extranjero: un fedatario mexicano no '
             || 'es U.S. person. Se carga por exposición a sanciones secundarias y valor '
             || 'indiciario, no como ley aplicable.',
        'no_borrado', 'Las filas anteriores se cerraron con vigente_hasta, no se borraron: los '
                   || 'expedientes calificados contra ellas tienen que poder explicarse.'
      ),
      'persona', auth.uid()
    );
  end loop;
end $$;

comment on function public.proyectar_sanciones_a_paises(date) is
  'Lleva los regímenes territoriales y mixtos a country_risk_list, por '
  'organización. Cierra lo anterior con vigente_hasta en vez de borrarlo. Los '
  'regímenes personales y temáticos no se proyectan: no producen países.';

revoke all on function public.proyectar_sanciones_a_paises(date) from public, anon, authenticated;
grant execute on function public.proyectar_sanciones_a_paises(date) to authenticated;

-- ---------------------------------------------------------------------
-- Lo que queda pendiente, a la vista
-- ---------------------------------------------------------------------
drop function if exists public.regimenes_sin_jurisdiccion(date);
create or replace function public.regimenes_sin_jurisdiccion(
  p_lectura date default date '2026-09-01'
)
returns table (autoridad text, clave text, nota text)
language sql stable security definer set search_path = public as $$
  select r.autoridad, r.clave, r.notas
    from regimen_sancion r
   where r.leido_en = p_lectura
     and r.vigente
     and r.clase in ('territorial', 'mixto')
     and not exists (select 1 from regimen_pais rp where rp.regimen_id = r.id)
   order by r.autoridad, r.clave;
$$;

comment on function public.regimenes_sin_jurisdiccion(date) is
  'Regímenes territoriales cargados sin país. Hoy sólo Balkans-Related: '
  '«Balcanes occidentales» no es una jurisdicción y elegir sus países por cuenta '
  'propia sería inventar metodología. Un régimen territorial sin país no marca a '
  'nadie, así que tiene que estar a la vista y no enterrado en una tabla.';

revoke all on function public.regimenes_sin_jurisdiccion(date) from public, anon;
grant execute on function public.regimenes_sin_jurisdiccion(date) to authenticated;

-- ---------------------------------------------------------------------
-- Países sancionados que el catálogo de la UIF no puede capturar
-- ---------------------------------------------------------------------
-- Hoy sólo Sudán del Sur. La fila de sanciones existe y es correcta; lo que no
-- existe es la clave de país con la que capturar a un compareciente de ahí, así
-- que la fila no cruza con nadie. Es un hueco del catálogo del layout, no de la
-- carga, y arreglarlo es de Cumplimiento con el SAT.
--
-- Va en una función y no en un comentario porque un hueco que sólo vive en un
-- comentario del código no lo ve nadie que no esté leyendo esa migration.
create or replace function public.paises_sancionados_sin_catalogo(
  p_lectura date default date '2026-09-01'
)
returns table (iso2 text, regimenes text)
language sql stable security definer set search_path = public as $$
  select rp.iso2, string_agg(distinct r.autoridad || ' ' || r.clave, ', ')
    from regimen_pais rp
    join regimen_sancion r on r.id = rp.regimen_id
   where r.leido_en = p_lectura and r.vigente
     and not exists (
       select 1 from catalogo_valor cv
         join catalogo_sat c on c.id = cv.catalogo_id and c.codigo = 'pais'
        where cv.clave = rp.iso2 and cv.vigente_hasta is null)
   group by rp.iso2
   order by rp.iso2;
$$;

comment on function public.paises_sancionados_sin_catalogo(date) is
  'Países bajo régimen de sanciones que el catálogo de países de la UIF no '
  'incluye. Su fila de riesgo existe y es correcta, pero no cruza con nadie '
  'porque no hay clave con la que capturar a un compareciente de ahí. Es un '
  'hueco del catálogo del layout, no de la carga.';

revoke all on function public.paises_sancionados_sin_catalogo(date) from public, anon;
grant execute on function public.paises_sancionados_sin_catalogo(date) to authenticated;


-- #####################################################################
-- PASO 4 · Correr la carga y la proyección
-- #####################################################################
-- Esperado: onu 15 regímenes / 14 jurisdicciones, ofac 37 / 23.
select * from public.cargar_regimenes_2026_09();

-- Esperado: 14 altas de onu y ~23 de ofac por organización, y las filas
-- anteriores cerradas (no borradas).
select * from public.proyectar_sanciones_a_paises();

-- La unión sin duplicar, por organización. Esperado: 25.
select o.razon_social,
       count(distinct c.iso2) as jurisdicciones_sancionadas
  from organizations o
  join country_risk_list c
    on c.organization_id = o.id and c.vigente_hasta is null
   and c.fuente in ('onu', 'ofac_sancionado')
 group by o.razon_social
 order by 1;

-- Lo que queda pendiente de Cumplimiento, a la vista.
select * from public.regimenes_sin_jurisdiccion();
select * from public.paises_sancionados_sin_catalogo();

-- Y el diagnóstico: `onu` debe dejar de salir como bandera roja.
select o.razon_social, d.concepto, d.cuantos, d.detalle
  from organizations o
 cross join lateral public.diagnostico_organizacion(o.id) d
 where not d.listo
 order by o.razon_social;
