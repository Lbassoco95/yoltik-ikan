-- =====================================================================
-- Ikán · Aplicar migration 0035 en el SQL Editor
-- =====================================================================
-- QUÉ ARREGLA
--
-- La pantalla del aviso mensual de la notaría de demostración, con cuatro
-- actos capturados en agosto, mostraba cero actos reportables y ofrecía el
-- botón de informe en ceros. Un aviso en ceros declara ante el SAT que no
-- hubo operaciones reportables en el mes. De esos cuatro actos, dos sí lo
-- eran: un poder irrevocable y una constitución de persona moral, que desde
-- la reforma DOF 16/07/2025 se avisan siempre y sin umbral de monto.
--
-- La regla que impide un informe en ceros falso estaba escrita y funcionando.
-- Lo que le llegaba mal era el dato de entrada, por dos motivos distintos:
--
--   1. `requiere_aviso` arranca en false y sólo el motor lo levanta, así que
--      un acto que el motor nunca recorrió se veía exactamente igual que uno
--      que examinó y descartó. La columna `evaluada_en` separa las dos cosas.
--
--   2. El motor marcaba `requiere_aviso` por severidad alta o crítica.
--      Severidad es prioridad de bandeja; la obligación de avisar es un hecho
--      legal. La columna `genera_aviso` de la tipología dice cuáles son
--      supuestos del artículo 17.
--
-- QUÉ HACE ESTE ARCHIVO
--
-- Dos columnas, un índice, una marca sobre cinco códigos de tipología y un
-- evento por organización. NO borra nada, no toca ningún monto y no cambia
-- ningún umbral. Idempotente y en transacción.
--
-- QUÉ ESPERAR DESPUÉS DE APLICARLA
--
-- Todas las operaciones quedan con `evaluada_en` en nulo, incluidas las que
-- el motor sí recorrió alguna vez. Es deliberado: rellenarlo por inferencia
-- diría que fueron juzgadas con los umbrales de hoy, cuando lo fueron con los
-- derogados que corrigieron la 0030 y la 0033.
--
-- El efecto visible es que el aviso mensual va a bloquear el informe en ceros
-- hasta que alguien recorra el motor. Eso se resuelve con un botón —"Evaluar
-- ahora" en la pantalla del aviso, o "Recorrer motor" en la bandeja del OC—
-- y no requiere volver a abrir la base.
--
-- ORDEN: aplicar esto ANTES de desplegar la Edge Function motor-pld, que ya
-- escribe las dos columnas. Al revés, el motor falla al escribir en columnas
-- que no existen.
-- =====================================================================

begin;

-- =====================================================================
-- 0035 · Lo que obliga a avisar deja de deducirse de la severidad
-- =====================================================================
-- La pantalla del aviso mensual de una notaría con cuatro actos capturados
-- mostraba cero actos reportables y ofrecía presentar en ceros. Un aviso en
-- ceros declara ante el SAT que no hubo operaciones reportables en el mes.
-- De esos cuatro actos, dos lo eran: un poder irrevocable y una constitución
-- de persona moral, que desde la reforma DOF 16/07/2025 se avisan siempre.
--
-- El módulo `aviso-mensual.ts` existe precisamente para impedir eso y estaba
-- funcionando bien. Lo que le llegaba mal era el dato: `operation.requiere_aviso`.
-- Dos defectos independientes, y los dos terminan en la misma declaración falsa.
--
-- ---------------------------------------------------------------------
-- Defecto 1 · Nunca evaluada se veía igual que evaluada y limpia
-- ---------------------------------------------------------------------
-- `requiere_aviso` arranca en false y sólo el motor lo levanta. Un acto que
-- el motor jamás recorrió —sembrado por SQL, capturado mientras la Edge
-- Function estaba caída, o anterior a que se corrigieran los umbrales en la
-- 0030— es indistinguible de uno que el motor examinó y descartó. El primero
-- no tiene respuesta; el segundo tiene una. La pantalla trataba a los dos como
-- "no reportable" y concluía el mes en ceros.
--
-- `evaluada_en` separa las dos cosas. Nulo quiere decir que nadie ha juzgado
-- este acto, y eso no permite concluir nada sobre el mes.
--
-- Se deja NULO en todo lo existente a propósito, aunque eso marque como no
-- evaluados actos que sí se recorrieron alguna vez. Rellenarlo por inferencia
-- —"si tiene identificada_en, ponle esa fecha"— fabricaría constancia de una
-- evaluación cuya fecha nadie registró, y sobre todo diría que fueron juzgados
-- con los umbrales de hoy cuando lo fueron con los derogados. Un recorrido del
-- motor lo llena con la verdad.
--
-- ---------------------------------------------------------------------
-- Defecto 2 · La obligación se leía de la severidad
-- ---------------------------------------------------------------------
-- El motor marcaba `requiere_aviso` cuando la operación disparaba una tipología
-- de severidad alta o crítica. Severidad es prioridad de bandeja: con qué
-- urgencia el OC debe mirarlo. Obligación de avisar es un hecho legal. Que
-- coincidieran en la mayoría de los casos es una coincidencia del seed, no una
-- equivalencia.
--
-- Se separan en los dos sentidos:
--
--   XII-03 y XVI-04 (compareciente o contraparte en país de alto riesgo) son
--   'critica' y marcaban requiere_aviso. Un país de alto riesgo es una señal
--   de riesgo que el OC debe mirar YA; no vuelve reportable un acto que no
--   rebasó umbral ni cae en supuesto.
--
--   Y al revés: bajar una tipología de supuesto a severidad media —una decisión
--   de triage, perfectamente razonable— la habría sacado en silencio del aviso.
--
-- `genera_aviso` dice cuáles son supuestos del artículo 17. Es dato de la
-- tipología, versionado con ella, y lo aprueba el OC como cualquier otro cambio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Constancia de evaluación
-- ---------------------------------------------------------------------
alter table operation
  add column if not exists evaluada_en timestamptz;

