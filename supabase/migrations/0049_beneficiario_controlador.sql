-- =====================================================================
-- 0049 · Beneficiario Controlador y estructura societaria
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 2 del 31/08/2026, que
-- transcribe el Capítulo III Quinquies de las RCG —artículos 23 Quinquies,
-- 23 Quinquies 1, 23 Quinquies 2 y 23 Quinquies 3— adicionado por el Acuerdo
-- publicado en el DOF el 07/08/2026, más el art. 12 fr. VII de las mismas
-- Reglas y los mínimos societarios de la LGSM y la LGSC.
--
-- Instrucciones 13 a 16, 18, 19, 21 y 22 de esa adenda.
--
-- ---------------------------------------------------------------------
-- 1. La cascada tiene TRES estados por paso, no dos
-- ---------------------------------------------------------------------
-- «Practicado sin resultado» y «no practicado» son cosas distintas ante una
-- verificación, y el expediente tiene que poder distinguirlas. Con un booleano
-- —hecho o no hecho— un paso que se intentó y no arrojó a nadie se ve igual que
-- uno que nadie intentó, y el artículo 23 Quinquies obliga a DOCUMENTAR EL
-- PROCEDIMIENTO SEGUIDO, no sólo su resultado.
--
-- El orden es secuencial y obligatorio: no se salta al II sin haber practicado
-- el I, ni al III sin el II. «Por lo menos el siguiente orden de prelación» es
-- un piso, no un techo: se pueden añadir pasos, nunca omitir uno.
--
-- ---------------------------------------------------------------------
-- 2. El umbral es 25.00 % O MÁS, y se mide por DOS vías
-- ---------------------------------------------------------------------
-- Hay discrepancia entre los dos textos vigentes y la adenda la resuelve:
--
--   LFPIORPI art. 3 fr. III b) ii)  · «más del veinticinco por ciento»
--   RCG art. 23 Quinquies fr. I     · «el 25% o más»
--
-- Se implementa «mayor o igual a 25.00 %», que es el texto de la regla que
-- desarrolla el procedimiento y la lectura que identifica a MÁS personas: ante
-- dos textos vigentes, el criterio conservador es el que no deja fuera a nadie.
-- La decisión queda asentada aquí y debe repetirse en el Manual.
--
-- Y hay una segunda diferencia, menos visible: la Ley mide DERECHOS DE VOTO y
-- la regla mide TITULARIDAD de la composición accionaria. No siempre coinciden
-- —hay acciones sin voto, y voto por convenio sin titularidad—. Por eso se
-- capturan los DOS porcentajes por socio y el paso I dispara con cualquiera de
-- los dos. Un solo campo de «participación» dejaría fuera casos que ambos
-- textos quieren capturar.
--
-- ---------------------------------------------------------------------
-- 3. El paso III no es un trámite resuelto: es una señal
-- ---------------------------------------------------------------------
-- Llegar al funcionario administrativo de mayor grado significa que la
-- estructura de control NO FUE DETERMINABLE. La Adenda 1 puso «beneficiario
-- controlador no determinable» entre los pisos que fuerzan banda alta, y el
-- disparador de ese piso es precisamente haber tenido que recurrir al paso III.
--
-- Por eso el paso se guarda en la fila: un beneficiario del paso III no puede
-- presentarse como si estuviera identificado por titularidad.
--
-- ---------------------------------------------------------------------
-- 4. Del beneficiario controlador se recaban CUATRO datos, y no se le verifica
-- ---------------------------------------------------------------------
-- Es la respuesta más contraintuitiva de la adenda y conviene sostenerla. El
-- art. 12 fr. VII de las Reglas parte en dos según quién sea el cliente:
--
--   Cliente persona FÍSICA  · los mismos datos y documentos que del cliente,
--                             condicionado a «cuente con dicha información».
--   Cliente persona MORAL   · sólo los numerales i), ii), iv) y ix) del inciso
--     o fideicomiso           a) del Anexo 3, «en todos los casos».
--
-- El caso de Ikán es el segundo. Así que NO se integra expediente completo y
-- NO se corre verificación de identidad sobre el beneficiario controlador: la
-- verificación del art. 18 fr. I de la Ley está referida al Cliente con quien
-- se realiza la Actividad Vulnerable. Didit no se corre sobre él.
--
-- El «cuando cuente con ellas» de la CURP y el RFC aplica AL DATO, no a la
-- obligación: hay que preguntarlo y registrar la ausencia, no omitir el campo.
-- Por eso hay dos columnas más que dicen que no cuenta con ellas.
--
-- ---------------------------------------------------------------------
-- 5. El mínimo de socios depende del TIPO SOCIAL
-- ---------------------------------------------------------------------
-- No hay regla común. La sociedad por acciones simplificada se constituye
-- válidamente con UN SOLO accionista (LGSM art. 260) y es el único tipo
-- mercantil mexicano que lo admite. Una validación global de «al menos dos»
-- rechazaría sociedades legalmente constituidas.
--
-- Nota sobre los mínimos de dos: salvo la S.A.S., la cooperativa y la de ahorro
-- y préstamo, el mínimo NO está enunciado como cifra en ningún artículo: deriva
-- de la naturaleza contractual del tipo. El catálogo lo dice así, para que el
-- mensaje de la pantalla no cite un artículo que no existe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogo de tipos sociales
-- ---------------------------------------------------------------------
create table if not exists tipo_social (
  clave text primary key,
  nombre text not null,
  socios_minimo int not null check (socios_minimo >= 1),
  socios_maximo int check (socios_maximo is null or socios_maximo >= socios_minimo),
  fundamento text not null,
  /** La S.A.S. sólo admite personas físicas como accionistas (LGSM art. 260). */
  solo_personas_fisicas boolean not null default false,
  vigente boolean not null default true
);

