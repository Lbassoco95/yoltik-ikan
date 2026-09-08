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
  if public.efecto_de_coincidencia('uif_bloqueadas') is not null then
    raise exception
      'PRUEBA 3 FALLA: la UIF está en determinación y no puede declarar efecto todavía.';
  end if;
  raise notice 'PRUEBA  3 OK · sin declarar devuelve NULL, no un efecto inventado';

  -- -------------------------------------------------------------------
  -- 4. Los tres estados se distinguen
  -- -------------------------------------------------------------------
  -- Instrucción 237. «Cero registros» y «no se sabe si aplica» no son lo
  -- mismo, y hasta ahora se veían igual.
  if public.estado_de_fuente('uif_bloqueadas') <> 'pendiente_determinacion' then
    raise exception 'PRUEBA 4 FALLA: la UIF tiene que decir pendiente_determinacion, y dijo "%".',
      public.estado_de_fuente('uif_bloqueadas');
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
  select registros_bloqueantes into v_n from v_listas_estado where codigo = 'sat_69b';
  if v_n <> 1 then
    raise exception
      'PRUEBA 6 FALLA: sólo el definitivo impide, así que esperaba 1 bloqueante y hubo %.', v_n;
  end if;
  select registros_eleva_diligencia into v_n from v_listas_estado where codigo = 'sat_69b';
  if v_n <> 1 then
    raise exception 'PRUEBA 6 FALLA: el presunto debe contar como elevación, y hubo %.', v_n;
  end if;
  select registros_vigentes into v_n from v_listas_estado where codigo = 'sat_69b';
  if v_n <> 3 then
    raise exception 'PRUEBA 6 FALLA: el total sigue siendo 3, y dijo %.', v_n;
  end if;
  raise notice 'PRUEBA  6 OK · la vista separa lo que impide de lo que eleva la diligencia';

  -- -------------------------------------------------------------------
  -- 7. La sexta fuente existe y está en determinación
  -- -------------------------------------------------------------------
  -- Instrucción 240.
  if not exists (select 1 from lista_fuente where codigo = 'ppe_oficial') then
    raise exception
      'PRUEBA 7 FALLA: falta el listado oficial de PPE, la única fuente cuya obligación '
      'nació con la reforma que se está implementando.';
  end if;
  if public.estado_de_fuente('ppe_oficial') <> 'pendiente_determinacion' then
    raise exception 'PRUEBA 7 FALLA: el listado de PPE está pendiente de determinación.';
  end if;
  if (select naturaleza::text from lista_fuente where codigo = 'ppe_oficial') <> 'pep' then
    raise exception 'PRUEBA 7 FALLA: la naturaleza del listado de PPE es pep.';
  end if;
  raise notice 'PRUEBA  7 OK · el listado oficial de PPE está dado de alta, en determinación';

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

  raise notice '--- 0066: 9 de 9 ---';
end
$probar$;