comment on column operation.evaluada_en is
  'Cuándo el Motor PLD recorrió esta operación, haya encontrado algo o no. '
  'Nulo = nadie la ha juzgado; no permite concluir que no sea reportable. '
  'Distinto de identificada_en, que sólo se llena cuando SÍ requiere aviso.';

-- Las no evaluadas de cada organización, que es lo que la pantalla del aviso
-- pregunta al abrir el periodo.
create index if not exists idx_operation_sin_evaluar
  on operation(organization_id, fecha)
  where evaluada_en is null;

-- ---------------------------------------------------------------------
-- 2. Qué tipologías son supuestos de aviso
-- ---------------------------------------------------------------------
alter table tipologia_av
  add column if not exists genera_aviso boolean not null default false;

comment on column tipologia_av.genera_aviso is
  'La tipología corresponde a un supuesto de Aviso del art. 17 LFPIORPI: '
  'dispararla vuelve reportable la operación. False = señal de riesgo para '
  'la bandeja del OC, que no crea por sí sola obligación de avisar.';

-- Fracción XII, apartado A del artículo 17, reforma DOF 16/07/2025:
--   XII-01 inciso a) transmisión de inmueble, desde 8,000 UMA
--   XII-02 inciso b) poder irrevocable, siempre
--   XII-04 inciso c) persona moral: constitución o cambio patrimonial, siempre
--   XII-05 inciso d) fideicomiso traslativo o de garantía, desde 4,000 UMA
-- XII-03 (país de alto riesgo) NO está: no es un supuesto del artículo.
--
-- Todas las versiones de cada código: la obligación no la crea la versión de la
-- regla, la crea la ley, y una v1 todavía abierta debe seguir contando.
update tipologia_av
   set genera_aviso = true
 where codigo in ('XII-01', 'XII-02', 'XII-04', 'XII-05')
   and genera_aviso = false;

-- Fracción XVI, artículo 17:
--   XVI-01 inciso a) intercambio de activos virtuales, desde 210 UMA
--   XVI-09 inciso b) contraprestación cobrada, desde 4 UMA
-- Las dos las creó la 0033.
--
-- XVI-01 se marca DESDE LA VERSIÓN 2, y aquí sí importa la versión: la v1 se
-- llamaba "Structuring (fraccionamiento)" y era una regla de comportamiento
-- —645 UMA acumuladas en 72 horas— no un supuesto de la ley. La 0033 la
-- desactivó y reutilizó el código para el umbral legal. Marcar por código a
-- secas le pondría la marca a una regla que nunca fue eso.
--
-- XVI-02 a XVI-08 son tipologías de comportamiento —layering, exposición
-- on-chain, mixers, privacy coins— y ninguna es supuesto de Aviso por sí misma.
update tipologia_av
   set genera_aviso = true
 where ((codigo = 'XVI-01' and version >= 2) or codigo = 'XVI-09')
   and genera_aviso = false;

