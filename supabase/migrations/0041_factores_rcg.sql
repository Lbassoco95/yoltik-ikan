-- =====================================================================
-- 0041 · Los factores de riesgo que las RCG exigen y la matriz no tenía
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 1 del 31/08/2026,
-- apartados 4 y 7. Instrucciones 6, 7 y 10.
--
-- Las tres van juntas a propósito, y no por comodidad: cada una cambia el
-- máximo de la escala, y Cumplimiento pide expresamente no recalibrar dos veces.
--
-- ---------------------------------------------------------------------
-- 1. Un solo campo de país no alcanza
-- ---------------------------------------------------------------------
-- Nacionalidad, residencia, jurisdicción de la operación y origen de los
-- recursos son cuatro cosas que pueden divergir, y LA DIVERGENCIA ES LA SEÑAL.
-- Un mexicano residente en México que paga con recursos de una jurisdicción
-- bajo monitoreo intensificado no se distinguía, en la matriz anterior, de uno
-- que paga con recursos locales.
--
-- Nacionalidad y residencia ya existían en `client`; el origen de los recursos
-- entró con la 0036 en `operation`, que es donde le toca. Lo que falta es que
-- la variable de país TOME EL VALOR MÁS ALTO de los tres, y eso vive en el
-- pre-llenado, no aquí.
--
-- ---------------------------------------------------------------------
-- 2. El canal de distribución
-- ---------------------------------------------------------------------
-- Uno de los cuatro factores obligatorios de las RCG, y el que más claramente
-- aplica a este producto: el onboarding es remoto. El canal remoto suma riesgo,
-- y así debe ser —es la contrapartida razonable de haber resuelto la
-- identificación con verificación digital—.
--
-- ---------------------------------------------------------------------
-- 3. La zona geográfica es INTERNA
-- ---------------------------------------------------------------------
-- Las RCG exigen zona geográfica como factor, y zona geográfica no es país.
-- Para una notaría que opera enteramente en territorio nacional, un campo de
-- país que siempre responde «México» no aporta información en el noventa y
-- tantos por ciento de los expedientes. Lo que discrimina es entidad federativa
-- y municipio: del inmueble y del domicilio del cliente.
--
-- La lista de zonas de atención se crea VACÍA. Kawiil la carga y la revisa
-- semestralmente, y hasta que tenga contenido la variable no se responde sola:
-- una lista vacía respondería «sin observaciones» a todo, que es la calificación
-- más baja, y eso es el falso negativo silencioso de siempre.
--
-- ---------------------------------------------------------------------
-- 4. El perfil transaccional
-- ---------------------------------------------------------------------
-- El Capítulo III Ter lo exige con monto, frecuencia, ubicación, origen y
-- destino de recursos y actividad económica. Hoy sólo se capturaba el monto de
-- la operación aislada. Se añade la frecuencia ESPERADA, declarada al alta, que
-- es la única que no se puede calcular: la observada sale de la misma ventana
-- móvil de seis meses del artículo 7.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Canal de distribución
-- ---------------------------------------------------------------------
alter table client
  add column if not exists canal_distribucion text,
  add column if not exists municipio text,
  add column if not exists frecuencia_esperada_anual int;

alter table client drop constraint if exists client_canal_distribucion_valido;
alter table client
  add constraint client_canal_distribucion_valido
  check (canal_distribucion is null or canal_distribucion in (
    'presencial',                  -- ante el fedatario
    'remoto_verificacion_reforzada', -- documento, prueba de vida y face match resueltos
    'remoto_estandar'
  ));

alter table client drop constraint if exists client_frecuencia_no_negativa;
alter table client
  add constraint client_frecuencia_no_negativa
  check (frecuencia_esperada_anual is null or frecuencia_esperada_anual >= 0);

comment on column client.canal_distribucion is
  'Cómo llegó el cliente. Factor obligatorio de las RCG y el que más aplica aquí, '
  'porque el onboarding es remoto. El canal remoto suma riesgo: es la contrapartida '
  'de haber resuelto la identificación con verificación digital.';
comment on column client.municipio is
  'Con la entidad federativa forma la zona geográfica del domicilio. Un campo de país '
  'que siempre responde «México» no discrimina en el 90 % de los expedientes.';
comment on column client.frecuencia_esperada_anual is
  'Operaciones al año que el cliente declara esperar (Cap. III Ter, perfil '
  'transaccional). Es la única pieza del perfil que no se puede calcular: la '
  'observada sale de la ventana móvil de seis meses del art. 7 del Reglamento.';

-- ---------------------------------------------------------------------
-- Zona geográfica del inmueble
-- ---------------------------------------------------------------------
-- Del INMUEBLE, no del cliente: son cosas distintas y las dos cuentan. Alguien
-- domiciliado en Guadalajara que compra en una zona de atención es justo el
-- caso que el factor geográfico existe para ver.
alter table operation
  add column if not exists entidad_federativa_inmueble text,
  add column if not exists municipio_inmueble text;

