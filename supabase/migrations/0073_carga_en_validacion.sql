-- =====================================================================
-- 0073 · Carga en validación, y la compuerta que impide operar a medias
-- =====================================================================
-- Cierra las instrucciones 297 y 298 de la Nota 2 de la Célula de Cumplimiento
-- (8 de septiembre de 2026).
--
-- ---------------------------------------------------------------------
-- Qué se autoriza y qué se impide
-- ---------------------------------------------------------------------
-- 297: se puede cargar una lista antes de terminar la migración de alias,
-- «como fuente en validación y no operativa. El barrido no la consulta, la
-- pantalla lo declara, y los datos se recargan al terminar la migración. Así
-- se valida el camino completo sin producir un "sin coincidencias" falso, que
-- es lo único que había que evitar.»
--
-- 298: «Impedir que cualquier fuente pase a operativa mientras el cotejo no
-- mire alias con su calidad. Una fuente cargada a medias que declara estar
-- operando es peor que una vacía, porque la vacía se ve vacía.»
--
-- ---------------------------------------------------------------------
-- Por qué no alcanzaba con `activa`
-- ---------------------------------------------------------------------
-- `activa` ya gateaba dos cosas a la vez —si la fuente se ve en pantalla y si
-- el barrido la consulta— y aquí hacen falta separadas: una fuente en
-- validación TIENE que verse, con su fecha y sus conteos, porque de eso se
-- trata validarla; y NO tiene que barrerse. Con una sola columna había que
-- elegir entre esconder lo que se está validando o barrer lo que no está
-- listo, y las dos son malas.

-- ---------------------------------------------------------------------
-- 1. El modo de operación
-- ---------------------------------------------------------------------
do $$ begin
  create type modo_operacion_fuente as enum ('validacion', 'operativa');
exception when duplicate_object then null; end $$;

-- Por omisión VALIDACIÓN, y es la mitad del control. Una fuente nueva no
-- entra barriendo: entra para revisarse. El descuido de no declarar el modo
-- cae del lado que no produce un «sin coincidencias» falso.
alter table lista_fuente
  add column if not exists modo_operacion modo_operacion_fuente
    not null default 'validacion';

comment on column lista_fuente.modo_operacion is
  'validacion = cargada para revisarse; el barrido NO la consulta y la pantalla lo '
  'declara. operativa = el barrido la consulta y una coincidencia cuenta. Va aparte '
  'de `activa` porque una fuente en validación tiene que VERSE —de eso se trata '
  'validarla— y no tiene que barrerse (instrucción 297).';

-- ---------------------------------------------------------------------
-- 2. La compuerta de la 298
-- ---------------------------------------------------------------------
-- Es una función y no un parámetro en tabla, a propósito. La 298 no depende de
-- una decisión que alguien tome: depende de que exista código que todavía no
-- existe. Un parámetro en tabla se puede cambiar con un UPDATE por descuido o
-- por prisa un viernes; esta compuerta sólo se abre editando este archivo, con
-- todo lo que eso arrastra —revisión, prueba, commit—.
--
-- Devuelve false hasta que la compuerta del corroborante (instrucciones 327 a
-- 330) esté construida: hoy el barrido SÍ mira la calidad del alias —devuelve
-- 'alias_debil' como forma de coincidencia— pero eso es la mitad de la 294.
-- Falta lo otro: exigir que un campo corroborante COINCIDA antes de mostrar
-- una coincidencia de baja calidad. Sin eso, los 628 alias `Low` de la ONU
-- llegan a la pantalla como candidatos, la notaría se detiene constantemente y
-- en dos semanas empieza a palomear sin mirar. Un control que se dispara de
-- más deja de ser un control.
create or replace function public.cotejo_con_calidad_de_alias()
returns boolean
language sql
immutable
set search_path = public
as $compuerta$
  select false
$compuerta$;

comment on function public.cotejo_con_calidad_de_alias() is
  'Compuerta de la instrucción 298: ninguna fuente pasa a operativa mientras esto '
  'devuelva false. Se abre cuando exista la compuerta del corroborante con sus tres '
  'desenlaces —corroborada, no corroborable y contradicha— de las instrucciones 327 a '
  '330. Es función y no dato para que abrirla exija editar una migration, no un UPDATE.';

-- ---------------------------------------------------------------------
-- 3. El candado
-- ---------------------------------------------------------------------
create or replace function public.trg_fuente_operativa_exige_cotejo()
returns trigger
language plpgsql
set search_path = public
as $trg$
begin
  if new.modo_operacion = 'operativa'
     and (tg_op = 'INSERT' or old.modo_operacion is distinct from 'operativa')
     and not public.cotejo_con_calidad_de_alias() then
    raise exception
      'La fuente «%» no puede pasar a operativa: el cotejo todavía no aplica la '
      'compuerta del corroborante a los alias de baja calidad (instrucción 298). Una '
      'fuente cargada a medias que declara estar operando es peor que una vacía, '
      'porque la vacía se ve vacía.', new.codigo;
  end if;
  return new;
