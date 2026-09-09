-- =====================================================================
-- Pruebas de comportamiento · Migration 0066 · Efecto y determinación
-- =====================================================================
-- La prueba 1 es la que importa: ata el defecto que Cumplimiento señaló sin
-- que nadie lo preguntara. Si alguien vuelve a hacer que OFAC bloquee, o que
-- la ONU no bloquee, esta prueba lo detiene.
-- =====================================================================

\set ON_ERROR_STOP on
\pset pager off

do $probar$
declare
  v_efecto efecto_lista;
  v_estado text;
  v_n int;
  v_fuente uuid;
  v_carga uuid;
begin
  -- -------------------------------------------------------------------
  -- 1. La ONU impide; OFAC no. Nunca al revés
  -- -------------------------------------------------------------------
  -- Instrucción 242. Los dos errores posibles son graves y son opuestos:
  -- convertir una coincidencia de OFAC en un bloqueo que nadie puede
  -- sostener, o degradar una de la ONU a un simple punto de riesgo.
  if public.efecto_de_coincidencia('onu_consolidada') <> 'impedimento' then
    raise exception 'PRUEBA 1 FALLA: la ONU vincula a México y tiene que impedir.';
  end if;
  if public.efecto_de_coincidencia('ofac_sdn') <> 'eleva_diligencia' then
    raise exception
      'PRUEBA 1 FALLA: OFAC es derecho extranjero. Eleva la diligencia, NO impide.';
  end if;
  raise notice 'PRUEBA  1 OK · la ONU impide, OFAC eleva la diligencia';

  -- -------------------------------------------------------------------
  -- 2. El 69-B resuelve por situación
  -- -------------------------------------------------------------------
  -- Tabla del punto 2.2 de Cumplimiento.
  if public.efecto_de_coincidencia('sat_69b', 'definitivo') <> 'impedimento' then
    raise exception 'PRUEBA 2 FALLA: el definitivo del 69-B impide.';
  end if;
  if public.efecto_de_coincidencia('sat_69b', 'presunto') <> 'eleva_diligencia' then
    raise exception
      'PRUEBA 2 FALLA: el presunto eleva la diligencia; dejarlo inerte desaprovecha el '
      'único insumo que la ley pide aprovechar.';
  end if;
  if public.efecto_de_coincidencia('sat_69b', 'desvirtuado') <> 'dato' then
    raise exception 'PRUEBA 2 FALLA: el desvirtuado es dato del expediente, sin efecto.';
  end if;
  if public.efecto_de_coincidencia('sat_69b', 'sentencia_favorable') <> 'dato' then
    raise exception 'PRUEBA 2 FALLA: la sentencia favorable es dato, sin efecto.';
  end if;
  raise notice 'PRUEBA  2 OK · el 69-B: definitivo impide, presunto eleva, el resto es dato';

  -- -------------------------------------------------------------------
  -- 3. Sin efecto declarado devuelve NULL, no «dato»
  -- -------------------------------------------------------------------
  -- NULL dice «no declarado»; 'dato' diría «declarado sin efecto». Caer a
  -- 'dato' convertiría una omisión en una decisión, que es la familia de
  -- fallas que este criterio lleva doce documentos persiguiendo.
  -- Se prueba contra una fuente propia y no contra una del catálogo. Hasta la
  -- 0071 esto usaba `uif_bloqueadas`, que estaba en determinación; cuando
  -- Cumplimiento resolvió que esa lista no obliga, la prueba se puso roja sin
  -- que el mecanismo hubiera cambiado. Lo que se prueba aquí es la función,
  -- no qué opina hoy un abogado de una lista.
  insert into lista_fuente
    (codigo, nombre, autoridad, naturaleza, modo_actualizacion,
     obligatoria, activa, determinacion, efecto, notas)
  values
    ('prueba_sin_declarar', 'FUENTE DE PRUEBA · sin efecto declarado',
     'Ninguna: es una fixture', 'sancion_aml', 'snapshot',
     false, true, 'pendiente', null,
     'La crea y la borra probar_0066_efecto_de_fuente.sql.')
  on conflict (codigo) do update set determinacion = 'pendiente', efecto = null, activa = true;

  if public.efecto_de_coincidencia('prueba_sin_declarar') is not null then
    raise exception
      'PRUEBA 3 FALLA: una fuente en determinación no puede declarar efecto todavía.';
  end if;
  raise notice 'PRUEBA  3 OK · sin declarar devuelve NULL, no un efecto inventado';

  -- -------------------------------------------------------------------
  -- 4. Los tres estados se distinguen
  -- -------------------------------------------------------------------
  -- Instrucción 237. «Cero registros» y «no se sabe si aplica» no son lo
  -- mismo, y hasta ahora se veían igual.
  if public.estado_de_fuente('prueba_sin_declarar') <> 'pendiente_determinacion' then
    raise exception 'PRUEBA 4 FALLA: sin determinar tiene que decir pendiente_determinacion, '
      'y dijo "%".', public.estado_de_fuente('prueba_sin_declarar');
  end if;
  if public.estado_de_fuente('ofac_sdn') <> 'pendiente_carga' then
    raise exception
      'PRUEBA 4 FALLA: OFAC ya se determinó que aplica y sólo le falta el archivo. Dijo "%".',
      public.estado_de_fuente('ofac_sdn');
  end if;
  raise notice 'PRUEBA  4 OK · pendiente de carga y pendiente de determinación se distinguen';

  -- -------------------------------------------------------------------
  -- 5. Con registros pasa a «cargada»
  -- -------------------------------------------------------------------
  select id into v_fuente from lista_fuente where codigo = 'sat_69b';
  insert into lista_carga (fuente_id, tipo, estado, alcance, fecha_publicacion_fuente)
  values (v_fuente, 'archivo', 'aplicada', 'parcial', '2026-07-31')
  returning id into v_carga;

  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, rfc, situacion, fecha_situacion)
  values
    (v_carga, 'alta', 'empresa', 'EFOS DEFINITIVO, S.A.', 'EFO110101AA1', 'definitivo', '2024-01-01'),
    (v_carga, 'alta', 'empresa', 'PRESUNTO, S.A.', 'PRE110101BB2', 'presunto', '2024-01-01'),
    (v_carga, 'alta', 'empresa', 'DESVIRTUADO, S.A.', 'DES110101CC3', 'desvirtuado', '2024-01-01');

  if public.estado_de_fuente('sat_69b') <> 'cargada' then
    raise exception 'PRUEBA 5 FALLA: con registros vigentes la fuente está cargada.';
  end if;
  raise notice 'PRUEBA  5 OK · con registros la fuente pasa a cargada';

  -- -------------------------------------------------------------------
  -- 6. La vista cuenta por efecto, no todo junto
  -- -------------------------------------------------------------------
  -- Es donde vivía el defecto: `situaciones_bloqueantes is null` hacía que
  -- todo lo de una fuente sin situaciones contara como bloqueante.
  -- Se comprueba el INVARIANTE, no un número fijo: los bloqueantes de la vista
  -- son exactamente los definitivos vigentes, y los que elevan son exactamente
  -- los presuntos. Con un número fijo, esta prueba dependía de ser la primera
  -- en tocar el 69-B y fallaba al correr después de las de la 0064 y la 0065 —
  -- que es aislamiento de pruebas, no un defecto del código, pero una aserción
  -- que sólo pasa en cierto orden no comprueba lo que dice comprobar.
  declare
    v_definitivos int;
    v_presuntos int;
    v_vigentes int;
  begin
    select count(*) filter (where r.situacion = 'definitivo'),
           count(*) filter (where r.situacion = 'presunto'),
           count(*)
      into v_definitivos, v_presuntos, v_vigentes
      from lista_registro r
     where r.fuente_id = v_fuente and r.activo;

    select registros_bloqueantes into v_n from v_listas_estado where codigo = 'sat_69b';
    if v_n <> v_definitivos then
      raise exception
        'PRUEBA 6 FALLA: los bloqueantes deben ser exactamente los definitivos (%), y son %.',
        v_definitivos, v_n;
    end if;

    select registros_eleva_diligencia into v_n from v_listas_estado where codigo = 'sat_69b';
    if v_n <> v_presuntos then
      raise exception
        'PRUEBA 6 FALLA: los que elevan deben ser exactamente los presuntos (%), y son %.',
        v_presuntos, v_n;
    end if;

    select registros_vigentes into v_n from v_listas_estado where codigo = 'sat_69b';
    if v_n <> v_vigentes then
      raise exception 'PRUEBA 6 FALLA: el total debe ser %, y dijo %.', v_vigentes, v_n;
    end if;

    -- Y que la separación no sea trivial: tiene que haber de los dos tipos.
    if v_definitivos = 0 or v_presuntos = 0 then
      raise exception
        'PRUEBA 6 FALLA: sin definitivos y presuntos a la vez, la prueba no comprueba nada.';
    end if;
  end;
  raise notice 'PRUEBA  6 OK · la vista separa lo que impide de lo que eleva la diligencia';

  -- -------------------------------------------------------------------
  -- 7. Las fuentes de PPE existen, cada una en su estado
  -- -------------------------------------------------------------------
  -- Esta prueba nació con la instrucción 240, afirmando que el listado de PPE
  -- estaba «en determinación». Lo estuvo un día. Las Notas 3 y 4 lo
  -- resolvieron: la Lista de PPE de la UIF no se puede pedir (art. 45 Bis) y
  -- el catálogo de cargos que sí sirve vive en la disposición 68ª.
  --
  -- Lo que se afirma ahora es la distinción que costó dos notas conseguir: son
  -- DOS fuentes y no una, con estados distintos, y la que no se puede obtener
  -- no puede quedar confundida con la que sólo espera un archivo.
  if public.estado_de_fuente('ppe_oficial') <> 'via_no_disponible' then
    raise exception 'PRUEBA 7 FALLA: la Lista de PPE de la UIF no se puede obtener por ley; '
      'su estado es via_no_disponible y dijo "%".', public.estado_de_fuente('ppe_oficial');
  end if;
  if public.estado_de_fuente('ppe_cargos_68a') <> 'pendiente_carga' then
    raise exception 'PRUEBA 7 FALLA: el catálogo de cargos sólo espera el archivo; su estado '
      'es pendiente_carga y dijo "%".', public.estado_de_fuente('ppe_cargos_68a');
  end if;
  if (select count(*) from lista_fuente
       where codigo in ('ppe_oficial', 'ppe_cargos_68a') and naturaleza::text = 'pep') <> 2 then
    raise exception 'PRUEBA 7 FALLA: las dos fuentes de PPE son de naturaleza pep.';
  end if;
  raise notice 'PRUEBA  7 OK · las dos fuentes de PPE, cada una en su estado';

  -- -------------------------------------------------------------------
  -- 8. Toda fuente que aplica declara qué produce
  -- -------------------------------------------------------------------
  -- Es la comprobación que corre el seed, repetida aquí para que también la
  -- cubra la suite: una fuente que opera sin efecto declarado produciría
  -- coincidencias que nadie sabe cómo tratar.
  select count(*) into v_n from lista_fuente
  where activa and determinacion = 'aplica'
    and efecto is null and efectos_por_situacion is null;
  if v_n > 0 then
    raise exception
      'PRUEBA 8 FALLA: % fuentes aplican sin declarar su efecto.', v_n;
  end if;
  raise notice 'PRUEBA  8 OK · ninguna fuente que aplica se quedó sin declarar efecto';

  -- -------------------------------------------------------------------
  -- 9. La UE quedó sin obligación, pero consultable
  -- -------------------------------------------------------------------
  if public.efecto_de_coincidencia('ue_sanciones') <> 'dato' then
    raise exception 'PRUEBA 9 FALLA: una coincidencia en la UE es dato del expediente.';
  end if;
  if (select obligatoria from lista_fuente where codigo = 'ue_sanciones') then
    raise exception 'PRUEBA 9 FALLA: la UE no obliga a un sujeto obligado mexicano.';
  end if;
  raise notice 'PRUEBA  9 OK · la UE es informativa y no obliga';

  delete from lista_fuente where codigo = 'prueba_sin_declarar';

  raise notice '--- 0066: 9 de 9 ---';
end
$probar$;
