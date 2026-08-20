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
// Sprint D-3: aquí se implementan los evaluadores por tipo de regla_dsl.
// Sprint D-1: este stub deja claro el contrato y los pasos.
// =====================================================================

// @ts-expect-error — Deno runtime, no Node.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// @ts-expect-error — Deno runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// @ts-expect-error — Deno runtime
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para ejecutar motor-pld');
}

interface RunInput {
  organization_id: string;
  trigger_tipo: 'on_insert' | 'manual' | 'cron';
  operation_id?: string;
}

function isRunInput(input: unknown): input is RunInput {
  if (typeof input !== 'object' || input === null) return false;
  if (!('organization_id' in input) || !('trigger_tipo' in input)) return false;
  const candidate = input as { organization_id: unknown; trigger_tipo: unknown; operation_id?: unknown };
  return (
    typeof candidate.organization_id === 'string' &&
    candidate.organization_id.trim().length > 0 &&
    (candidate.trigger_tipo === 'on_insert' ||
      candidate.trigger_tipo === 'manual' ||
      candidate.trigger_tipo === 'cron') &&
    (candidate.operation_id === undefined || typeof candidate.operation_id === 'string')
  );
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// @ts-expect-error — Deno.serve
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch (error: unknown) {
      console.error('[motor-pld] Cuerpo JSON inválido:', error);
      return jsonResponse({ error: 'El cuerpo de la solicitud no es un JSON válido' }, 400);
    }

    if (!isRunInput(body)) {
      return jsonResponse(
        { error: 'La solicitud requiere organization_id y trigger_tipo válidos' },
        400,
      );
    }

    const input = body;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const t0 = Date.now();

    const { data: tipologias, error: errTips } = await supabase
      .from('tipologia_av')
      .select('*')
      .eq('organization_id', input.organization_id)
      .eq('activa', true);

    if (errTips) {
      return jsonResponse({ error: errTips.message }, 500);
    }

    let opQuery = supabase
      .from('operation')
      .select('*, client:client_id(*)')
      .eq('organization_id', input.organization_id);
    if (input.operation_id) opQuery = opQuery.eq('id', input.operation_id);
    const { data: operaciones, error: errOps } = await opQuery;
    if (errOps) {
      return jsonResponse({ error: errOps.message }, 500);
    }

    // TODO[Sprint D-3]: implementar evaluadores por tipo de regla_dsl.
    // Estructura prevista:
    //   - evaluadores: Record<ReglaDsl['tipo'], (op, ctx) => boolean | { matched, payload }>
    //   - para cada op × tipologia: si dispara, insert hallazgo (idempotente)
    //   - actualizar operation.requiere_aviso si supera umbral
    //   - reconstruir borradores de aviso del periodo

    const hallazgos_creados = 0;
    const duracion_ms = Date.now() - t0;

    const { error: errRun } = await supabase.from('motor_run').insert({
      organization_id: input.organization_id,
      trigger_tipo: input.trigger_tipo,
      operaciones_procesadas: operaciones?.length ?? 0,
      hallazgos_creados,
      duracion_ms,
      metadata: {
        tipologias_evaluadas: tipologias?.length ?? 0,
        stub: 'Sprint D-3 implementará evaluadores reales',
      },
    });

    if (errRun) {
      console.error('[motor-pld] No se pudo registrar la bitácora:', errRun);
      return jsonResponse(
        { error: 'El motor se ejecutó, pero la bitácora no pudo registrarse' },
        500,
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        operaciones_procesadas: operaciones?.length ?? 0,
        hallazgos_creados,
        duracion_ms,
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('[motor-pld] Error interno:', error);
    return jsonResponse({ error: 'Error interno del servidor' }, 500);
  }
});

export {};