comment on table tipo_social is
  'Tipos de sociedad con su mínimo de socios. El mínimo NUNCA se resuelve con una '
  'constante global: la S.A.S. se constituye con un solo accionista y una validación '
  'de «al menos dos» rechazaría sociedades legalmente constituidas.';
comment on column tipo_social.fundamento is
  'De dónde sale el mínimo. Salvo S.A.S., cooperativa y ahorro y préstamo, no está '
  'enunciado como cifra en ningún artículo: deriva de la naturaleza contractual del '
  'tipo, y así debe decirlo el mensaje de la pantalla.';

insert into tipo_social (clave, nombre, socios_minimo, socios_maximo, fundamento, solo_personas_fisicas)
values
  ('sas', 'Sociedad por Acciones Simplificada (S.A.S.)', 1, null,
   'LGSM art. 260. Accionistas sólo personas físicas; tope de ingresos anuales actualizable.', true),
  ('sa', 'Sociedad Anónima (S.A.)', 2, null, 'LGSM art. 89, fr. I.', false),
  ('sapi', 'Sociedad Anónima Promotora de Inversión (S.A.P.I.)', 2, null,
   'LGSM art. 89, fr. I. Se rige por la LMV pero es una S.A.', false),
  ('srl', 'Sociedad de Responsabilidad Limitada (S. de R.L.)', 2, 50,
   'LGSM art. 61 fija el máximo de 50; el mínimo de dos deriva de la naturaleza contractual del tipo.', false),
  ('nombre_colectivo', 'Sociedad en Nombre Colectivo', 2, null,
   'LGSM art. 1, fr. I. El mínimo deriva de la naturaleza contractual del tipo.', false),
  ('comandita_simple', 'Sociedad en Comandita Simple', 2, null,
   'Requiere al menos un comanditado y un comanditario.', false),
  ('comandita_acciones', 'Sociedad en Comandita por Acciones', 2, null,
   'Requiere al menos un comanditado y un comanditario.', false),
  ('cooperativa', 'Sociedad Cooperativa', 5, null, 'LGSC art. 11.', false),
  ('cooperativa_ahorro', 'Sociedad Cooperativa de Ahorro y Préstamo', 25, null, 'LGSC art. 33 Bis.', false),
  ('civil', 'Sociedad Civil o Asociación Civil', 2, null,
   'Códigos civiles. El mínimo deriva de la naturaleza contractual del tipo.', false)
on conflict (clave) do nothing;

alter table tipo_social enable row level security;
drop policy if exists "tipo_social_select" on tipo_social;
create policy "tipo_social_select" on tipo_social for select using (true);
drop policy if exists "tipo_social_write_kawiil" on tipo_social;
create policy "tipo_social_write_kawiil" on tipo_social for all
  using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());
revoke insert, update, delete on tipo_social from anon, authenticated;
revoke all on tipo_social from anon;
grant select on tipo_social to authenticated;

-- ---------------------------------------------------------------------
-- El tipo social y las excepciones, en el cliente
-- ---------------------------------------------------------------------
alter table client
  add column if not exists tipo_social text references tipo_social(clave),
  add column if not exists pais_constitucion_clave text,
  -- Excepciones del art. 23 Quinquies 2.
  add column if not exists bc_exencion text,
  add column if not exists clave_pizarra text;

alter table client drop constraint if exists client_bc_exencion_valida;
alter table client
  add constraint client_bc_exencion_valida
  check (
    bc_exencion is null
    or (bc_exencion = 'bolsa_de_valores' and coalesce(clave_pizarra, '') <> '')
    or bc_exencion = 'anexo_regla'
  );

