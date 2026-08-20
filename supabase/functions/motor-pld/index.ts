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
// @ts-expect-error — Deno runtime, no Node.
import { z } from 'https://esm.sh/zod@3.22.4';

// @ts-expect-error — Deno runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error — Deno runtime
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// @ts-expect-error — Deno runtime
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const runInputSchema = z.object({
  organization_id: z.string().uuid(),
  trigger_tipo: z.enum(['on_insert', 'manual', 'cron']),
  operation_id: z.string().uuid().optional(),
});

type RunInput = z.infer<typeof runInputSchema>;

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// @ts-expect-error — Deno.serve
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const parsed = runInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.errors }, 400);
  }
  const input: RunInput = parsed.data;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Autorización: el service_role (triggers de BD / cron) pasa directo;
  // cualquier otro caller debe ser un usuario con rol OC o Admin en la
  // organización objetivo.
  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '');
  if (bearer !== SERVICE_KEY) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: 'No autenticado' }, 401);
    }
    const { data: rolRows, error: rolErr } = await supabase
      .from('user_roles')
      .select('rol')
      .eq('user_id', userData.user.id)
      .eq('organization_id', input.organization_id)
      .in('rol', ['oc', 'admin']);
    if (rolErr || !rolRows?.length) {
      return jsonResponse({ error: 'No autorizado para esta organización' }, 403);
    }
  }

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

  await supabase.from('motor_run').insert({
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

  return jsonResponse(
    {
      ok: true,
      operaciones_procesadas: operaciones?.length ?? 0,
      hallazgos_creados,
      duracion_ms,
    },
    200,
  );
});

export {};
