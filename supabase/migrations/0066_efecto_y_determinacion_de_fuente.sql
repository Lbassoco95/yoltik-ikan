-- =====================================================================
-- Ikán · Migration 0066 · Qué hace cada lista, y si ya se sabe que aplica
-- =====================================================================
-- Instrucciones 237, 238, 240, 241 y 242 de Kawiil-Cumplimiento (respuesta
-- del 8 de septiembre de 2026, apartado 5, primera y segunda observación).
--
-- ---------------------------------------------------------------------
-- 1. Las cinco listas no pesan igual, y el motor las trataba igual
-- ---------------------------------------------------------------------
-- Es la primera de las tres cosas que Cumplimiento señaló sin que nadie las
-- preguntara, y se ve en una línea de la vista `v_listas_estado` (0017):
--
--     and (f.situaciones_bloqueantes is null
--          or r.situacion = any (f.situaciones_bloqueantes))
--
-- «Sin situaciones declaradas, todo bloquea». Para el 69-B estaba bien porque
-- declara las suyas. Para OFAC, que no maneja situaciones, significaba que
-- CUALQUIER coincidencia contaba como bloqueante — exactamente igual que una
-- de la ONU.
--
-- Y no son lo mismo:
--
--   ONU     Las resoluciones del Consejo de Seguridad vinculan a México. Una
--           coincidencia confirmada es un IMPEDIMENTO.
--   OFAC    Derecho extranjero; un fedatario mexicano no es U.S. person. Su
--           valor es indiciario, por exposición a sanciones secundarias y a
--           relaciones de corresponsalía. ELEVA LA DILIGENCIA, no impide.
--   UE      No obliga a un sujeto obligado mexicano. Es un DATO del
--           expediente, sin efecto automático.
--   69-B    Depende de la situación, y esa tabla la fijó Cumplimiento en su
--           punto B2: definitivo impide, presunto eleva, desvirtuado y
--           sentencia favorable son dato.
--
-- Si las cinco alimentan el mismo casillero, el sistema o bloquea de más o
-- bloquea de menos. Los dos errores son graves y son opuestos. Por eso el
-- efecto pasa a ser un ATRIBUTO DE LA FUENTE y no una interpretación de quien
-- lee la pantalla.
--
-- ---------------------------------------------------------------------
-- 2. «Cero registros» y «no se sabe si aplica» no son el mismo estado
-- ---------------------------------------------------------------------
-- Segunda observación. Hoy tres fuentes muestran cero registros: OFAC y la
-- ONU porque falta bajar un archivo que existe, y la de la UIF porque NO SE
-- HA DETERMINADO si un sujeto obligado del artículo 17 debe consultarla —la
-- Lista de Personas Bloqueadas es un instrumento del régimen financiero, y la
-- cita al «artículo 18 fracción V» puede no sobrevivir a la renumeración de
-- la reforma del 16 de julio de 2025—.
--
-- Enseñarlas iguales le dice al sujeto obligado que las tres se resuelven
-- igual, y no es cierto: dos se resuelven bajando un archivo y la tercera con
-- una determinación jurídica que nadie ha hecho.
--
-- Se añade `determinacion`, y los tres estados salen de ahí sin duplicar la
-- verdad: si la determinación está pendiente el estado es «pendiente de
-- determinación»; si ya se determinó que aplica y no hay registros, «pendiente
-- de carga»; con registros, «cargada».
--
-- La determinación en sí (instrucción 239) NO se hace aquí: es de
-- Cumplimiento. Lo que se construye es dónde asentarla cuando llegue, con su
-- fundamento y su firma.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type efecto_lista as enum ('impedimento', 'eleva_diligencia', 'dato');
exception when duplicate_object then null; end $$;

do $$ begin
  create type determinacion_fuente as enum ('aplica', 'no_aplica', 'pendiente');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------
alter table lista_fuente
  add column if not exists efecto efecto_lista,
  add column if not exists efectos_por_situacion jsonb,
  add column if not exists determinacion determinacion_fuente not null default 'aplica',
  add column if not exists fundamento_determinacion text,
  add column if not exists determinado_por text,
  add column if not exists determinado_en date;

comment on column lista_fuente.efecto is
  'Qué produce una coincidencia en esta fuente: impedimento, elevación de diligencia o dato del expediente. NULL = todavía no se ha declarado, y entonces la fuente no puede producir efecto automático. Lo fija Cumplimiento, no el código.';
comment on column lista_fuente.efectos_por_situacion is
  'Para las fuentes que manejan situaciones, el efecto de cada una: {"definitivo":"impedimento","presunto":"eleva_diligencia",...}. Manda sobre `efecto`.';
comment on column lista_fuente.determinacion is
  'Si ya se determinó que la obligación de consultar esta fuente existe. "pendiente" NO es lo mismo que "sin registros": es que nadie ha resuelto si aplica.';
