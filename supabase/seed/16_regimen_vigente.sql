-- =====================================================================
-- Seed 16 · Régimen vigente: lo que las migrations no alcanzan a aplicar
-- =====================================================================
-- Las migrations corren ANTES que los seeds. Las que corrigen DATOS existentes
-- —no esquema— no encuentran nada que corregir en un proyecto nuevo:
--
--   0030  umbrales de fe pública al régimen posterior a la reforma
--   0031  tipos de acto oficiales, filtro por tipo, clave del padrón
--   0033  umbrales de activos virtuales: 3,210 → 210 UMA
--   0035  qué tipologías son supuesto de Aviso
--
-- En el proyecto remoto ya se aplicaron, porque ahí los datos existían desde
-- antes. En uno nuevo el efecto era que arrancaba con el régimen anterior a la
-- reforma DOF 16/07/2025: umbral de intercambio de activos virtuales quince
-- veces más alto que el legal, sin la regla de contraprestación, y con ninguna
-- tipología marcada como supuesto de Aviso, así que ningún acto entraba al
-- aviso mensual.
--
-- Todo lo de aquí es copia literal de esas migrations, idempotente por
-- `where not exists` o por comparación con el valor viejo. Sobre una base que
-- ya las tenga aplicadas no cambia una sola fila.
-- =====================================================================

do $$
declare
  v_org uuid := '11111111-1111-1111-1111-111111111111';  -- Ixim Pay
  v_fuente text := 'Art. 17 fr. XVI LFPIORPI, reforma DOF 16/07/2025. '
                || 'Informe Kawiil-Cumplimiento 31/08/2026.';
begin
  if not exists (select 1 from public.organizations where id = v_org) then
    return;
  end if;

  -- ------------------------------------------------------------------
  -- 0033 · XVI-01 pasa de 645 a 210 UMA, y gana la ventana de seis meses
  -- ------------------------------------------------------------------
  -- Se versiona, no se corrige en sitio: los hallazgos que existan se
  -- generaron con la v1 y tienen que poder explicarse con la regla que los
  -- produjo.
  update public.tipologia_av set activa = false
   where organization_id = v_org and sector = 'XVI' and codigo = 'XVI-01' and version = 1;

  insert into public.tipologia_av
    (id, organization_id, sector, codigo, nombre, descripcion, regla_dsl,
     severidad, version, fuente, genera_aviso)
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
         'alta', 2, v_fuente, true
   where not exists (select 1 from public.tipologia_av
                      where organization_id = v_org and sector = 'XVI'
                        and codigo = 'XVI-01' and version = 2);

  -- ------------------------------------------------------------------
  -- 0033 · XVI-09, el inciso b) que no tenía regla
  -- ------------------------------------------------------------------
  insert into public.tipologia_av
    (id, organization_id, sector, codigo, nombre, descripcion, regla_dsl,
     severidad, version, fuente, genera_aviso)
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
         'alta', 1, v_fuente, true
   where not exists (select 1 from public.tipologia_av
                      where organization_id = v_org and sector = 'XVI' and codigo = 'XVI-09');
end $$;

-- ---------------------------------------------------------------------
-- 0031 · La clave del padrón sale del RFC
-- ---------------------------------------------------------------------
-- Regla VC22R1 del instructivo del layout: «La clave del campo debe ser el
-- Registro Federal de Contribuyentes (RFC) con Homoclave del Sujeto Obligado.»
-- No se adivina: se deriva. Sólo si el RFC tiene forma de RFC.
update public.organizations
   set clave_sujeto_obligado = upper(btrim(rfc))
 where clave_sujeto_obligado is null
   and rfc is not null
   and length(btrim(rfc)) between 12 and 13;

-- ---------------------------------------------------------------------
-- 0035 · Qué tipologías son supuesto de Aviso
-- ---------------------------------------------------------------------
-- Los seeds 03 y 08 ya las siembran marcadas. Esto cubre las que vengan de
-- otra parte —una organización dada de alta a mano, una tipología copiada de
-- otro proyecto— para que no queden fuera del aviso en silencio.
update public.tipologia_av
   set genera_aviso = true
 where (codigo in ('XII-01', 'XII-02', 'XII-04', 'XII-05')
        or (codigo = 'XVI-01' and version >= 2)
        or codigo = 'XVI-09')
   and genera_aviso = false;

-- ---------------------------------------------------------------------
-- Comprobación: sin esto el proyecto no sirve
-- ---------------------------------------------------------------------
-- El Motor PLD se niega a correr sin UMA vigente, y con razón: calcular
-- umbrales con un valor inventado produce hallazgos falsos o los esconde.
-- Que el seed termine en silencio dejando la tabla vacía es justo lo que pasó.
do $$
declare v_n int;
begin
  select count(*) into v_n from public.parametro_regulatorio
   where codigo = 'uma_diaria' and vigente_hasta is null;
  if v_n = 0 then
    raise exception 'No quedó una UMA vigente en parametro_regulatorio. Sin ella el '
                    'Motor PLD no corre. Revisa que el seed 10 se haya aplicado.';
  end if;

  select count(*) into v_n from public.tipologia_av where genera_aviso;
  if v_n = 0 then
    raise warning 'Ninguna tipología quedó marcada como supuesto de Aviso: ningún acto '
                  'entrará al aviso mensual. Revisa los seeds 03 y 08.';
  end if;
end $$;