comment on column operation.entidad_federativa_inmueble is
  'Clave del catálogo ENTIDAD FEDERATIVA donde está el inmueble. Distinta del '
  'domicilio del cliente: las dos cuentan como factor geográfico.';

-- ---------------------------------------------------------------------
-- Lista interna de zonas de atención
-- ---------------------------------------------------------------------
-- Se crea VACÍA a propósito. Las RCG piden considerar zonas geográficas a la
-- luz de la evaluación nacional de riesgos, y esa determinación es de Kawiil:
-- sembrarla con municipios elegidos por nosotros sería inventar metodología, y
-- de la que más se nota.
create table if not exists zona_atencion (
  id uuid primary key default gen_random_uuid(),
  entidad_clave text not null,
  municipio text,
  nivel int not null check (nivel between 1 and 3),
  motivo text not null,
  fuente text not null,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  cargada_por uuid references auth.users(id),
  cargada_en timestamptz not null default now(),
  -- Municipio nulo = la entidad entera. Sin esto, dos filas «Jalisco / null»
  -- convivirían y nadie sabría cuál rige.
  unique nulls not distinct (entidad_clave, municipio, vigente_desde)
);

comment on table zona_atencion is
  'Zonas geográficas de atención, revisadas semestralmente por Kawiil. Vacía hasta '
  'que Cumplimiento la cargue: una lista vacía que respondiera «sin observaciones» a '
  'todo daría la calificación más baja a cualquier ubicación, que es el falso '
  'negativo silencioso de siempre.';

alter table zona_atencion enable row level security;

-- La leen todos: es catálogo de plataforma, no dato de una organización. La
-- escribe sólo Kawiil, como los parámetros regulatorios.
drop policy if exists "zona_atencion_select" on zona_atencion;
create policy "zona_atencion_select" on zona_atencion for select using (true);

drop policy if exists "zona_atencion_write_kawiil" on zona_atencion;
create policy "zona_atencion_write_kawiil" on zona_atencion for all
  using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());

revoke insert, update, delete on zona_atencion from anon, authenticated;
revoke all on zona_atencion from anon;
grant select on zona_atencion to authenticated;

create index if not exists idx_zona_atencion_vigente
  on zona_atencion(entidad_clave, municipio)
  where vigente_hasta is null;

-- ---------------------------------------------------------------------
-- El snapshot del GAFI, versionado por plenario
-- ---------------------------------------------------------------------
-- El GAFI actualiza sus listas TRES VECES AL AÑO, y la referencia con la que se
-- calificó un expediente debe poder reconstruirse. Sin esto, una
-- reclasificación posterior parece un error en vez de una actualización.
--
-- Y no se consulta en vivo sin fijar versión: una respuesta que cambia sola
-- entre dos consultas del mismo expediente es indefendible ante una
-- verificación.
alter table country_risk_list
  add column if not exists plenario text;

comment on column country_risk_list.plenario is
  'Plenario del GAFI que publicó esta lista, p. ej. «2026-06». El GAFI actualiza '
  'tres veces al año y la referencia con la que se calificó un expediente tiene que '
  'poder reconstruirse: sin ella, una reclasificación posterior parece un error.';

-- Qué versión se le aplicó a cada evaluación, igual que se registra qué versión
-- del umbral se usó.
alter table client_risk_assessment
  add column if not exists snapshot_listas_plenario text,
  add column if not exists metodologia_version int;

comment on column client_risk_assessment.snapshot_listas_plenario is
  'Plenario del GAFI vigente al evaluar. La metodología, las bandas y los pesos son '
  'parámetros normativos igual que los umbrales: sin registrar contra qué versión se '
  'calculó, la reclasificación semestral del Cap. III Bis es indistinguible de una '
  'corrección de errores.';

-- ---------------------------------------------------------------------
-- Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org and tipo = 'factores_rcg_incorporados') then
      continue;
    end if;
    perform public.registrar_evento(
      v_org, 'factores_rcg_incorporados', 'client', null,
      jsonb_build_object(
        'pais', 'Nacionalidad, residencia y origen de los recursos son cosas distintas y '
             || 'la DIVERGENCIA entre ellas es la señal. Un residente en México que paga '
             || 'con recursos de una jurisdicción bajo monitoreo no se distinguía de uno '
             || 'que paga con recursos locales.',
        'canal', 'Factor obligatorio de las RCG y el que más aplica aquí: el onboarding '
              || 'es remoto.',
        'zona_geografica', 'Un campo de país que siempre responde «México» no discrimina '
                        || 'en el 90 % de los expedientes. La lista de zonas de atención '
                        || 'se crea VACÍA: la determinación es de Cumplimiento.',
        'perfil_transaccional', 'Cap. III Ter. La frecuencia esperada es la única pieza '
                             || 'que no se puede calcular.',
        'snapshot_gafi', 'Versionado por plenario. El GAFI actualiza tres veces al año y '
                      || 'una respuesta que cambia sola entre dos consultas del mismo '
                      || 'expediente es indefendible ante una verificación.'
      ),
      'sistema', null
    );
  end loop;
end $$;

revoke insert, update, delete on client from anon;
revoke insert, update, delete on operation from anon;
