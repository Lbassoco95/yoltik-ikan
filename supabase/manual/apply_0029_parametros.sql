-- =====================================================================
-- Ikán · Aplicar migration 0029 en el SQL Editor / API de gestión
-- =====================================================================
-- Dos cosas, y la segunda importa más que la primera.
--
-- 1. Permite cargar un parámetro regulatorio desde la consola. Hoy la UMA sólo
--    se cambia con SQL, y la UMA entra en vigor el 1 de febrero de cada año:
--    si en febrero nadie se acuerda de correr SQL, el motor sigue calculando
--    el umbral de 645 UMA con el valor del año pasado. Umbral bajo y en
--    silencio: operaciones que sí eran de aviso que no se identifican.
--
-- 2. CIERRA LA ESCRITURA DIRECTA a la tabla. Hoy la política
--    `parametro_write_kawiil` es `for all`, así que un administrador de Kawiil
--    puede hacer `update parametro_regulatorio set valor_numerico = ...` sobre
--    una fila HISTÓRICA y cambiar con qué UMA se juzgó un acto de 2025. Eso es
--    justo lo que la 0011 vino a impedir guardando la vigencia. Una tabla con
--    historial y update abierto no tiene historial.
--
-- NO CAMBIA NINGÚN VALOR. No inserta, no borra y no modifica una sola cifra:
-- crea tres funciones y quita permisos. Idempotente y en transacción.
--
-- Después de aplicarla, cargar la UMA del año siguiente se hace desde
-- Parámetros regulatorios en la consola, con su fuente y su fecha de entrada
-- en vigor, y el valor anterior se cierra solo ese día.
-- =====================================================================

begin;

-- =====================================================================
-- 0029 · Cargar un parámetro regulatorio sin abrir la base (D-2)
-- =====================================================================
-- La 0011 sacó la UMA de las constantes en código y la puso en una tabla con
-- vigencia y fuente. Lo que no puso fue la forma de cargar la siguiente:
-- `AdminParametrosPage` sólo lee, y `src/lib/api/parametros.ts` no escribe. La
-- UMA se cambia con SQL.
--
-- Eso tiene fecha. La UMA entra en vigor el 1 de febrero de cada año, así que
-- en febrero alguien tiene que acordarse de correr SQL, y si no lo hace el
-- motor sigue calculando el umbral de 645 UMA con el valor del año pasado.
-- El fallo sería silencioso y en la dirección mala —umbral bajo, operaciones
-- que sí eran de aviso que no se identifican—: exactamente el bug que motivó
-- la 0011, resucitando por la puerta de al lado.
--
-- ADEMÁS SE CIERRA LA ESCRITURA DIRECTA, y eso es la mitad del valor de esta
-- migration. Hoy la política `parametro_write_kawiil` es `for all`, así que un
-- administrador de Kawiil puede hacer `update parametro_regulatorio set
-- valor_numerico = ...` sobre una fila HISTÓRICA. Eso reescribe con qué UMA se
-- juzgó un acto de 2025, que es precisamente lo que la 0011 vino a impedir
-- guardando la vigencia. Una tabla con historial y `update` abierto no tiene
-- historial: tiene una foto que alguien puede repintar.
--
-- A partir de aquí se escribe por tres funciones y ninguna otra vía:
--
--   fijar_parametro      añade una vigencia nueva y cierra la anterior.
--   corregir_parametro   arregla un valor que TODAVÍA NO entró en vigor.
--   confirmar_parametro  marca que Kawiil-Cumplimiento lo validó.
--
-- Por qué `corregir_parametro` sólo toca lo que no ha entrado en vigor: si un
-- valor aún no rige, el motor jamás calculó con él y no hay nada que explicar;
-- corregirlo no reescribe nada. En cuanto entra en vigor la respuesta cambia,
-- porque durante ese tiempo el motor SÍ lo usó: entonces no se corrige, se
-- cierra su vigencia y se abre otra. Es la misma doctrina de la bitácora de la
-- 0021 —una corrección es un asiento nuevo, nunca la edición de uno viejo—
-- aplicada al catálogo del que el motor saca sus cifras.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Se acabó la escritura directa
-- ---------------------------------------------------------------------
-- La política `for all` cubría select, insert, update y delete. Se sustituye
-- por nada: la lectura ya la da `parametro_select_autenticado`, y la escritura
-- pasa a ser exclusiva de las funciones de abajo.
drop policy if exists "parametro_write_kawiil" on parametro_regulatorio;

