// =====================================================================
// Edge Function · motor-pld
// =====================================================================
// El Motor PLD evalúa las tipologías activas contra las operaciones de
// una organización y genera hallazgos. Es idempotente: si se vuelve a
// correr no duplica hallazgos (constraint operation_id+tipologia_id+version).
//
// Se invoca por:
//   - Trigger automático tras insert en `operation` (vía DB trigger o queue)
//   - Botón "Recorrer motor" en el panel del OC
//   - Cron diario para reglas agregadas (volumen mensual, etc.)
//
// RCG0.B0: implementa los evaluadores reales de regla_dsl (antes stub de
// Sprint D-1). La lógica de evaluación vive en `./evaluadores.ts` (módulo
// puro, testeado con vitest en src/test/motor-evaluadores.test.ts).
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  correrMotor,
  type HistorialCliente,
  type HallazgoCandidato,
  type MotorContext,
  type OperacionEval,
  type Tipologia,
} from './evaluadores.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RunInput {
  organization_id: string;
  trigger_tipo: 'on_insert' | 'manual' | 'cron';
  operation_id?: string;
}

// Estados en los que un hallazgo sigue en la bandeja del OC: nadie lo ha
// juzgado todavía. Son los únicos que se pueden reversionar en sitio.
const ESTADOS_ABIERTOS = new Set(['abierto', 'en_revision']);