comment on column lista_fuente.fundamento_determinacion is
  'La norma que sostiene la determinación, con su artículo vigente. Sin esto, una determinación es una opinión.';
comment on column lista_fuente.obligatoria is
  'Sólo tiene sentido cuando determinacion = "aplica". Mientras la determinación esté pendiente, este campo no afirma nada.';

-- ---------------------------------------------------------------------
-- El efecto de una coincidencia: un solo lugar donde preguntarlo
-- ---------------------------------------------------------------------
-- Devuelve NULL cuando la fuente no ha declarado su efecto. NULL no es «sin
-- efecto»: es «no declarado», y quien llame tiene que distinguirlo. Por eso no
-- se cae a 'dato', que sería convertir una omisión en una decisión.
create or replace function public.efecto_de_coincidencia(
  p_fuente text,
  p_situacion text default null
)
returns efecto_lista
language sql
stable
set search_path = public
as $efecto$
  select coalesce(
    (select (f.efectos_por_situacion ->> p_situacion)::efecto_lista
       from lista_fuente f
      where f.codigo = p_fuente
        and p_situacion is not null
        and f.efectos_por_situacion ? p_situacion),
    (select f.efecto from lista_fuente f where f.codigo = p_fuente)
  )
$efecto$;

comment on function public.efecto_de_coincidencia(text, text) is
  'Qué produce una coincidencia en una fuente, con su situación si la tiene. NULL = la fuente no ha declarado efecto y no puede producir uno automático. Es el único lugar donde el motor debe preguntarlo.';

-- ---------------------------------------------------------------------
-- Los tres estados de una fuente
-- ---------------------------------------------------------------------
create or replace function public.estado_de_fuente(p_fuente text)
returns text
language sql
stable
set search_path = public
as $estado$
  select case
    when f.determinacion = 'pendiente' then 'pendiente_determinacion'
    when f.determinacion = 'no_aplica' then 'no_aplica'
    when exists (select 1 from lista_registro r
                  where r.fuente_id = f.id and r.activo) then 'cargada'
    else 'pendiente_carga'
  end
  from lista_fuente f where f.codigo = p_fuente
$estado$;

comment on function public.estado_de_fuente(text) is
  'cargada · pendiente_carga · pendiente_determinacion · no_aplica. La diferencia entre las dos pendientes es la que pidió Cumplimiento: una se resuelve bajando un archivo y la otra con una determinación jurídica.';

-- ---------------------------------------------------------------------
-- La vista del cliente, contando por efecto
-- ---------------------------------------------------------------------
-- `registros_bloqueantes` cambia de significado a propósito: ahora cuenta sólo
-- lo que IMPIDE. Antes contaba todo lo de una fuente sin situaciones, que es
-- justo el defecto que esta migration corrige — con OFAC cargado habría
-- mostrado miles de «bloqueantes» que no impiden nada.
drop view if exists v_listas_estado;

create view v_listas_estado as
  select
    f.codigo,
    f.nombre,
    f.autoridad,
    f.naturaleza,
    f.modo_actualizacion,
    f.url_oficial,
    f.obligatoria,
    f.situaciones,
    f.situaciones_bloqueantes,
    f.efecto,
    f.efectos_por_situacion,
    f.determinacion,
    f.fundamento_determinacion,
    public.estado_de_fuente(f.codigo) as estado,

    (select max(coalesce(c.fecha_publicacion_fuente, c.cargada_en::date))
       from lista_carga c
      where c.fuente_id = f.id and c.estado = 'aplicada') as actualizada_al,

    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo) as registros_vigentes,

    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo
        and public.efecto_de_coincidencia(f.codigo, r.situacion) = 'impedimento'
      ) as registros_bloqueantes,

    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo
        and public.efecto_de_coincidencia(f.codigo, r.situacion) = 'eleva_diligencia'
      ) as registros_eleva_diligencia,

    -- Lo que está cargado pero cuya fuente no ha declarado qué produce. Es un
    -- hueco visible a propósito: son coincidencias que nadie sabe cómo tratar.
    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo
        and public.efecto_de_coincidencia(f.codigo, r.situacion) is null
      ) as registros_sin_efecto_declarado

  from lista_fuente f
  where f.activa;

comment on view v_listas_estado is
  'Estado de cada lista para la organización cliente. Los conteos van separados por EFECTO: lo que impide, lo que eleva la diligencia y lo que ninguna de las dos porque su fuente no lo ha declarado. Sin security_invoker a propósito: expone la fecha sin exponer las cargas.';

grant select on v_listas_estado to authenticated;

revoke all on function public.efecto_de_coincidencia(text, text) from public;
revoke all on function public.estado_de_fuente(text) from public;
do $permisos$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.efecto_de_coincidencia(text, text) to authenticated';
    execute 'grant execute on function public.estado_de_fuente(text) to authenticated';
  end if;
end $permisos$;
