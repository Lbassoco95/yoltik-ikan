-- =====================================================================
-- Ikán · Aplicar migration 0033 en el SQL Editor / API de gestión
-- =====================================================================
-- Corrige los umbrales de la fracción XVI, que están sobre cifras DEROGADAS.
-- Es el primer punto que el criterio de cumplimiento de Kawiil del 31/08/2026
-- marca «antes de la próxima demo».
--
-- El motor exige 3,210 UMA donde la ley pide 210: quince veces más. Con la UMA
-- de 2026, $376,565 contra $24,635. Todo lo que hay entre esas dos cifras se
-- está callando.
--
-- Añade también la columna `contraprestacion_mxn` a las operaciones: el inciso
-- b) fija el umbral en 4 UMA sobre la COMISIÓN cobrada, y ese dato no se deriva
-- del monto de la operación.
--
-- REQUIERE el motor desplegado con el código nuevo: la regla XVI-09 usa una
-- métrica (`contraprestacion_uma`) que la versión anterior no conoce, y el
-- histórico de la UMA por fecha del acto tampoco. Aplicar el SQL sin desplegar
-- deja la regla sin disparar.
--
-- Idempotente y en transacción.
-- =====================================================================

begin;

-- =====================================================================
-- 0033 · Umbrales de activos virtuales al régimen vigente (fracción XVI)
-- =====================================================================
-- El criterio de la célula de cumplimiento de Kawiil del 31/08/2026 lo marca
-- como el primer punto a cerrar «antes de la próxima demo»:
--
--   «La reforma del 16 de julio de 2025 reescribió la fracción XVI. Los
--    umbrales que operaban antes —645 UMA para identificación y 3,210 UMA para
--    Aviso— ya no aparecen en el texto vigente, que fija el Aviso en 210 UMA
--    por operación de cada cliente y en 4 UMA cuando se cobra contraprestación
--    por el servicio. Si la configuración del contexto de cumplimiento de
--    cripto en Ikán todavía trae 645 y 3,210, está calculando sobre cifras
--    derogadas.»
--
-- Es el mismo error que la 0030 corrigió en fe pública, en el otro sector. Y
-- aquí el efecto es al revés: el umbral viejo era MÁS ALTO que el vigente
-- (3,210 contra 210 UMA), así que el motor dejaba pasar quince veces más de lo
-- que debía. Con la UMA de 2026, 210 UMA son $24,635.10 contra los $376,565.10
-- de las 3,210: todo lo que hay entre esas dos cifras se estaba callando.
--
-- EL INCISO b) TRAE UN DATO QUE NO TENÍAMOS
--
-- El umbral de 4 UMA se mide sobre la CONTRAPRESTACIÓN cobrada por el servicio,
-- no sobre lo que mueve el cliente. Eso no se deriva de `monto_mxn`: una
-- operación de un millón con comisión de cien pesos no llega al umbral, y una
-- de cinco mil con comisión de quinientos sí. Hace falta capturar la comisión,
-- y por eso esta migration añade la columna.
--
-- Kawiil advierte de la consecuencia, y conviene tenerla presente antes de
-- prometer capacidad: «El umbral de 4 UMA sobre la comisión es, en la práctica,
-- un umbral cercano a cero: casi cualquier operación con cobro de comisión
-- genera Aviso.» Son $469.24 con la UMA de 2026.
--
-- ESTATUS DE LAS CIFRAS
--
-- Kawiil las marca «Confirmado en Ley, pendiente de cotejo»: vienen del texto
-- vigente del artículo 17, pero no pudieron cotejarse contra el folleto oficial
-- del SAT de esa fracción. Por eso entran con `confirmado_por` en null y la
-- pantalla las marca en ámbar, a diferencia de las de fe pública, que sí
-- tienen doble fuente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La comisión cobrada, que es la base del inciso b)
-- ---------------------------------------------------------------------
alter table operation
  add column if not exists contraprestacion_mxn numeric(18,2);

comment on column operation.contraprestacion_mxn is
  'Contraprestación o comisión cobrada por el servicio, cualquiera que sea su '
  'denominación. Base del umbral de 4 UMA del art. 17 fr. XVI inciso b). Null '
  'significa que no se capturó, no que fuera cero.';