// CORS: el navegador manda un preflight OPTIONS antes del POST de
// supabase.functions.invoke. Sin estos headers el preflight falla (405) y el
// POST real nunca se envía.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  // Preflight CORS.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const input: RunInput = await req.json();
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const t0 = Date.now();

  // --- 1. Tipologías activas de la organización -----------------------
  const { data: tipologiasRaw, error: errTips } = await supabase
    .from('tipologia_av')
    .select('id, codigo, nombre, version, severidad, activa, genera_aviso, regla_dsl')
    .eq('organization_id', input.organization_id)
    .eq('activa', true);
  if (errTips) {
    return json({ error: errTips.message }, 500);
  }

  // --- 2. Operaciones (+ cliente) ------------------------------------
  // Paginado, y no por prolijidad: PostgREST corta en su tope de filas por
  // omisión y no avisa. Con la respuesta truncada, el motor evaluaría sólo las
  // primeras operaciones de la organización —una regla agregada mediría su
  // ventana con la mitad de los datos— y, desde que existe `evaluada_en`, las
  // que quedaran fuera del corte NUNCA recibirían constancia: el aviso mensual
  // se quedaría bloqueado y el botón "Evaluar ahora" no podría desbloquearlo
  // por más veces que se pulsara.
  const PAGINA = 1000;
  const operacionesRaw: unknown[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    let opQuery = supabase
      .from('operation')
      .select('id, organization_id, client_id, tipo, monto_mxn, contraprestacion_mxn, activo_virtual, contraparte, fecha, client:client_id(datos_kyc)')
      .eq('organization_id', input.organization_id)
      // Orden estable: sin él, dos páginas pueden repetir y omitir filas.
      .order('id')
      .range(desde, desde + PAGINA - 1);
    if (input.operation_id) opQuery = opQuery.eq('id', input.operation_id);
    const { data, error: errOps } = await opQuery;
    if (errOps) {
      return json({ error: errOps.message }, 500);
    }
    const lote = data ?? [];
    operacionesRaw.push(...lote);
    if (lote.length < PAGINA) break;
  }

  // --- 3. UMA vigente ------------------------------------------------
  // Antes era una constante en este archivo (113.07), duplicada en el front y
  // contradicha por el mock que veía el usuario (132.59). Ahora sale de
  // `parametro_regulatorio` (migration 0011), con la vigencia que corresponde.
  //
  // Se resuelve a la fecha de HOY, no a la del acto: el motor evalúa
  // operaciones al momento de correr. Recalcular un acto viejo con la UMA que
  // le tocaba es un caso aparte, y para eso está `parametro_vigente(codigo, fecha)`.
  //
  // Sin UMA vigente el motor NO corre. Fallar es correcto: calcular umbrales
  // con un valor inventado produciría hallazgos falsos o los ocultaría.
  const { data: umaRow, error: errUma } = await supabase
    .rpc('parametro_vigente', { p_codigo: 'uma_diaria' });
  if (errUma) {
    return json({ error: `No se pudo leer la UMA vigente: ${errUma.message}` }, 500);
  }
  const umaMxn = Number(umaRow);

  // El histórico de la UMA, no sólo la de hoy. La ley mide cada acto con la
  // vigente EN SU FECHA (art. 17 y criterio de cumplimiento del 31/08/2026), y
  // la UMA cambia cada 1 de febrero: sin esto, un acto de enero se juzgaba con
  // la UMA que entró en febrero y el mismo acto cruzaba o no el umbral según
  // cuándo corriera el motor.
  const { data: vigenciasUma } = await supabase
    .from('parametro_regulatorio')
    .select('valor_numerico, vigente_desde')
    .eq('codigo', 'uma_diaria')
    .eq('sector', '*')
    .order('vigente_desde', { ascending: false });

  const umaVigencias = (vigenciasUma ?? []).map((v) => ({
    desde: String(v.vigente_desde),
    valor: Number(v.valor_numerico),
  }));
  if (!Number.isFinite(umaMxn) || umaMxn <= 0) {
    return json(
      {
        error:
          'No hay una UMA vigente en parametro_regulatorio. El motor no puede calcular umbrales sin ella.',
      },
      422,
    );
  }

  // --- 3. Catálogo de países por fuente (para lookup XVI-04) ----------
  const { data: paises, error: errPaises } = await supabase
    .from('country_risk_list')
    .select('iso2, fuente')
    .eq('organization_id', input.organization_id);
  if (errPaises) {
    return json({ error: errPaises.message }, 500);
  }

  const paisPorFuente: Record<string, Set<string>> = {};
  for (const p of paises ?? []) {
    (paisPorFuente[p.fuente] ??= new Set()).add(String(p.iso2).toUpperCase());
  }

  // Perfil transaccional mensual declarado (para desviacion XVI-07).
  const perfilMensualUmaPorCliente: Record<string, number> = {};
  const operaciones: OperacionEval[] = (operacionesRaw ?? []).map((o: Record<string, unknown>) => {
    const cliente = o.client as { datos_kyc?: Record<string, unknown> } | null;
    const perfil = Number(cliente?.datos_kyc?.perfil_transaccional_mensual_uma);
    if (Number.isFinite(perfil) && perfil > 0) {
      perfilMensualUmaPorCliente[String(o.client_id)] = perfil;
    }
    return {
      id: String(o.id),
      organization_id: String(o.organization_id),
      client_id: String(o.client_id),
      tipo: String(o.tipo),
      monto_mxn: Number(o.monto_mxn),
      // Null se conserva como null, no como cero: «no se capturó la comisión»
      // y «la comisión fue cero» son cosas distintas, y la regla del inciso b)
      // de la fracción XVI sólo debe disparar sobre lo primero si se capturó.
      contraprestacion_mxn: o.contraprestacion_mxn == null ? null : Number(o.contraprestacion_mxn),
      activo_virtual: (o.activo_virtual as string | null) ?? null,
      contraparte: (o.contraparte as Record<string, unknown> | null) ?? null,
      fecha: String(o.fecha),
    };
  });

  // --- Historial de cada cliente ------------------------------------
  // Una regla de comportamiento sobre un cliente sin trayectoria no mide nada:
  // «se desvió de su patrón» exige que exista un patrón. Sin esto, las reglas
  // dispararían en las primeras operaciones de todo cliente nuevo, que es
  // justo el falso positivo que hay que evitar.
  //
  // Se consultan TODAS las operaciones de la organización, no sólo las que se
  // están evaluando: el historial es precisamente lo que queda fuera de la
  // ventana bajo examen.
  // TODO[Sprint D-3]: mover a una vista materializada cuando el volumen lo pida.
  const { data: historialRaw, error: errHist } = await supabase
    .from('operation')
    .select('client_id, fecha, monto_mxn')
    .eq('organization_id', input.organization_id);
  if (errHist) {
    return json({ error: `No se pudo leer el historial: ${errHist.message}` }, 500);
  }

  // Qué clientes tienen su matriz de riesgo evaluada. Un hallazgo sobre un
  // cliente sin clasificar le dice al OC que la debida diligencia va
  // incompleta, y eso cambia cómo lo atiende.
  // La calificación del onboarding es la línea base que SÍ existe desde el día
  // uno: el historial transaccional tarda en formarse, pero la matriz está
  // desde que se integra el expediente. Se toma la evaluación más reciente.
  const { data: evaluados } = await supabase
    .from('client_risk_assessment')
    .select('client_id, clasificacion, evaluado_en')
    .order('evaluado_en', { ascending: false });
  const clasificacionPorCliente: Record<string, string> = {};
  for (const e of (evaluados ?? []) as Record<string, unknown>[]) {
    const cid = String(e.client_id);
    if (!(cid in clasificacionPorCliente)) clasificacionPorCliente[cid] = String(e.clasificacion);
  }
  const conMatriz = new Set(Object.keys(clasificacionPorCliente));

  const idsEvaluadas = new Set((operacionesRaw ?? []).map((o: Record<string, unknown>) => String(o.id)));
  const porCliente: Record<string, { fechas: number[]; montos: number[] }> = {};
  for (const h of (historialRaw ?? []) as Record<string, unknown>[]) {
    const cid = String(h.client_id);
    (porCliente[cid] ??= { fechas: [], montos: [] });
    porCliente[cid].fechas.push(new Date(String(h.fecha)).getTime());
    porCliente[cid].montos.push(Number(h.monto_mxn));
  }

  const inicioMesActual = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const historialPorCliente: Record<string, HistorialCliente> = {};

  for (const [cid, datos] of Object.entries(porCliente)) {
    const fechasPrevias = datos.fechas.filter((f) => f < inicioMesActual);
    // Meses distintos con actividad: cincuenta operaciones en una semana no
    // son cinco meses de patrón.
    const meses = new Set(
      fechasPrevias.map((f) => {
        const d = new Date(f);
        return `${d.getFullYear()}-${d.getMonth()}`;
      }),
    );
    // Días distintos con actividad. Es la medida fina: un patrón puede armarse
    // en una semana, y exigir meses lo volvería invisible.
    const dias = new Set(fechasPrevias.map((f) => new Date(f).toISOString().slice(0, 10)));
    const sumaPrevia = datos.fechas.reduce(
      (s, f, i) => (f < inicioMesActual ? s + datos.montos[i] : s), 0,
    );
    const primera = datos.fechas.length ? Math.min(...datos.fechas) : Date.now();

    historialPorCliente[cid] = {
      // «Previas» = todo lo que no está en el lote que se evalúa ahora.
      operacionesPrevias: datos.fechas.length - (
        (operacionesRaw ?? []).filter(
          (o: Record<string, unknown>) => String(o.client_id) === cid && idsEvaluadas.has(String(o.id)),
        ).length
      ),
      diasDeHistorial: Math.max(0, Math.floor((Date.now() - primera) / 86400000)),
      mesesConActividad: meses.size,
      tienePerfilDeclarado: perfilMensualUmaPorCliente[cid] != null,
      tieneMatrizEvaluada: conMatriz.has(cid),
      promedioMensualUmaHistorico:
        meses.size > 0 ? sumaPrevia / umaMxn / meses.size : 0,
      diasConActividad: dias.size,
      clasificacionRiesgo:
        (clasificacionPorCliente[cid] as HistorialCliente['clasificacionRiesgo']) ?? null,
    };
  }

  const tipologias = (tipologiasRaw ?? []) as unknown as Tipologia[];

  const ctx: MotorContext = {
    umaMxn,
    umaVigencias,
    ahora: new Date(),
    paisPorFuente,
    perfilMensualUmaPorCliente,
    historialPorCliente,
  };

  // --- 4. Correr el motor --------------------------------------------
  const { candidatos, porTipologia, tiposNoSoportados } = correrMotor(tipologias, operaciones, ctx);

  // --- 5. Cotejar contra lo que ya existe ----------------------------
  // Tres desenlaces por candidato, y sólo el primero era el que estaba escrito:
  //
  //   Ya existe idéntico (misma operación, misma tipología, misma versión):
  //     no se toca. Es la idempotencia que permite recorrer el motor las veces
  //     que haga falta sin llenar la bandeja de copias.
  //
  //   Existe el MISMO hallazgo bajo otra versión de la regla, todavía abierto:
  //     se reversiona en sitio. Al versionar XII-01 y XII-05 en la 0031 —el
  //     criterio legal no cambió, cambió la forma de medirlo— el hallazgo v1
  //     seguía abierto y el recorrido añadía el v2 al lado. El OC veía dos
  //     renglones del mismo acto y la misma tipología, y tenía que adivinar
  //     cuál atender. Es el mismo hecho juzgado con la regla corregida: se
  //     conserva el renglón, con su folio, su asignación y su compromiso, y se
  //     le cambia la versión.
  //
  //   Existe pero YA LO RESOLVIÓ el OC, y la versión nueva vuelve a disparar:
  //     se crea nuevo. Aquí sí hay algo que nadie ha juzgado —la regla
  //     corregida dice algo sobre un acto que se cerró bajo la anterior— y
  //     reescribir el resuelto borraría la decisión del OC.
  const opIds = [...new Set(candidatos.map((c) => c.operation_id).filter(Boolean))] as string[];
  interface FilaHallazgo {
    id: string;
    operation_id: string;
    tipologia_id: string;
    tipologia_codigo: string;
    tipologia_version: number;
    estado: string;
  }
  let existentes: FilaHallazgo[] = [];
  if (opIds.length) {
    const { data: exist } = await supabase
      .from('hallazgo')
      .select('id, operation_id, tipologia_id, tipologia_codigo, tipologia_version, estado')
      .eq('organization_id', input.organization_id)
      .in('operation_id', opIds);
    existentes = (exist ?? []) as FilaHallazgo[];
  }

  const identicos = new Set(
    existentes.map((e) => `${e.operation_id}|${e.tipologia_id}|${e.tipologia_version}`),
  );
  // Abiertos por operación y CÓDIGO de tipología, no por id: es justo cruzar
  // versiones lo que se quiere detectar.
  const abiertosPorCodigo = new Map<string, FilaHallazgo[]>();
  for (const e of existentes) {
    if (!ESTADOS_ABIERTOS.has(e.estado)) continue;
    const k = `${e.operation_id}|${e.tipologia_codigo}`;
    const lista = abiertosPorCodigo.get(k);
    if (lista) lista.push(e);
    else abiertosPorCodigo.set(k, [e]);
  }

  const porInsertar: HallazgoCandidato[] = [];
  const porReversionar: { fila: FilaHallazgo; c: HallazgoCandidato }[] = [];
  // Un hallazgo abierto sólo puede absorber a UN candidato: sin esto, dos
  // versiones activas del mismo código lo reescribirían una encima de la otra
  // y la segunda desaparecería sin dejar rastro.
  const tomados = new Set<string>();

  for (const c of candidatos) {
    if (c.operation_id && identicos.has(`${c.operation_id}|${c.tipologia_id}|${c.tipologia_version}`)) {
      continue;
    }
    const abiertos = c.operation_id
      ? (abiertosPorCodigo.get(`${c.operation_id}|${c.tipologia_codigo}`) ?? [])
      : [];
    const previo = abiertos.find((e) => !tomados.has(e.id) && e.tipologia_id !== c.tipologia_id);
    if (previo) {
      tomados.add(previo.id);
      porReversionar.push({ fila: previo, c });
    } else {
      porInsertar.push(c);
    }
  }

  // --- 6. Escribir hallazgos -----------------------------------------
  let hallazgos_creados = 0;
  if (porInsertar.length) {
    const filas = porInsertar.map((c: HallazgoCandidato) => ({
      organization_id: input.organization_id,
      operation_id: c.operation_id,
      client_id: c.client_id,
      tipologia_id: c.tipologia_id,
      tipologia_codigo: c.tipologia_codigo,
      tipologia_nombre: c.tipologia_nombre,
      tipologia_version: c.tipologia_version,
      severidad: c.severidad,
      regla_payload: c.regla_payload,
      estado: 'abierto',
      // SLA operativo de la bandeja del OC, derivado de la forma de la regla
      // (migration 0007). El trigger de BD lo recalcularía igual si llegara
      // nulo; se manda explícito para que el motor sea la fuente visible.
      clasificacion_urgencia: c.clasificacion_urgencia,
    }));
    const { data: insertados, error: errIns } = await supabase.from('hallazgo').insert(filas).select('id');
    if (errIns) {
      return json({ error: errIns.message }, 500);
    }
    hallazgos_creados = insertados?.length ?? 0;
  }

  // El folio, la asignación, el plan de trabajo y la fecha de compromiso NO se
  // tocan: son trabajo del OC sobre un hallazgo que sigue siendo el mismo.
  let hallazgos_reversionados = 0;
  for (const { fila, c } of porReversionar) {
    const { error: errUpd } = await supabase
      .from('hallazgo')
      .update({
        tipologia_id: c.tipologia_id,
        tipologia_nombre: c.tipologia_nombre,
        tipologia_version: c.tipologia_version,
        severidad: c.severidad,
        regla_payload: c.regla_payload,
        clasificacion_urgencia: c.clasificacion_urgencia,
      })
      .eq('id', fila.id)
      .eq('organization_id', input.organization_id);
    if (errUpd) {
      return json({ error: errUpd.message }, 500);
    }
    hallazgos_reversionados++;
  }

  // --- 7. Marcar las operaciones que obligan a avisar ----------------
  // Antes se marcaba por severidad alta o crítica. Severidad es prioridad de
  // bandeja; la obligación de avisar es un hecho legal. Ahora se lee de
  // `tipologia_av.genera_aviso` (migration 0035): las tipologías que sí
  // corresponden a un supuesto del artículo 17.
  //
  // La diferencia se ve en XII-03 y XVI-04, "contraparte en país de alto
  // riesgo": son críticas, el OC las mira primero, y no vuelven reportable un
  // acto que no rebasó umbral ni cae en supuesto.
  // Cuántos hallazgos traen la bandera de fraccionamiento. Va al resumen de la
  // corrida porque es el número que el OC necesita ver primero: no es lo mismo
  // «tres hallazgos por umbral» que «tres hallazgos, y uno es fraccionamiento».
  const fraccionamientos = candidatos.filter(
    (c) => (c.regla_payload as { posible_fraccionamiento?: boolean }).posible_fraccionamiento,
  ).length;

  const generaAviso = new Map(tipologias.map((t) => [t.id, t.genera_aviso === true]));

  // TODAS las operaciones de la ventana que disparó, no sólo la que la cerró.
  //
  // Una regla agregada produce UN candidato por grupo, anclado en la operación
  // que cierra la primera ventana que cumple; las demás de esa ventana viajan
  // en `regla_payload.operaciones`. Si sólo se mirara `operation_id`, dos
  // fideicomisos que juntos cruzan las 4,000 UMA dejarían uno marcado y el
  // otro no —y desde que el recorrido completo es autoritativo, el otro se
  // DESMARCARÍA activamente—, cuando la obligación nació de los dos.
  const opsAviso = new Set<string>();
  for (const c of candidatos) {
    if (!generaAviso.get(c.tipologia_id)) continue;
    if (c.operation_id) opsAviso.add(c.operation_id);
    const dentro = (c.regla_payload as { operaciones?: unknown })?.operaciones;
    if (Array.isArray(dentro)) {
      for (const id of dentro) if (typeof id === 'string') opsAviso.add(id);
    }
  }

  // El motor sólo levantaba la marca, nunca la bajaba, y eso convertía la
  // determinación en un trinquete: una operación marcada por la heurística de
  // severidad —o por una regla que después se corrigió, como XII-04 cuando
  // cotejaba un solo tipo de acto— se quedaba marcada para siempre y ningún
  // recorrido posterior podía desmarcarla. Corregir la regla no corregía lo
  // que la regla vieja había declarado.
  //
  // Ahora el recorrido es autoritativo sobre lo que evaluó: cada operación
  // queda con lo que dicen las tipologías vigentes HOY. Nadie más escribe esta
  // columna, así que no hay decisión humana que se pueda pisar.
  //
  // `identificada_en` sólo se toca al levantar la marca, y al bajarla se
  // limpia: es la fecha en que se identificó la obligación, y si la obligación
  // ya no existe, esa fecha no fecha nada.
  // Con una salvedad: bajar la marca sólo lo puede hacer un recorrido COMPLETO.
  // Una corrida acotada a una operación —la que dispara el alta— no ve las
  // demás del cliente, así que una regla agregada no puede alcanzar su umbral
  // aunque en conjunto lo alcance. Concluir "no requiere aviso" desde ahí sería
  // concluirlo sin haber mirado la evidencia. Levantarla sí puede: para eso le
  // basta lo que tiene delante.
  const recorridoCompleto = !input.operation_id;
  const marcadas = operaciones.filter((o) => opsAviso.has(o.id)).map((o) => o.id);
  const desmarcadas = recorridoCompleto
    ? operaciones.filter((o) => !opsAviso.has(o.id)).map((o) => o.id)
    : [];

  // En tandas: `in` con miles de uuids desborda la URL del PostgREST.
  async function marcar(ids: string[], requiere: boolean): Promise<string | null> {
    for (let i = 0; i < ids.length; i += 500) {
      const { error } = await supabase
        .from('operation')
        .update({
          requiere_aviso: requiere,
          identificada_en: requiere ? new Date().toISOString() : null,
        })
        .in('id', ids.slice(i, i + 500))
        .eq('organization_id', input.organization_id)
        // Sólo las que cambian: sin esto cada recorrido reescribe
        // identificada_en de todo y se pierde cuándo nació la obligación.
        .eq('requiere_aviso', !requiere);
      if (error) return error.message;
    }
    return null;
  }

  const errMarca = (await marcar(marcadas, true)) ?? (await marcar(desmarcadas, false));
  if (errMarca) {
    return json({ error: errMarca }, 500);
  }

  // --- 8. Dejar constancia de que se evaluaron -----------------------
  // Todas las que el recorrido alcanzó, encontrara algo o no. Sin esto, un acto
  // examinado y limpio se ve igual que uno que nadie miró, y la pantalla del
  // aviso mensual concluía el mes en ceros sobre actos sin juzgar.
  //
  // Sólo la sella un recorrido COMPLETO, por lo mismo que sólo un recorrido
  // completo puede bajar la marca de aviso: la corrida del alta ve UNA
  // operación, así que una regla agregada mide su ventana con un solo dato.
  // Puede levantar la marca —para eso le basta— pero no puede firmar que el
  // acto quedó juzgado. Sellarlo ahí pondría constancia de una evaluación
  // parcial, y esa constancia es justo lo que la pantalla del aviso lee para
  // decidir si el mes se puede dar por vacío.
  //
  // El efecto práctico: cerrar el mes pasa por recorrer el motor sobre el
  // periodo, con el botón de la propia pantalla del aviso o el de la bandeja
  // del OC. Que sea un paso explícito es correcto: es la determinación.
  let operaciones_evaluadas = 0;
  if (recorridoCompleto) {
    const evaluadas = operaciones.map((o) => o.id);
    const evaluadaEn = new Date().toISOString();
    // En tandas: `in` con miles de uuids desborda la URL del PostgREST.
    for (let i = 0; i < evaluadas.length; i += 500) {
      const { error: errEval } = await supabase
        .from('operation')
        .update({ evaluada_en: evaluadaEn })
        .in('id', evaluadas.slice(i, i + 500))
        .eq('organization_id', input.organization_id);
      if (errEval) {
        return json({ error: errEval.message }, 500);
      }
    }
    operaciones_evaluadas = evaluadas.length;
  }

  const duracion_ms = Date.now() - t0;

  // --- 9. Registrar la corrida ---------------------------------------
  await supabase.from('motor_run').insert({
    organization_id: input.organization_id,
    trigger_tipo: input.trigger_tipo,
    operaciones_procesadas: operaciones.length,
    hallazgos_creados,
    duracion_ms,
    metadata: {
      tipologias_evaluadas: tipologias.length,
      por_tipologia: porTipologia,
      tipos_no_soportados: tiposNoSoportados,
      operaciones_marcadas_aviso: opsAviso.size,
      posible_fraccionamiento: fraccionamientos,
      operaciones_evaluadas,
      recorrido_completo: recorridoCompleto,
      hallazgos_reversionados,
    },
  });

  return json({
    ok: true,
    operaciones_procesadas: operaciones.length,
    hallazgos_creados,
    hallazgos_reversionados,
    por_tipologia: porTipologia,
    operaciones_marcadas_aviso: opsAviso.size,
    posible_fraccionamiento: fraccionamientos,
    operaciones_evaluadas,
    duracion_ms,
  });
});

export {};
