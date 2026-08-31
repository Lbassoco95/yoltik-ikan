-- =====================================================================
-- 0031 · Tipos de acto oficiales, filtro por tipo, y la clave del padrón
-- =====================================================================
-- El ensayo en seco del 31/08/2026 (revisar_actos_notaria.sql) destapó tres
-- cosas en producción. Las tres impedían que el demo de notaría fuera cierto.
--
-- 1. LOS TIPOS DE ACTO SIGUEN SIENDO LOS INVENTADOS
--
--    Los actos llevan `compraventa_inmueble`, `poder_irrevocable`,
--    `constitucion_sociedad` y `fideicomiso`. Ninguno existe en el layout de
--    fe pública del SAT; un aviso armado con ellos falla la validación del
--    portal. El script manual que los corregía nunca se corrió allá, así que
--    esto pasa a ser migration: lo que hay que aplicar sí o sí no se deja en
--    un archivo que alguien tiene que acordarse de correr.
--
--    Efecto colateral: la tipología XII-04, que coteja contra el valor
--    OFICIAL, no disparaba nunca. Una regla `lookup` contra un valor que nadie
--    escribe no falla — calla, que es peor.
--
-- 2. LAS REGLAS AGREGADAS NO MIRABAN DE QUÉ ACTO SE TRATABA
--
--    XII-01 se llama «Transmisión de inmueble ≥ 8,000 UMA» y sumaba TODOS los
--    actos del cliente en la ventana. Una constitución de sociedad de
--    $1,000,000 estaba levantando un hallazgo de transmisión de inmueble.
--
--    No es sólo un nombre engañoso. El penúltimo párrafo del art. 17 de la
--    LFPIORPI acumula POR TIPO DE ACTO U OPERACIÓN; sumar tipos distintos
--    produce avisos que no proceden. Y de paso XII-01 y XII-05 se pisaban: el
--    mismo dinero disparaba las dos.
--
--    El evaluador ganó un `filtro` opcional (ver evaluadores.ts). Opcional
--    porque las reglas de estructuración del sector XVI sí deben sumar todo lo
--    del cliente, y ahí el comportamiento sin filtro es el correcto.
--
-- 3. LA CLAVE DEL PADRÓN NO HABÍA QUE PEDIRLA: ES EL RFC
--
--    El seed 15 dejó `clave_sujeto_obligado` en null diciendo que «el SAT la
--    asigna al inscribirse en el padrón y no se deriva de nada». El
--    instructivo del layout dice lo contrario, en su regla VC22R1:
--
--      «La clave del campo debe ser el Registro Federal de Contribuyentes
--       (RFC) con Homoclave del Sujeto Obligado.»
--
--    Sin ella el XML no se genera (generador-xml.ts la exige), así que esto
--    era lo único que bloqueaba el paso de descargar el aviso.
--
--    Matiz que conviene tener presente fuera de la demo: el sujeto obligado de
--    la fracción XII es el FEDATARIO, persona física, y su RFC es de 13
--    caracteres. Una organización dada de alta con RFC de persona moral (12)
--    valida igual contra el patrón, pero el RFC correcto para reportar es el
--    del notario. Por eso se deriva del RFC de la organización y no se inventa
--    nada: si el RFC de la organización está bien, la clave está bien.
-- =====================================================================

do $$
declare
  v_org       uuid := '12121212-1212-1212-1212-121212121212';
  v_cambiados int;
  v_claves    int;