do $$
declare
  v_org        uuid := '11111111-1111-1111-1111-111111111111';  -- Ixim Pay
  v_hoy        date := current_date;
  v_fuente     text := 'Art. 17 fr. XVI LFPIORPI, reforma DOF 16/07/2025. Criterio de la '
                    || 'célula de cumplimiento de Kawiil, 31/08/2026.';
  v_pendiente  text := 'Confirmado en Ley, PENDIENTE DE COTEJO contra el folleto oficial del '
                    || 'SAT de la fracción XVI, que no estaba disponible al redactar el '
                    || 'criterio. No debe firmarse en consola hasta cotejarlo.';
begin
  if not exists (select 1 from public.parametro_regulatorio where sector = 'XVI')
     and not exists (select 1 from public.parametro_regulatorio
                      where codigo in ('umbral_identificacion_uma', 'umbral_restriccion_uma')) then
    raise notice 'Catálogo sin umbrales de cripto: proyecto nuevo, lo siembra el seed 10.';
    return;
  end if;

  -- ------------------------------------------------------------------
  -- 2. Retirar las cifras derogadas
  -- ------------------------------------------------------------------
  -- Como en la 0030, la vigencia del catálogo refleja lo que el SISTEMA usó, no
  -- lo que la ley decía: el motor calculó con ellas hasta hoy y hacer que la
  -- fila diga otra cosa dejaría el catálogo correcto y la historia falsa.
  update public.parametro_regulatorio
     set vigente_hasta = v_hoy,
         notas = coalesce(notas || E'\n---\n', '')
              || 'RETIRADO el ' || v_hoy || ': la reforma DOF 16/07/2025 reescribió la '
              || 'fracción XVI y esta cifra ya no aparece en el texto vigente. El Aviso se '
              || 'fija ahora en 210 UMA por operación (inciso a) y 4 UMA sobre la '
              || 'contraprestación (inciso b).'
   where codigo in ('umbral_identificacion_uma', 'umbral_restriccion_uma')
     and vigente_hasta is null
     and valor_numerico in (645, 3210);

  -- ------------------------------------------------------------------
  -- 3. Los vigentes
  -- ------------------------------------------------------------------
  insert into public.parametro_regulatorio
    (codigo, nombre, valor_numerico, unidad, sector, vigente_desde, fuente, publicacion_dof, notas)
  select * from (values
    ('umbral_xvi_operacion_uma',
     'Operación de intercambio de activos virtuales por cliente · umbral de Aviso',
     210::numeric, 'uma', 'XVI', v_hoy, v_fuente, 'DOF 16/07/2025',
     v_pendiente || E'\n'
     || 'Rige desde el 17/07/2025; abre hoy en el catálogo porque hasta hoy el sistema usó '
     || 'la cifra derogada. Se acumula por cliente en ventana de seis meses (art. 7 del '
     || 'Reglamento y penúltimo párrafo del art. 17).'),
    ('umbral_xvi_contraprestacion_uma',
     'Contraprestación cobrada por el servicio · umbral de Aviso',
     4::numeric, 'uma', 'XVI', v_hoy, v_fuente, 'DOF 16/07/2025',
     v_pendiente || E'\n'
     || 'Se mide sobre la COMISIÓN cobrada, no sobre el monto que mueve el cliente. Son '
     || '$469.24 con la UMA de 2026: en la práctica un umbral cercano a cero, y casi '
     || 'cualquier operación con cobro de comisión genera Aviso. Kawiil advierte que eso '
     || 'cambia el orden de magnitud del volumen de avisos que el producto debe soportar.')
  ) as v(codigo, nombre, valor_numerico, unidad, sector, vigente_desde, fuente, publicacion_dof, notas)
  where not exists (select 1 from public.parametro_regulatorio p
                     where p.codigo = v.codigo and p.sector = v.sector);

  -- ------------------------------------------------------------------
  -- 4. Las tipologías, que es donde el motor mira de verdad
  -- ------------------------------------------------------------------
  if exists (select 1 from public.organizations where id = v_org) then

    -- XVI-01 pasa de 645 a 210 UMA. Se versiona: los hallazgos que existan se
    -- generaron con la v1 y tienen que poder explicarse con la regla que los
    -- produjo. Y gana la ventana de seis meses de la acumulación legal, que
    -- antes eran 72 horas de una regla de estructuración.
    update public.tipologia_av set activa = false
     where organization_id = v_org and sector = 'XVI' and codigo = 'XVI-01' and version = 1;

    insert into public.tipologia_av
      (id, organization_id, sector, codigo, nombre, descripcion, regla_dsl, severidad, version, fuente)
    select '33333333-0016-0000-0000-000000000101', v_org, 'XVI', 'XVI-01',
           'Operación de intercambio de activos virtuales ≥ 210 UMA',
           'Aviso por operación de intercambio de activos virtuales de un mismo cliente que '
           || 'alcance o supere 210 UMA, acumulando en ventana de seis meses.',
           '{
              "tipo": "agregado",
              "ventana": "6M",
              "agrupar_por": "client_id",
              "condicion": {
                "count": { "op": ">=", "valor": 1 },
                "suma_monto_uma": { "op": ">=", "valor": 210 }
              },
              "nota": "Art. 17 fr. XVI inciso a) LFPIORPI, reforma DOF 16/07/2025. Antes de la reforma el umbral era 3,210 UMA."
            }'::jsonb,
           'alta', 2, v_fuente
     where not exists (select 1 from public.tipologia_av
                        where organization_id = v_org and sector = 'XVI'
                          and codigo = 'XVI-01' and version = 2);

    -- XVI-09 es nueva: el inciso b) no tenía regla porque no teníamos el dato.
    insert into public.tipologia_av
      (id, organization_id, sector, codigo, nombre, descripcion, regla_dsl, severidad, version, fuente)
    select '33333333-0016-0000-0000-000000000009', v_org, 'XVI', 'XVI-09',
           'Contraprestación cobrada ≥ 4 UMA',
           'Aviso por la contraprestación cobrada por el servicio, cualquiera que sea su '
           || 'denominación, cuando alcance o supere 4 UMA acumuladas por cliente.',
           '{
              "tipo": "agregado",
              "ventana": "6M",
              "agrupar_por": "client_id",
              "condicion": {
                "contraprestacion_uma": { "op": ">=", "valor": 4 }
              },
              "nota": "Art. 17 fr. XVI inciso b) LFPIORPI, reforma DOF 16/07/2025. Se mide sobre la comisión cobrada, no sobre el monto de la operación. Requiere capturar operation.contraprestacion_mxn: sin ese dato la regla no dispara."
            }'::jsonb,
           'alta', 1, v_fuente
     where not exists (select 1 from public.tipologia_av
                        where organization_id = v_org and sector = 'XVI' and codigo = 'XVI-09');

    if not exists (select 1 from public.evento_auditoria
                    where organization_id = v_org
                      and tipo = 'umbrales_actualizados_a_regimen_vigente') then
      perform public.registrar_evento(
        v_org, 'umbrales_actualizados_a_regimen_vigente', 'tipologia_av', null,
        jsonb_build_object(
          'sector', 'XVI',
          'motivo', 'La reforma DOF 16/07/2025 reescribió la fracción XVI y los umbrales que '
                 || 'traía Ikán quedaron derogados.',
          'fuente', v_fuente,
          'operacion',       jsonb_build_object('antes', 3210, 'ahora', 210, 'unidad', 'uma'),
          'identificacion',  jsonb_build_object('antes', 645, 'ahora', 'no existe en el texto vigente'),
          'contraprestacion', jsonb_build_object('antes', 'no existía', 'ahora', 4, 'unidad', 'uma'),
          'rige_legalmente_desde', '2025-07-17',
          'corregido_en_ikan_el', v_hoy,
          'periodo_de_discrepancia',
            'Entre el 17/07/2025 y el ' || v_hoy || ' el motor exigió 3,210 UMA donde la ley '
            || 'pide 210: quince veces más. Las operaciones de ese periodo deben volver a '
            || 'evaluarse.',
          'estatus_de_las_cifras', 'Confirmadas en Ley, pendientes de cotejo contra el folleto '
                 || 'oficial del SAT de la fracción XVI.',
          'que_hacer', 'Correr «Recorrer motor» y modelar el volumen que implica el umbral de '
                 || '4 UMA sobre comisión antes de comprometer capacidad.'
        ),
        'sistema', null);
    end if;
  end if;