end
$trg$;

drop trigger if exists fuente_operativa_exige_cotejo on lista_fuente;
create trigger fuente_operativa_exige_cotejo
  before insert or update of modo_operacion on lista_fuente
  for each row execute function public.trg_fuente_operativa_exige_cotejo();

-- ---------------------------------------------------------------------
-- 4. El barrido deja de consultar lo que está en validación
-- ---------------------------------------------------------------------
-- Se recrea con la misma firma. Lo único que cambia es el filtro, y es el
-- punto entero de la 297: una lista en validación no puede producir
-- coincidencias, porque entonces validarla sería operarla.
drop function if exists public.coincidencias_en_listas(text, text, boolean);

create or replace function public.coincidencias_en_listas(
  p_nombre text default null,
  p_rfc text default null,
  p_incluir_debiles boolean default true
)
returns table (
  fuente text,
  fuente_nombre text,
  registro_id uuid,
  nombre text,
  tipo_entidad text,
  situacion text,
  identificador_fuente text,
  pais text,
  coincide_por text,
  efecto efecto_lista,
  determinacion_fuente text,
  datos jsonb
)
language sql
stable
security definer
set search_path = public
as $barrido$
  with objetivo as (
    select nullif(upper(btrim(coalesce(p_rfc, ''))), '') as rfc,
           public.normalizar_nombre(p_nombre) as nombre_norm
  )
  select f.codigo,
         f.nombre,
         r.id,
         r.nombre,
         r.tipo_entidad,
         r.situacion,
         r.identificador_fuente,
         r.pais,
         case
           when o.rfc is not null and r.rfc = o.rfc then 'rfc'
           when o.nombre_norm is not null and r.nombre_normalizado = o.nombre_norm then 'nombre'
           when o.nombre_norm is not null and o.nombre_norm = any (r.nombres_alternos_norm)
             then 'alias'
           else 'alias_debil'
         end,
         public.efecto_de_coincidencia(f.codigo, r.situacion),
         f.determinacion::text,
         r.identificadores
  from lista_registro r
  join lista_fuente f on f.id = r.fuente_id
  cross join objetivo o
  where r.activo
    and f.activa
    -- Instrucción 297. Y no es lo mismo que devolver cero: quien llama tiene
    -- que decir qué NO se barrió, y para eso está `cobertura_del_barrido()`.
    -- Un «sin coincidencias» que calla las fuentes excluidas es el falso
    -- negativo que esta migration existe para evitar.
    and f.modo_operacion = 'operativa'
    and (
      (o.rfc is not null and r.rfc = o.rfc)
      or (o.nombre_norm is not null and (
            r.nombre_normalizado = o.nombre_norm
            or o.nombre_norm = any (r.nombres_alternos_norm)
            or (p_incluir_debiles and o.nombre_norm = any (r.nombres_alternos_debiles_norm))
          ))
    )
  order by
    case
      when o.rfc is not null and r.rfc = o.rfc then 1
      when o.nombre_norm is not null and r.nombre_normalizado = o.nombre_norm then 2
      when o.nombre_norm is not null and o.nombre_norm = any (r.nombres_alternos_norm) then 3
      else 4
    end,
    case public.efecto_de_coincidencia(f.codigo, r.situacion)
      when 'impedimento' then 1 when 'eleva_diligencia' then 2 when 'dato' then 3 else 0
    end,
    f.codigo,
    r.nombre
$barrido$;

comment on function public.coincidencias_en_listas(text, text, boolean) is
  'Barre un nombre y/o un RFC contra las listas OPERATIVAS, mirando los alias. Las '
  'fuentes en validación quedan fuera (instrucción 297): validarlas no es operarlas. '
  'Un resultado vacío de aquí NO significa que la persona esté limpia — hay que '
  'acompañarlo de `cobertura_del_barrido()`, que dice contra qué se barrió y contra '
  'qué no.';

grant execute on function public.coincidencias_en_listas(text, text, boolean)
  to authenticated;