-- Y el GRANT, explícito, sin fiarse de la política. En Supabase el
-- ALTER DEFAULT PRIVILEGES le da a `authenticated` insert/update/delete sobre
-- cada tabla nueva del esquema public: sin este revoke, quitar la política
-- cierra la puerta y deja la ventana abierta.
revoke insert, update, delete on parametro_regulatorio from authenticated, anon;

comment on table parametro_regulatorio is
  'Catálogo de plataforma: valores fijados por una autoridad, con vigencia y '
  'fuente. Lo mantiene Kawiil. Sólo se escribe por fijar_parametro, '
  'corregir_parametro y confirmar_parametro (migration 0029): con update '
  'abierto se podría reescribir con qué UMA se juzgó un acto de un año pasado.';

-- ---------------------------------------------------------------------
-- 2. Añadir una vigencia nueva
-- ---------------------------------------------------------------------
/**
 * Fija el valor de un parámetro a partir de una fecha, cerrando el anterior.
 *
 * Cerrar el anterior no es cortesía: la restricción `parametro_sin_traslape`
 * rechaza dos valores del mismo código y sector solapados, así que un insert a
 * secas revienta con un error de PostgreSQL que no le dice nada a quien lo
 * está cargando. Aquí "a partir del 1 de febrero vale otro valor" se traduce
 * en lo que significa: el de antes deja de valer ese día.
 */