end $$;


-- =====================================================================
-- Verificación
-- =====================================================================
do $$
declare v_org uuid := '11111111-1111-1111-1111-111111111111'; v_n bigint;
begin
  -- 1. Las cifras derogadas ya no rigen.
  select count(*) into v_n from public.parametro_regulatorio
   where codigo in ('umbral_identificacion_uma','umbral_restriccion_uma')
     and vigente_hasta is null;
  if v_n <> 0 then raise exception 'FALLA 1: % umbral(es) derogado(s) siguen vigentes', v_n; end if;

  -- 2. Y el del artículo 32 SÍ sigue: es otro artículo y no se derogó. Coincide
  --    en número con el umbral viejo de Aviso, y confundirlos borraría una
  --    obligación vigente.
  if not exists (select 1 from public.parametro_regulatorio
                  where codigo = 'umbral_efectivo_acciones_uma' and vigente_hasta is null) then
    raise exception 'FALLA 2: se retiró por error el umbral de efectivo del art. 32';
  end if;

  -- 3. Los vigentes están.
  select count(*) into v_n from public.parametro_regulatorio
   where codigo in ('umbral_xvi_operacion_uma','umbral_xvi_contraprestacion_uma')
     and vigente_hasta is null;
  if v_n <> 2 then raise exception 'FALLA 3: faltan umbrales vigentes de la fr. XVI (hay %)', v_n; end if;

  -- 4. Y NINGUNO firmado: Kawiil los marca pendientes de cotejo contra el
  --    folleto del SAT. Firmarlos antes sería afirmar lo que nadie comprobó.
  select count(*) into v_n from public.parametro_regulatorio
   where codigo like 'umbral_xvi_%' and confirmado_por is not null;
  if v_n <> 0 then
    raise warning 'AVISO: % umbral(es) de la fr. XVI ya están firmados y el criterio los '
                  'marca pendientes de cotejo. Revísalo.', v_n;
  end if;

  -- 5. La columna de la comisión.
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='operation'
                    and column_name='contraprestacion_mxn') then
    raise exception 'FALLA 5: falta operation.contraprestacion_mxn';
  end if;

  if exists (select 1 from public.organizations where id = v_org) then
    -- 6. XVI-01 en v2 con 210 y la v1 apagada; XVI-09 existe.
    if not exists (select 1 from public.tipologia_av
                    where organization_id = v_org and codigo = 'XVI-01' and version = 2 and activa
                      and (regla_dsl->'condicion'->'suma_monto_uma'->>'valor')::numeric = 210) then
      raise exception 'FALLA 6: XVI-01 v2 no quedó activa con 210 UMA';
    end if;
    if exists (select 1 from public.tipologia_av
                where organization_id = v_org and codigo = 'XVI-01' and version = 1 and activa) then
      raise exception 'FALLA 6b: XVI-01 v1 (645 UMA) sigue activa';
    end if;
    if not exists (select 1 from public.tipologia_av
                    where organization_id = v_org and codigo = 'XVI-09' and activa) then
      raise exception 'FALLA 6c: falta XVI-09 (contraprestación)';
    end if;
  end if;

  -- 7. Cadenas íntegras.
  select count(*) into v_n from public.cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  if v_n <> 0 then raise exception 'FALLA 7: % cadena(s) rota(s)', v_n; end if;
end $$;

select 'umbrales de activos virtuales al régimen vigente' as bundle,
       (select public.parametro_vigente('uma_diaria')::text) as uma_hoy,
       (select count(*)::text from public.operation o
         where o.organization_id = '11111111-1111-1111-1111-111111111111'
           and o.monto_mxn >= 210  * public.parametro_vigente('uma_diaria')
           and o.monto_mxn <  3210 * public.parametro_vigente('uma_diaria'))
         || ' operación(es) en el hueco de 210 a 3,210 UMA' as se_escapaban,
       (select count(*)::text from public.operation
         where contraprestacion_mxn is not null) || ' con comisión capturada' as comisiones,
       'Desplegar motor-pld y correr «Recorrer motor»' as siguiente_paso;

commit;