comment on column client.bc_exencion is
  'Excepción del art. 23 Quinquies 2 para no recabar datos del beneficiario controlador. '
  '«bolsa_de_valores» NO es automática por ser emisora: el texto la condiciona a que el '
  'cliente proporcione la clave de pizarra, y sin ella la excepción no aplica —por eso el '
  'check la exige—. «anexo_regla» remite a los Anexos 4 Bis, 6 Bis, 7-A y 7 Bis A, que '
  'deben cargarse como catálogo y no resolverse a criterio del capturista.';
comment on column client.pais_constitucion_clave is
  'Para sociedades constituidas fuera de México el mínimo de socios NO aplica: se rige '
  'por la ley del lugar de constitución (Adenda 2, apartado 3.3).';

-- ---------------------------------------------------------------------
-- Estructura societaria
-- ---------------------------------------------------------------------
-- `socio_client_id` es lo que hace RECURSIVA la estructura: si un socio con 25 %
-- o más es a su vez persona moral, se le vuelve a aplicar el art. 23 Quinquies,
-- ascendiendo en la cadena hasta llegar a personas físicas. El modelo tiene que
-- ser un grafo de profundidad arbitraria, no dos niveles.
create table if not exists socio (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete cascade,

  tipo_persona tipo_persona not null,
  nombre_razon_social text not null,
  /** Cuando el socio es a su vez una persona moral registrada: la cadena sigue por aquí. */
  socio_client_id uuid references client(id) on delete set null,

  -- LOS DOS porcentajes. La Ley mide voto, la regla mide titularidad, y no
  -- siempre coinciden: hay acciones sin voto y voto por convenio sin
  -- titularidad. Un solo campo dejaría fuera casos que ambos textos capturan.
  porcentaje_titularidad numeric(7,4) check (porcentaje_titularidad between 0 and 100),
  porcentaje_voto numeric(7,4) check (porcentaje_voto between 0 and 100),

  cargo text,
  acciones int,
  capturado_por uuid references auth.users(id),
  capturado_en timestamptz not null default now()
);

comment on table socio is
  'Estructura societaria de una persona moral. Recursiva por socio_client_id: un socio '
  'que a su vez es persona moral continúa la cadena de titularidad y control hasta la '
  'persona física que en última instancia ejerce el control (art. 23 Quinquies 1).';
comment on column socio.porcentaje_voto is
  'Se captura APARTE de la titularidad y no en su lugar: la LFPIORPI mide derechos de '
  'voto y las RCG miden titularidad accionaria, y no siempre coinciden. El paso I de la '
  'cascada dispara con CUALQUIERA de los dos al 25 % o más.';

create index if not exists idx_socio_client on socio(client_id);
create index if not exists idx_socio_cadena on socio(socio_client_id) where socio_client_id is not null;

alter table socio enable row level security;
drop policy if exists "socio_misma_org" on socio;
create policy "socio_misma_org" on socio for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());
revoke insert, update, delete on socio from anon;

-- ---------------------------------------------------------------------
-- La cascada, paso por paso
-- ---------------------------------------------------------------------
do $$ begin
  create type estado_paso_bc as enum ('no_practicado', 'practicado_sin_resultado', 'practicado_con_resultado');
exception when duplicate_object then null; end $$;

create table if not exists cascada_bc (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete cascade,
  paso text not null check (paso in ('I', 'II', 'III')),
  estado estado_paso_bc not null default 'no_practicado',
  /** Qué se hizo y qué se miró. El art. 23 Quinquies obliga a documentar el
   *  PROCEDIMIENTO seguido, no sólo su resultado. */
  nota text,
  practicado_por uuid references auth.users(id),
  practicado_en timestamptz,
  unique (client_id, paso)
);

comment on table cascada_bc is
  'Los tres pasos del art. 23 Quinquies, cada uno con su estado. Tres estados y no dos: '
  '«practicado sin resultado» y «no practicado» son cosas distintas ante una verificación '
  'y el expediente tiene que poder distinguirlas.';

alter table cascada_bc enable row level security;
drop policy if exists "cascada_bc_misma_org" on cascada_bc;
create policy "cascada_bc_misma_org" on cascada_bc for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());
revoke insert, update, delete on cascada_bc from anon;