-- ---------------------------------------------------------------------
-- 5. Contra qué se barrió, y contra qué no
-- ---------------------------------------------------------------------
-- La otra mitad de la 297: «la pantalla lo declara». Sin esto, excluir una
-- fuente del barrido sería esconderla, que es peor que barrerla mal — un
-- «sin coincidencias» contra una lista que nadie miró es la mentira más
-- cara que este producto puede decir.
--
-- Es también el material de la instrucción 246, que pide constancia de
-- ejecución por lista en cada barrido. Esto responde la pregunta en el
-- momento; asentarla como constancia por barrido queda pendiente.
create or replace function public.cobertura_del_barrido()
returns table (
  fuente text,
  fuente_nombre text,
  se_barrio boolean,
  registros_vigentes bigint,
  motivo text
)
language sql
stable
set search_path = public
as $cobertura$
  select f.codigo,
         f.nombre,
         f.modo_operacion = 'operativa'
           and exists (select 1 from lista_registro r
                        where r.fuente_id = f.id and r.activo),
         (select count(*) from lista_registro r
           where r.fuente_id = f.id and r.activo),
         -- Los dos motivos se acumulan en vez de excluirse. Una fuente en
         -- validación Y vacía tiene dos huecos distintos, y decir sólo el
         -- primero subestima el segundo: «en validación» suena a que los datos
         -- están y falta revisarlos, cuando puede no haber nada cargado.
         nullif(
           concat_ws(
             ' ',
             case when f.modo_operacion = 'validacion'
               then 'En validación: cargada para revisarse, y el barrido no la consulta '
                    || 'todavía.' end,
             case when not exists (select 1 from lista_registro r
                                    where r.fuente_id = f.id and r.activo)
               then 'Sin registros cargados: un barrido contra ella no acredita nada.' end
           ),
           ''
         )
  from lista_fuente f
  where f.activa
    and f.determinacion = 'aplica'
  order by f.codigo
$cobertura$;

comment on function public.cobertura_del_barrido() is
  'Qué fuentes entraron al barrido y cuáles no, con el motivo. Acompaña a '
  '`coincidencias_en_listas`: sin esto, un resultado vacío se leería como «la persona '
  'está limpia» cuando puede significar «no se miró nada» (instrucciones 297 y 246).';

grant execute on function public.cobertura_del_barrido() to authenticated;

-- ---------------------------------------------------------------------
-- 6. El estado, que ahora distingue cargada de en validación
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
    when f.determinacion = 'no_disponible' then 'via_no_disponible'
    when not exists (select 1 from lista_registro r
                      where r.fuente_id = f.id and r.activo) then 'pendiente_carga'
    when f.modo_operacion = 'validacion' then 'en_validacion'
    else 'cargada'
  end
  from lista_fuente f where f.codigo = p_fuente
$estado$;

comment on function public.estado_de_fuente(text) is
  'cargada · en_validacion · pendiente_carga · pendiente_determinacion · no_aplica · '
  'via_no_disponible. «en_validacion» es la que tiene datos y todavía no barre: se ve, '
  'con su fecha y sus conteos, y la pantalla dice que no cuenta como control corriendo.';

-- ---------------------------------------------------------------------
-- 7. La vista, con el modo a la vista
-- ---------------------------------------------------------------------
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
    f.fundamento,
    f.fundamento_norma,
    f.modo_operacion,
    case
      when f.fundamento = 'metodologia_manual'
       and (select o.manual_pld_asentado_en from organizations o
             where o.id = public.current_org_id()) is null
        then 'pendiente_manual'
      else f.fundamento::text
    end as fundamento_efectivo,
    public.estado_de_fuente(f.codigo) as estado,
    (select max(c.fecha_publicacion_fuente)
       from lista_carga c
      where c.fuente_id = f.id and c.estado = 'aplicada') as actualizada_al,
    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo) as registros_vigentes,
    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo
        and public.efecto_de_coincidencia(f.codigo, r.situacion) = 'impedimento')
      as registros_bloqueantes,
    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo
        and public.efecto_de_coincidencia(f.codigo, r.situacion) = 'eleva_diligencia')
      as registros_eleva_diligencia,
    (select count(*) from lista_registro r
      where r.fuente_id = f.id and r.activo
        and public.efecto_de_coincidencia(f.codigo, r.situacion) is null)
      as registros_sin_efecto_declarado
  from lista_fuente f
  where f.activa;

comment on view v_listas_estado is
  'Estado de cada fuente para el sujeto obligado. `efecto` dice qué pasa si hay '
  'coincidencia; `fundamento_efectivo` de dónde nace la exigencia de consultarla; '
  '`modo_operacion` si el barrido la consulta o si está en validación.';

grant select on v_listas_estado to authenticated;

-- ---------------------------------------------------------------------
-- 8. Guardas
-- ---------------------------------------------------------------------
do $guarda$
declare v_malas text;
begin
  select string_agg(codigo, ', ') into v_malas
    from lista_fuente
   where activa and determinacion = 'aplica'
     and efecto is null and efectos_por_situacion is null;
  if v_malas is not null then
    raise exception 'Fuentes activas que aplican y no declaran efecto: %.', v_malas;
  end if;

  select string_agg(codigo, ', ') into v_malas
    from lista_fuente
   where activa and determinacion = 'aplica' and fundamento is null;
  if v_malas is not null then
    raise exception 'Fuentes activas que aplican y no declaran fundamento: %.', v_malas;
  end if;

  -- Y que la 298 se cumpla de hecho y no sólo de intención.
  select string_agg(codigo, ', ') into v_malas
    from lista_fuente
   where modo_operacion = 'operativa' and not public.cotejo_con_calidad_de_alias();
  if v_malas is not null then
    raise exception 'Fuentes operativas sin la compuerta del corroborante: %. La 298 lo '
      'impide.', v_malas;
  end if;
end $guarda$;