create or replace function public.fijar_parametro(
  p_codigo          text,
  p_nombre          text,
  p_valor           numeric,
  p_unidad          text,
  p_vigente_desde   date,
  p_fuente          text,
  p_sector          text default '*',
  p_publicacion_dof text default null,
  p_url_fuente      text default null,
  p_notas           text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior  record;
  v_choque    record;
  v_id        uuid;
  v_fuente    text := btrim(coalesce(p_fuente, ''));
begin
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de plataforma puede fijar un parámetro regulatorio.';
  end if;

  -- «Sin fuente no se siembra» ya estaba escrito en el esquema de la 0011; lo
  -- que faltaba era que algo lo hiciera cumplir. Una cifra regulatoria sin
  -- dónde viene no se puede defender ante nadie.
  if length(v_fuente) < 5 then
    raise exception 'Falta la fuente del parámetro. Una cifra regulatoria sin '
                    'referencia publicada no se puede defender ante una revisión.';
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'El valor tiene que ser un número mayor que cero; llegó %.',
      coalesce(p_valor::text, 'nulo');
  end if;

  -- Ya hay algo que empieza ese mismo día para ese código y sector. Es una
  -- corrección disfrazada de alta, y se dice en vez de dejar que reviente la
  -- restricción de exclusión con un mensaje de PostgreSQL.
  select id, valor_numerico, vigente_desde into v_choque
    from public.parametro_regulatorio
   where codigo = p_codigo and sector = p_sector and vigente_desde = p_vigente_desde;
  if found then
    raise exception 'Ya hay un valor de "%" para el sector % que empieza el %: '
                    'vale %. Si está mal, corrígelo; si es otro periodo, usa otra fecha.',
                    p_codigo, p_sector, to_char(p_vigente_desde, 'DD/MM/YYYY'),
                    v_choque.valor_numerico;
  end if;

  -- El que está abierto hoy. Se cierra el día en que empieza el nuevo.
  select id, vigente_desde, valor_numerico into v_anterior
    from public.parametro_regulatorio
   where codigo = p_codigo and sector = p_sector and vigente_hasta is null
   order by vigente_desde desc
   limit 1;

  if found then
    -- Cargar hacia atrás de lo que ya rige es una operación distinta y con
    -- consecuencias distintas: cambiaría con qué cifra se juzgó lo ya hecho.
    -- No se hace por descuido desde una pantalla.
    if v_anterior.vigente_desde >= p_vigente_desde then
      raise exception 'El valor vigente de "%" empieza el % y el que intentas '
                      'cargar empieza antes (%). Cargar hacia atrás cambiaría con '
                      'qué cifra se juzgó lo ya registrado; eso no se hace desde aquí.',
                      p_codigo, to_char(v_anterior.vigente_desde, 'DD/MM/YYYY'),
                      to_char(p_vigente_desde, 'DD/MM/YYYY');
    end if;

    update public.parametro_regulatorio
       set vigente_hasta = p_vigente_desde
     where id = v_anterior.id;
  end if;

  insert into public.parametro_regulatorio (
    codigo, nombre, valor_numerico, unidad, sector,
    vigente_desde, fuente, publicacion_dof, url_fuente, notas, creado_por
  ) values (
    p_codigo, p_nombre, p_valor, p_unidad, p_sector,
    p_vigente_desde, v_fuente, p_publicacion_dof, p_url_fuente, p_notas, auth.uid()
  ) returning id into v_id;

  -- A la cadena de plataforma: un parámetro no es de nadie en particular, lo
  -- usan todas las organizaciones. Es lo que dice la 0021 de los catálogos,
  -- las listas y los parámetros.
  perform public.registrar_evento(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'parametro_fijado', 'parametro_regulatorio', v_id,
    jsonb_build_object(
      'codigo', p_codigo, 'nombre', p_nombre, 'sector', p_sector,
      'valor', p_valor, 'unidad', p_unidad,
      'vigente_desde', p_vigente_desde, 'fuente', v_fuente,
      'publicacion_dof', p_publicacion_dof,
      'valor_anterior', v_anterior.valor_numerico,
      'cerro_vigencia_de', v_anterior.id
    ),
    'persona', auth.uid()
  );

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 3. Corregir lo que todavía no rige
-- ---------------------------------------------------------------------
create or replace function public.corregir_parametro(
  p_id     uuid,
  p_valor  numeric,
  p_fuente text,
  p_motivo text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p      record;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_fuente text := btrim(coalesce(p_fuente, ''));
begin
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de plataforma puede corregir un parámetro.';
  end if;

  if length(v_motivo) < 10 then
    raise exception 'Escribe el motivo de la corrección (al menos 10 caracteres).';
  end if;

  select * into v_p from public.parametro_regulatorio where id = p_id;
  if not found then
    raise exception 'No existe ese parámetro.';
  end if;

  -- La línea que separa corregir de reescribir la historia.
  if v_p.vigente_desde <= current_date then
    raise exception 'El valor de "%" ya entró en vigor el %, así que el motor '
                    'pudo haber calculado con él. No se corrige: carga una '
                    'vigencia nueva a partir de hoy y deja la anterior como está.',
                    v_p.codigo, to_char(v_p.vigente_desde, 'DD/MM/YYYY');
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'El valor tiene que ser un número mayor que cero.';
  end if;
  if length(v_fuente) < 5 then
    raise exception 'Falta la fuente.';
  end if;

  update public.parametro_regulatorio
     set valor_numerico = p_valor,
         fuente = v_fuente,
         -- La corrección se queda escrita en la propia fila, no sólo en la
         -- bitácora: quien lea el catálogo dentro de un año verá que ese
         -- número se tocó antes de entrar en vigor y por qué.
         notas = case when notas is null or btrim(notas) = ''
                      then v_motivo
                      else notas || E'\n---\n' || v_motivo end,
         -- Corregir el valor invalida la confirmación anterior: lo que se
         -- validó fue el número viejo.
         confirmado_por = null,
         confirmado_en = null
   where id = p_id;

  perform public.registrar_evento(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'parametro_corregido', 'parametro_regulatorio', p_id,
    jsonb_build_object(
      'codigo', v_p.codigo, 'sector', v_p.sector,
      'vigente_desde', v_p.vigente_desde,
      'valor_antes', v_p.valor_numerico, 'valor_ahora', p_valor,
      'motivo', v_motivo, 'fuente', v_fuente
    ),
    'persona', auth.uid()
  );
end $$;

-- ---------------------------------------------------------------------
-- 4. Confirmar
-- ---------------------------------------------------------------------
-- La 0011 dejó `confirmado_por` en null para todo lo sembrado, y la pantalla
-- lo marca como «referencia sujeta a confirmación». Faltaba poder quitarle esa
-- marca sin abrir la base.
create or replace function public.confirmar_parametro(
  p_id    uuid,
  p_quien text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p     record;
  v_quien text := btrim(coalesce(p_quien, ''));
begin
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de plataforma puede confirmar un parámetro.';
  end if;
  if length(v_quien) < 3 then
    raise exception 'Escribe quién lo confirma: la confirmación sin nombre no vale de nada.';
  end if;

  select * into v_p from public.parametro_regulatorio where id = p_id;
  if not found then raise exception 'No existe ese parámetro.'; end if;
  if v_p.confirmado_por is not null then
    raise exception '"%" ya lo confirmó % el %.', v_p.codigo, v_p.confirmado_por,
      to_char(v_p.confirmado_en, 'DD/MM/YYYY');
  end if;

  update public.parametro_regulatorio
     set confirmado_por = v_quien, confirmado_en = current_date
   where id = p_id;

  perform public.registrar_evento(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'parametro_confirmado', 'parametro_regulatorio', p_id,
    jsonb_build_object(
      'codigo', v_p.codigo, 'sector', v_p.sector,
      'valor', v_p.valor_numerico, 'vigente_desde', v_p.vigente_desde,
      'confirmado_por', v_quien
    ),
    'persona', auth.uid()
  );
end $$;

-- ---------------------------------------------------------------------
-- 5. Grants explícitos
-- ---------------------------------------------------------------------
revoke all on function public.fijar_parametro(text,text,numeric,text,date,text,text,text,text,text) from public, anon;
revoke all on function public.corregir_parametro(uuid,numeric,text,text) from public, anon;
revoke all on function public.confirmar_parametro(uuid,text) from public, anon;
grant execute on function public.fijar_parametro(text,text,numeric,text,date,text,text,text,text,text) to authenticated;
grant execute on function public.corregir_parametro(uuid,numeric,text,text) to authenticated;
grant execute on function public.confirmar_parametro(uuid,text) to authenticated;


-- =====================================================================
-- Verificación. Si algo falla, la transacción entera se va atrás.
-- =====================================================================
do $$
declare v_n bigint; v_uma numeric;
begin
  -- 1. Las tres funciones existen.
  if to_regprocedure('public.fijar_parametro(text,text,numeric,text,date,text,text,text,text,text)') is null
     or to_regprocedure('public.corregir_parametro(uuid,numeric,text,text)') is null
     or to_regprocedure('public.confirmar_parametro(uuid,text)') is null then
    raise exception 'FALLA 1: falta alguna de las tres funciones';
  end if;

  -- 2. Ya no queda ninguna política de ESCRITURA sobre la tabla.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'parametro_regulatorio' and cmd <> 'SELECT';
  if v_n > 0 then
    raise exception 'FALLA 2: quedan % política(s) de escritura en parametro_regulatorio', v_n;
  end if;

  -- 3. Y el GRANT tampoco. Es LA comprobación de este bundle: sin ella,
  --    quitar la política cierra la puerta y deja la ventana abierta, porque
  --    en Supabase el ALTER DEFAULT PRIVILEGES da insert/update/delete directo
  --    a authenticated sobre cada tabla nueva del esquema public.
  if has_table_privilege('authenticated', 'public.parametro_regulatorio', 'update')
     or has_table_privilege('authenticated', 'public.parametro_regulatorio', 'insert')
     or has_table_privilege('authenticated', 'public.parametro_regulatorio', 'delete') then
    raise exception 'FALLA 3: authenticated todavía puede escribir en parametro_regulatorio';
  end if;

  -- 4. Pero SIGUE pudiendo leer: es un catálogo regulatorio común y el motor
  --    de cada organización lo necesita. Cerrar esto rompería el producto.
  if not has_table_privilege('authenticated', 'public.parametro_regulatorio', 'select') then
    raise exception 'FALLA 4: se cerró también la LECTURA; el motor se queda sin cifras';
  end if;

  -- 5. Ninguna función al alcance de anon.
  if has_function_privilege('anon', 'public.fijar_parametro(text,text,numeric,text,date,text,text,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.corregir_parametro(uuid,numeric,text,text)', 'execute')
     or has_function_privilege('anon', 'public.confirmar_parametro(uuid,text)', 'execute') then
    raise exception 'FALLA 5: alguna función quedó abierta a anon';
  end if;

  -- 6. No se tocó una sola cifra: la UMA sigue resolviéndose igual que antes.
  select public.parametro_vigente('uma_diaria') into v_uma;
  if v_uma is null then
    raise warning 'AVISO: parametro_vigente(''uma_diaria'') devuelve nulo. Si esperabas '
                  'la UMA sembrada, revísalo ANTES de seguir: el motor la necesita.';
  end if;

  -- 7. Las cadenas de bitácora siguen íntegras: esto no las toca.
  select count(*) into v_n from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  if v_n <> 0 then raise exception 'FALLA 7: % cadena(s) rota(s)', v_n; end if;
end $$;

select 'parámetros editables desde la consola' as bundle,
       (select count(*) from parametro_regulatorio)::text || ' parámetro(s) en el catálogo' as datos,
       coalesce(public.parametro_vigente('uma_diaria')::text, 'NO HAY') as uma_vigente_hoy,
       (select count(*) from parametro_regulatorio where confirmado_por is null)::text
         || ' sin confirmar por Kawiil-Cumplimiento' as pendientes,
       '7 comprobaciones pasaron' as verificacion;

commit;
