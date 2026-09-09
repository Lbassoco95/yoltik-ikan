-- =====================================================================
-- Pruebas de comportamiento · Migration 0070
-- =====================================================================
-- Qué se prueba: que la Lista de PPE de la UIF quede determinada como no
-- obtenible SIN desaparecer de la pantalla, que el catálogo de cargos entre
-- como pendiente de carga y no de determinación, y que el estado nuevo no se
-- confunda con los otros tres.
--
-- Corre después de migrations + seeds. No borra nada.

\set ON_ERROR_STOP on
\pset pager off

do $$
declare
  v_n     int;
  v_txt   text;
  v_bool  boolean;
  v_msg   text;
  v_ok    int := 0;
begin
  -- ------------------------------------------------------------------
  -- 1. El estado nuevo existe y es el que produce la determinación
  -- ------------------------------------------------------------------
  select public.estado_de_fuente('ppe_oficial') into v_txt;
  if v_txt is distinct from 'via_no_disponible' then
    raise exception 'PRUEBA 1: se esperaba via_no_disponible y se obtuvo %', coalesce(v_txt, '(nulo)');
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  1 OK · la Lista de PPE queda en via_no_disponible';

  -- ------------------------------------------------------------------
  -- 2. Y NO se confunde con pendiente de determinación
  -- ------------------------------------------------------------------
  -- Es la distinción que justifica el cuarto valor: `pendiente` mandaría a
  -- alguien a buscar un trámite que la ley prohíbe.
  if v_txt = 'pendiente_determinacion' then
    raise exception 'PRUEBA 2: no puede quedar como pendiente de determinación, ya se determinó';
  end if;
  select count(*) into v_n from v_listas_estado
   where estado = 'pendiente_determinacion' and codigo = 'ppe_oficial';
  if v_n <> 0 then
    raise exception 'PRUEBA 2: la vista todavía la reporta como pendiente de determinación';
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  2 OK · ya no cuenta como pendiente de determinación';

  -- ------------------------------------------------------------------
  -- 3. Sigue VISIBLE en la pantalla del sujeto obligado
  -- ------------------------------------------------------------------
  -- La razón de conservar la fila. Si desapareciera, la pantalla volvería a
  -- callar sobre la Lista de PPE y el siguiente en preguntar por ella
  -- gastaría el tiempo que la Nota 3 acaba de ahorrar.
  select count(*) into v_n from v_listas_estado where codigo = 'ppe_oficial';
  if v_n <> 1 then
    raise exception 'PRUEBA 3: la fuente no aparece en v_listas_estado (% filas)', v_n;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  3 OK · la fuente sigue visible, no se esconde';

  -- ------------------------------------------------------------------
  -- 4. Con su fundamento citado, no con un hueco
  -- ------------------------------------------------------------------
  select fundamento_determinacion into v_txt from lista_fuente where codigo = 'ppe_oficial';
  if v_txt is null or v_txt !~ '45 Bis' then
    raise exception 'PRUEBA 4: el fundamento no cita el art. 45 Bis: %', coalesce(v_txt, '(nulo)');
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  4 OK · el fundamento cita la norma que lo prohíbe';

  -- ------------------------------------------------------------------
  -- 5. No declara efecto, y no puede
  -- ------------------------------------------------------------------
  -- Una fuente que no se puede obtener no produce coincidencias, así que
  -- declararle un efecto sería declarar el efecto de algo que no pasa.
  select efecto is null and efectos_por_situacion is null into v_bool
    from lista_fuente where codigo = 'ppe_oficial';
  if not v_bool then
    raise exception 'PRUEBA 5: una fuente no obtenible no puede declarar efecto';
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  5 OK · sin efecto declarado, que es lo correcto aquí';

  -- ------------------------------------------------------------------
  -- 6. Y por eso NO cuenta como obligatoria
  -- ------------------------------------------------------------------
  select obligatoria into v_bool from lista_fuente where codigo = 'ppe_oficial';
  if v_bool then
    raise exception 'PRUEBA 6: no puede ser obligatoria una fuente que la ley prohíbe entregar';
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  6 OK · no se marca obligatoria';

  -- ------------------------------------------------------------------
  -- 7. El catálogo de cargos entró, y aplica
  -- ------------------------------------------------------------------
  select determinacion::text into v_txt from lista_fuente where codigo = 'ppe_cargos_68a';
  if v_txt is distinct from 'aplica' then
    raise exception 'PRUEBA 7: el catálogo de cargos debe aplicar, y quedó en %', coalesce(v_txt, '(no existe)');
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  7 OK · el catálogo de cargos aplica';

  -- ------------------------------------------------------------------
  -- 8. Pendiente de CARGA, no de determinación
  -- ------------------------------------------------------------------
  -- La distinción que pidió Cumplimiento: éste se resuelve con un archivo que
  -- existe —el texto de la disposición 68ª— y no con una decisión jurídica.
  select public.estado_de_fuente('ppe_cargos_68a') into v_txt;
  if v_txt is distinct from 'pendiente_carga' then
    raise exception 'PRUEBA 8: se esperaba pendiente_carga y se obtuvo %', coalesce(v_txt, '(nulo)');
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  8 OK · el catálogo está pendiente de carga, no de determinación';

  -- ------------------------------------------------------------------
  -- 9. Eleva la diligencia; NO impide
  -- ------------------------------------------------------------------
  -- Ser Persona Políticamente Expuesta no es un hallazgo ni un impedimento:
  -- dispara el régimen reforzado. Tratarlo como impedimento sería negar
  -- servicio por ejercer un cargo público.
  select efecto::text into v_txt from lista_fuente where codigo = 'ppe_cargos_68a';
  if v_txt is distinct from 'eleva_diligencia' then
    raise exception 'PRUEBA 9: el efecto debe ser eleva_diligencia y es %', coalesce(v_txt, '(nulo)');
  end if;
  select public.efecto_de_coincidencia('ppe_cargos_68a', null)::text into v_txt;
  if v_txt is distinct from 'eleva_diligencia' then
    raise exception 'PRUEBA 9: efecto_de_coincidencia devolvió %', coalesce(v_txt, '(nulo)');
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  9 OK · eleva la diligencia y no impide operar';

  -- ------------------------------------------------------------------
  -- 10. La Lista de Personas Bloqueadas NO se tocó
  -- ------------------------------------------------------------------
  -- Son dos listas distintas y la Nota 3 sólo resuelve la de PPE. Confundirlas
  -- daría por determinada una fuente que sigue esperando a Cumplimiento.
  select determinacion::text into v_txt from lista_fuente where codigo = 'uif_bloqueadas';
  if v_txt is distinct from 'pendiente' then
    raise exception 'PRUEBA 10: la Lista de Personas Bloqueadas debe seguir pendiente y está en %', v_txt;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA 10 OK · la Lista de Personas Bloqueadas sigue pendiente, es otra lista';

  -- ------------------------------------------------------------------
  -- 11. Ninguna fuente activa que aplique se quedó sin efecto
  -- ------------------------------------------------------------------
  select string_agg(codigo, ', ') into v_txt
    from lista_fuente
   where activa and determinacion = 'aplica'
     and efecto is null and efectos_por_situacion is null;
  if v_txt is not null then
    raise exception 'PRUEBA 11: fuentes que aplican sin efecto declarado: %', v_txt;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA 11 OK · toda fuente que aplica declara su efecto';

  -- ------------------------------------------------------------------
  -- 12. Un barrido no inventa coincidencias con las fuentes nuevas
  -- ------------------------------------------------------------------
  -- Las dos están en cero registros: el barrido tiene que devolver cero, no
  -- todo. Es la misma comprobación de la 0067 aplicada a lo que se acaba de
  -- agregar, porque una fuente nueva mal atada es la forma más fácil de que
  -- un barrido empiece a mentir.
  -- El barrido devuelve el CÓDIGO de la fuente en `fuente`, no su id.
  select count(*) into v_n
    from public.coincidencias_en_listas('Juan Pérez', null, true) c
   where c.fuente in ('ppe_oficial', 'ppe_cargos_68a');
  if v_n <> 0 then
    raise exception 'PRUEBA 12: el barrido devolvió % coincidencias de fuentes vacías', v_n;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA 12 OK · las fuentes nuevas no producen coincidencias estando vacías';

  raise notice '--- 0070: % de 12 ---', v_ok;

exception when others then
  get stacked diagnostics v_msg = message_text;
  raise notice 'FALLO: %', v_msg;
  raise;
end $$;