begin
  -- ------------------------------------------------------------------
  -- 1. Tipos de acto oficiales del layout (rama 3.6.1.3)
  -- ------------------------------------------------------------------
  with corregidas as (
    update public.operation
       set contraparte = jsonb_set(contraparte, '{tipo_acto}', to_jsonb(
             case contraparte->>'tipo_acto'
               when 'compraventa_inmueble'  then 'transmision_inmueble'
               when 'poder_irrevocable'     then 'otorgamiento_poder'
               when 'constitucion_sociedad' then 'constitucion_personas_morales'
               when 'fideicomiso'           then 'constitucion_modificacion_fideicomiso'
               else contraparte->>'tipo_acto'
             end))
     where contraparte->>'tipo_acto' in
           ('compraventa_inmueble', 'poder_irrevocable', 'constitucion_sociedad', 'fideicomiso')
    returning 1)
  select count(*) into v_cambiados from corregidas;

  -- La regla que cotejaba contra la etiqueta vieja tiene que moverse con ella.
  -- Se corrige en sitio y no se versiona: el criterio legal no cambió —el poder
  -- irrevocable siempre fue de Aviso—, cambió el nombre del dato. Versionar
  -- aquí sugeriría que la regla dice algo distinto, y dice lo mismo.
  update public.tipologia_av
     set regla_dsl = jsonb_set(regla_dsl, '{valores}', '["otorgamiento_poder"]'::jsonb)
   where sector = 'XII' and activa
     and regla_dsl->>'campo' = 'contraparte.tipo_acto'
     and regla_dsl->'valores' ? 'poder_irrevocable';

  -- ------------------------------------------------------------------
  -- 2. Que cada regla agregada mire sólo su tipo de acto
  -- ------------------------------------------------------------------
  -- XII-01 v2 y XII-05 se crearon en la 0030, hoy mismo, y no han producido ni
  -- un hallazgo: los que hay son de la v1. Corregirlas en sitio no reescribe
  -- ninguna historia porque todavía no hay historia que reescribir.
  update public.tipologia_av
     set regla_dsl = regla_dsl || jsonb_build_object(
           'filtro', jsonb_build_object(
             'campo', 'contraparte.tipo_acto',
             'valores', jsonb_build_array('transmision_inmueble')))
   where organization_id = v_org and sector = 'XII' and codigo = 'XII-01'
     and version = 2 and regla_dsl->>'tipo' = 'agregado';

  update public.tipologia_av
     set regla_dsl = regla_dsl || jsonb_build_object(
           'filtro', jsonb_build_object(
             'campo', 'contraparte.tipo_acto',
             'valores', jsonb_build_array('constitucion_modificacion_fideicomiso')))
   where organization_id = v_org and sector = 'XII' and codigo = 'XII-05'
     and regla_dsl->>'tipo' = 'agregado';

  -- ------------------------------------------------------------------
  -- 3. La clave del padrón, derivada del RFC
  -- ------------------------------------------------------------------
  -- Sólo donde falta. Si alguien ya puso una a mano —porque el RFC del notario
  -- no es el de la organización, que es el caso real—, no se toca.
  with puestas as (
    update public.organizations
       set clave_sujeto_obligado = upper(btrim(rfc))
     where clave_sujeto_obligado is null
       and rfc is not null
       and length(btrim(rfc)) between 12 and 13
    returning 1)
  select count(*) into v_claves from puestas;

  raise notice '% acto(s) con tipo corregido, % clave(s) de padrón derivadas del RFC.',
    v_cambiados, v_claves;

  -- ------------------------------------------------------------------
  -- 4. Asiento
  -- ------------------------------------------------------------------
  if exists (select 1 from public.organizations where id = v_org)
     and not exists (select 1 from public.evento_auditoria
                      where organization_id = v_org
                        and tipo = 'actos_y_reglas_corregidos') then
    perform public.registrar_evento(
      v_org, 'actos_y_reglas_corregidos', 'operation', null,
      jsonb_build_object(
        'actos_con_tipo_corregido', v_cambiados,
        'de', jsonb_build_array('compraventa_inmueble','poder_irrevocable',
                                'constitucion_sociedad','fideicomiso'),
        'a',  jsonb_build_array('transmision_inmueble','otorgamiento_poder',
                                'constitucion_personas_morales','constitucion_modificacion_fideicomiso'),
        'motivo_tipos', 'Las etiquetas anteriores no existen en el layout de fe pública del SAT; '
                     || 'un aviso armado con ellas falla la validación del portal. Además dejaban '
                     || 'a la tipología XII-04 cotejando contra un valor que nadie escribía.',
        'filtro_por_tipo_de_acto', 'XII-01 y XII-05 sumaban todos los actos del cliente sin mirar '
                     || 'el tipo. El art. 17 de la LFPIORPI acumula POR TIPO DE ACTO U OPERACIÓN.',
        'clave_padron', 'Derivada del RFC conforme a la regla VC22R1 del instructivo del layout.',
        'que_hacer', 'Correr «Recorrer motor»: los hallazgos se reevalúan con las reglas corregidas.'
      ),
      'sistema', null);
  end if;
end $$;