-- ---------------------------------------------------------------------
-- Los beneficiarios controladores
-- ---------------------------------------------------------------------
-- VARIOS por cliente: la norma habla de «persona física o grupo de personas
-- físicas», y los pasos I y II pueden arrojar personas simultáneamente sin que
-- eso sea un error.
create table if not exists beneficiario_controlador (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete cascade,

  /** El paso que lo produjo. El III significa que la estructura NO fue
   *  determinable, y eso dispara el piso de banda alta de la Adenda 1. */
  paso text not null check (paso in ('I', 'II', 'III')),
  /** De qué socio salió, cuando viene del paso I. */
  socio_id uuid references socio(id) on delete set null,

  -- Los cuatro datos del Anexo 3, inciso a), numerales i), ii), iv) y ix).
  -- El nombre va PARTIDO en tres: el texto pide «primer apellido, segundo
  -- apellido y nombre(s), sin abreviaturas», que son tres campos y no uno.
  apellido_paterno text not null,
  apellido_materno text,
  nombre text not null,
  fecha_nacimiento date not null,
  pais_nacionalidad_clave text not null,
  curp text,
  rfc text,
  -- «Cuando cuente con ellas» aplica al DATO, no a la obligación: hay que
  -- preguntarlo y registrar la ausencia, no omitir el campo.
  sin_curp boolean not null default false,
  sin_rfc boolean not null default false,

  nota text,
  identificado_por uuid references auth.users(id),
  identificado_en timestamptz not null default now()
);

comment on table beneficiario_controlador is
  'Beneficiarios controladores del cliente. Del art. 12 fr. VII de las RCG: cuando el '
  'cliente es persona moral o fideicomiso se recaban SÓLO cuatro datos, en todos los '
  'casos, y NO se integra expediente completo ni se corre verificación de identidad '
  'sobre ellos: la del art. 18 fr. I está referida al Cliente con quien se realiza la '
  'Actividad Vulnerable. Didit no se corre sobre el beneficiario controlador.';
comment on column beneficiario_controlador.paso is
  'Paso de la cascada que lo produjo. «III» significa que la estructura de control no '
  'fue determinable: no es un trámite resuelto, es una señal, y dispara el piso de banda '
  'alta de la Adenda 1.';

alter table beneficiario_controlador
  drop constraint if exists bc_curp_o_ausencia;
alter table beneficiario_controlador
  add constraint bc_curp_o_ausencia
  check ((curp is not null and not sin_curp) or (curp is null and sin_curp) or (curp is null and not sin_curp));

create index if not exists idx_bc_client on beneficiario_controlador(client_id);

alter table beneficiario_controlador enable row level security;
drop policy if exists "bc_misma_org" on beneficiario_controlador;
create policy "bc_misma_org" on beneficiario_controlador for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());
revoke insert, update, delete on beneficiario_controlador from anon;

-- ---------------------------------------------------------------------
-- Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org and tipo = 'beneficiario_controlador_incorporado') then
      continue;
    end if;
    perform public.registrar_evento(
      v_org, 'beneficiario_controlador_incorporado', 'client', null,
      jsonb_build_object(
        'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 2 del 31/08/2026, que '
               || 'transcribe el Cap. III Quinquies de las RCG adicionado por el Acuerdo '
               || 'del DOF 07/08/2026, y el art. 12 fr. VII de las mismas Reglas.',
        'cascada', 'Tres pasos con orden secuencial obligatorio y TRES estados cada uno. '
                || '«Practicado sin resultado» y «no practicado» son cosas distintas ante '
                || 'una verificación.',
        'umbral', 'Mayor o igual a 25.00 %. La Ley dice «más del 25 %» y las Reglas «25 % '
               || 'o más»: se toma el texto de la regla que desarrolla el procedimiento, '
               || 'que además es la lectura que identifica a más personas. La decisión '
               || 'debe asentarse en el Manual de Políticas Internas.',
        'dos_porcentajes', 'Se capturan titularidad Y voto por socio. La Ley mide derechos '
                        || 'de voto y la regla mide titularidad accionaria, y no siempre '
                        || 'coinciden: hay acciones sin voto y voto por convenio sin '
                        || 'titularidad. El paso I dispara con cualquiera de los dos.',
        'paso_iii', 'Llegar al funcionario de mayor grado significa que la estructura NO '
                 || 'fue determinable. Es el disparador del piso de banda alta de la '
                 || 'Adenda 1, no un trámite resuelto.',
        'sin_verificacion', 'NO se corre Didit sobre el beneficiario controlador: la '
                         || 'verificación del art. 18 fr. I está referida al Cliente con '
                         || 'quien se realiza la Actividad Vulnerable. Se recaban cuatro '
                         || 'datos y ya.',
        'minimo_socios', 'Por TIPO SOCIAL, nunca con una constante global: la S.A.S. se '
                      || 'constituye con un solo accionista (LGSM art. 260) y una regla de '
                      || '«al menos dos» rechazaría sociedades legalmente constituidas.'
      ),
      'sistema', null
    );
  end loop;
end $$;

revoke insert, update, delete on client from anon;