-- ---------------------------------------------------------------------
-- 3. XII-04 mira los cinco actos que su propia descripción declara
-- ---------------------------------------------------------------------
-- La tipología se llama "Persona moral: constitución o cambio patrimonial" y su
-- descripción enumera constitución, modificación patrimonial por aumento o
-- disminución de capital, fusión, escisión y compraventa de acciones o partes
-- sociales. Su regla cotejaba UN valor: 'constitucion_personas_morales'.
--
-- Los otros cuatro son tipos de acto propios en el layout del SAT (la 0031 los
-- dejó con los valores oficiales), así que una fusión o una compraventa de
-- acciones se capturaba, no disparaba nada, y quedaba fuera del aviso. El
-- inciso c) del artículo 17 fracción XII apartado A los cubre a los cinco y sin
-- umbral de monto desde la reforma DOF 16/07/2025.
--
-- Se corrige en sitio y no se versiona, igual que hizo la 0031 con XII-01: el
-- criterio legal no cambió, cambió lo que la regla alcanzaba a ver.
update tipologia_av
   set regla_dsl = jsonb_set(
         regla_dsl, '{valores}',
         '["constitucion_personas_morales", "modificacion_patrimonial", "fusion",
           "escision", "compra_venta_acciones"]'::jsonb)
 where codigo = 'XII-04'
   and regla_dsl->>'tipo' = 'lookup'
   and regla_dsl->'valores' = '["constitucion_personas_morales"]'::jsonb;

-- ---------------------------------------------------------------------
-- 4. Bitácora
-- ---------------------------------------------------------------------
-- El cambio altera qué se declara al SAT. Queda anotado en la cadena de cada
-- organización que tenga tipologías, con el conteo real de lo que se marcó.
do $$
declare
  v_org uuid;
  v_marcadas int;
begin
  for v_org in select distinct organization_id from tipologia_av loop
    -- Una sola vez por organización. Sin esto, reaplicar el archivo añadiría
    -- un evento idéntico cada vez y la bitácora contaría cambios que no hubo.
    if exists (select 1 from evento_auditoria
                where organization_id = v_org
                  and tipo = 'obligacion_de_aviso_separada_de_severidad') then
      continue;
    end if;

    select count(*) into v_marcadas
      from tipologia_av
     where organization_id = v_org and genera_aviso;

    perform public.registrar_evento(
      v_org,
      'obligacion_de_aviso_separada_de_severidad',
      'tipologia_av',
      null,
      jsonb_build_object(
        'tipologias_marcadas', v_marcadas,
        'motivo', 'requiere_aviso se deducía de severidad alta/critica. Severidad es '
               || 'prioridad de bandeja; la obligación de avisar es un hecho legal.',
        'fundamento', 'Art. 17 fr. XII apartado A LFPIORPI, reforma DOF 16/07/2025.',
        'constancia_de_evaluacion', 'operation.evaluada_en: nulo = sin juzgar. Las '
               || 'operaciones existentes quedan en nulo hasta que el motor las recorra.',
        'xii_04_ampliada', 'La regla cotejaba sólo constitucion_personas_morales. Su '
               || 'descripción y el inciso c) cubren además modificación patrimonial, '
               || 'fusión, escisión y compraventa de acciones.'
      ),
      'sistema',
      null
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Permisos
-- ---------------------------------------------------------------------
-- ALTER DEFAULT PRIVILEGES del proyecto otorga DML directo a los roles del
-- cliente en cada columna nueva. Ninguna de las dos se escribe desde el
-- navegador: `evaluada_en` la pone el motor con la service key, y
-- `genera_aviso` va por el flujo de aprobación del OC como el resto de la
-- tipología. Las políticas de RLS ya vigentes sobre ambas tablas se conservan;
-- esto sólo confirma que la columna nueva no abre una puerta propia.
revoke insert, update, delete on tipologia_av from anon;
revoke insert, update, delete on operation from anon;

-- ---------------------------------------------------------------------
-- Comprobación antes de confirmar
-- ---------------------------------------------------------------------
-- Seis códigos marcados y ninguno de más: XII-01, XII-02, XII-04, XII-05,
-- XVI-01 (sólo v2 en adelante) y XVI-09. Si aparece XII-03, XVI-01 v1, o
-- cualquiera de XVI-02..XVI-08, algo se marcó de sobra y hay que mirarlo antes
-- del commit: volvería reportable un acto que no cae en ningún supuesto.
select codigo, version, severidad, genera_aviso
  from tipologia_av
 order by genera_aviso desc, codigo, version;

-- Cuántas operaciones quedan pendientes de evaluar, por organización. Es lo
-- que va a bloquear el informe en ceros hasta el primer recorrido del motor.
select organization_id,
       count(*) filter (where evaluada_en is null) as sin_evaluar,
       count(*) as total
  from operation
 group by organization_id
 order by sin_evaluar desc;

commit;
