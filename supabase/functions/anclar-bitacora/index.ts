// =====================================================================
// Edge Function · anclar-bitacora  (RCG0.B8.2)
// =====================================================================
// Publica en Bitcoin la raíz Merkle de los eventos de la bitácora que
// todavía no tienen ancla, vía OpenTimestamps.
//
// Por qué existe: la bitácora encadenada (migration 0021) prueba que nadie
// alteró un evento suelto, pero es una cadena dentro de una base que Ikán
// administra. No prueba que Ikán no la reescribiera entera. Publicar la raíz
// donde ya no la podamos cambiar sí lo prueba.
//
// Lo que sale de aquí: 32 bytes. Ningún dato personal, ningún identificador
// de cliente, ni siquiera cuántos eventos hay detrás — el deber de reserva
// del artículo 38 de la LFPIORPI no admite menos.
//
// Se invoca:
//   - Cron diario. Acota a 24 horas la ventana en que una manipulación no
//     tendría ancla que la contradiga.
//   - Al cerrar un periodo de aviso (motivo 'cierre_periodo'). El aviso es el
//     documento que se defiende ante la autoridad; dejarlo sin anclar hasta
//     el día siguiente sería justo cuando más falta hace.
//
// La lógica pura vive en ./anclaje.ts y se prueba con vitest desde
// src/test/anclaje.test.ts, sin calendario ni base delante.
// =====================================================================

// @ts-expect-error — Deno runtime, no Node.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { motivoValido, planearAnclaje, sellarRaiz, type MotivoAnclaje } from './anclaje.ts';
import { SelladorHttp } from '../_shared/opentimestamps.ts';

// @ts-expect-error — Deno runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error — Deno runtime
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface EntradaAnclaje {
  /** Sin esto se anclan TODAS las organizaciones: es el modo del cron. */
  organization_id?: string;
  /** Se normaliza: un motivo que la tabla no admite haría fallar el insert y
   *  el anclaje no ocurriría, con respuesta 200. Ver `motivoValido`. */
  motivo?: MotivoAnclaje | string;
}

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

/** Postgres recibe bytea como cadena hex con prefijo \x. */
function bytea(bytes: Uint8Array): string {
  return '\\x' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface ResumenOrg {
  organization_id: string;
  anclado: boolean;
  desde?: number;
  hasta?: number;
  raiz_merkle?: string;
  estado?: string;
  motivo_no_anclado?: string;
}

// @ts-expect-error — Deno.serve
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const entrada: EntradaAnclaje = await req.json().catch(() => ({}));
  const { motivo, aviso: avisoMotivo } = motivoValido(entrada.motivo);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const sellador = new SelladorHttp();
  const t0 = Date.now();

  // Qué organizaciones tocan. Una cadena sin eventos no aparece aquí, así que
  // el cron no gasta un estampado en una organización que no ha hecho nada.
  let consulta = supabase.from('cadena_auditoria').select('organization_id, ultima_secuencia');
  if (entrada.organization_id) consulta = consulta.eq('organization_id', entrada.organization_id);
  const { data: cadenas, error: errCadenas } = await consulta;
  if (errCadenas) return json({ error: errCadenas.message }, 500);

  const resumen: ResumenOrg[] = [];

  for (const cadena of cadenas ?? []) {
    const org = cadena.organization_id as string;
    try {
      // Dónde arranca el tramo: justo después del último anclaje.
      const { data: rango, error: errRango } = await supabase
        .rpc('rango_por_anclar', { p_organization_id: org })
        .maybeSingle();
      if (errRango) throw new Error(errRango.message);

      const desde = Number(rango?.desde ?? 1);
      const hasta = Number(rango?.hasta ?? 0);
      if (hasta < desde) {
        resumen.push({ organization_id: org, anclado: false, motivo_no_anclado: 'sin eventos nuevos' });
        continue;
      }

      // Los eslabones del tramo, paginados. `planearAnclaje` exige que no
      // falte ninguno: un hueco significaría anclar una historia que no es.
      const eslabones: { secuencia: number; cadena_hash: string }[] = [];
      const TAMANO = 1000;
      for (let d = desde; d <= hasta; d += TAMANO) {
        const { data, error } = await supabase
          .from('evento_auditoria')
          .select('secuencia, cadena_hash')
          .eq('organization_id', org)
          .gte('secuencia', d)
          .lte('secuencia', Math.min(d + TAMANO - 1, hasta))
          .order('secuencia');
        if (error) throw new Error(error.message);
        eslabones.push(...((data ?? []) as { secuencia: number; cadena_hash: string }[]));
      }

      const plan = await planearAnclaje(eslabones, desde);
      if (!plan) {
        resumen.push({ organization_id: org, anclado: false, motivo_no_anclado: 'sin eventos nuevos' });
        continue;
      }

      const sellado = await sellarRaiz(plan.raiz_merkle, sellador);

      // Se guarda TAMBIÉN cuando falla el sellado, con estado 'fallido' y el
      // motivo escrito. Un fallo silencioso dejaría la ventana abierta sin
      // que nadie se entere; así la pantalla de integridad lo enseña.
      const { error: errIns } = await supabase.from('anclaje').insert({
        organization_id: org,
        desde_secuencia: plan.desde,
        hasta_secuencia: plan.hasta,
        raiz_merkle: plan.raiz_merkle,
        cadena_hash_final: plan.cadena_hash_final,
        motivo,
        estado: sellado.estado,
        ots: sellado.ots ? bytea(sellado.ots) : null,
        calendarios: sellado.calendarios,
        detalle: [sellado.detalle, avisoMotivo].filter(Boolean).join(' ') || null,
      });
      if (errIns) throw new Error(errIns.message);

      resumen.push({
        organization_id: org,
        anclado: sellado.estado === 'pendiente',
        desde: plan.desde,
        hasta: plan.hasta,
        raiz_merkle: plan.raiz_merkle,
        estado: sellado.estado,
        motivo_no_anclado: sellado.estado === 'fallido' ? (sellado.detalle ?? 'sin calendario') : undefined,
      });
    } catch (e) {
      // Un error en una organización no debe dejar sin anclar a las demás.
      resumen.push({
        organization_id: org,
        anclado: false,
        motivo_no_anclado: (e as Error).message,
      });
    }
  }

  return json({
    ok: true,
    motivo,
    aviso: avisoMotivo,
    organizaciones: resumen.length,
    ancladas: resumen.filter((r) => r.anclado).length,
    detalle: resumen,
    duracion_ms: Date.now() - t0,
  });
});
