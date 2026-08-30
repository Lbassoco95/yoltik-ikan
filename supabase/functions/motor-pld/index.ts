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

// Severidades que marcan la operación como candidata a aviso.
const SEVERIDADES_AVISO = new Set(['alta', 'critica']);

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
    .select('id, codigo, nombre, version, severidad, activa, regla_dsl')
    .eq('organization_id', input.organization_id)
    .eq('activa', true);
  if (errTips) {
    return json({ error: errTips.message }, 500);
  }

  // --- 2. Operaciones (+ cliente) ------------------------------------
  let opQuery = supabase
    .from('operation')
    .select('id, organization_id, client_id, tipo, monto_mxn, activo_virtual, contraparte, fecha, client:client_id(datos_kyc)')
    .eq('organization_id', input.organization_id);
  if (input.operation_id) opQuery = opQuery.eq('id', input.operation_id);
  const { data: operacionesRaw, error: errOps } = await opQuery;
  if (errOps) {
    return json({ error: errOps.message }, 500);
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
    ahora: new Date(),
    paisPorFuente,
    perfilMensualUmaPorCliente,
    historialPorCliente,
  };

  // --- 4. Correr el motor --------------------------------------------
  const { candidatos, porTipologia, tiposNoSoportados } = correrMotor(tipologias, operaciones, ctx);

  // --- 5. Filtrar candidatos ya existentes (idempotencia) ------------
  const opIds = [...new Set(candidatos.map((c) => c.operation_id).filter(Boolean))] as string[];
  let existentes: { operation_id: string; tipologia_id: string; tipologia_version: number }[] = [];
  if (opIds.length) {
    const { data: exist } = await supabase
      .from('hallazgo')
      .select('operation_id, tipologia_id, tipologia_version')
      .eq('organization_id', input.organization_id)
      .in('operation_id', opIds);
    existentes = (exist ?? []) as typeof existentes;
  }
  const claveExistente = new Set(
    existentes.map((e) => `${e.operation_id}|${e.tipologia_id}|${e.tipologia_version}`),
  );

  const nuevos = candidatos.filter(
    (c) => !claveExistente.has(`${c.operation_id}|${c.tipologia_id}|${c.tipologia_version}`),
  );

  // --- 6. Insertar hallazgos nuevos ----------------------------------
  let hallazgos_creados = 0;
  if (nuevos.length) {
    const filas = nuevos.map((c: HallazgoCandidato) => ({
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

  // --- 7. Marcar operaciones que requieren aviso ---------------------
  // Heurística B0: una operación ligada a un hallazgo de severidad alta/crítica
  // se marca requiere_aviso. La construcción del borrador de aviso queda para
  // un bloque posterior (layouts de Aviso aún no publicados por la UIF).
  const opsAviso = [
    ...new Set(
      candidatos
        .filter((c) => c.operation_id && SEVERIDADES_AVISO.has(c.severidad))
        .map((c) => c.operation_id as string),
    ),
  ];
  if (opsAviso.length) {
    await supabase
      .from('operation')
      .update({ requiere_aviso: true, identificada_en: new Date().toISOString() })
      .in('id', opsAviso)
      .eq('organization_id', input.organization_id);
  }

  const duracion_ms = Date.now() - t0;

  // --- 8. Registrar la corrida ---------------------------------------
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
      operaciones_marcadas_aviso: opsAviso.length,
    },
  });

  return json({
    ok: true,
    operaciones_procesadas: operaciones.length,
    hallazgos_creados,
    por_tipologia: porTipologia,
    operaciones_marcadas_aviso: opsAviso.length,
    duracion_ms,
  });
});

export {};
