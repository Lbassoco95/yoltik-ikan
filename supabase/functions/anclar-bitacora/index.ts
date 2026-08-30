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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  actualizarPrueba,
  bytea,
  deBytea,
  motivoValido,
  planearAnclaje,
  sellarRaiz,
  type MotivoAnclaje,
} from './anclaje.ts';
import { ActualizadorHttp, SelladorHttp } from '../_shared/opentimestamps.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface EntradaAnclaje {
  /** Sin esto se anclan TODAS las organizaciones: es el modo del cron. */
  organization_id?: string;
  /** Se normaliza: un motivo que la tabla no admite haría fallar el insert y
   *  el anclaje no ocurriría, con respuesta 200. Ver `motivoValido`. */
  motivo?: MotivoAnclaje | string;
  /**
   * 'anclar' (por omisión) publica lo nuevo; 'actualizar' recoge las pruebas
   * que Bitcoin ya confirmó. El cron diario hace LAS DOS, en ese orden: sin la
   * segunda, ningún anclaje llega nunca a `confirmado` y la pantalla se queda
   * para siempre en «esperando confirmación».
   */
  accion?: 'anclar' | 'actualizar' | 'ambas';
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

interface ResumenActualizacion {
  anclaje_id: string;
  confirmado: boolean;
  bloque: number | null;
  detalle: string | null;
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const entrada: EntradaAnclaje = await req.json().catch(() => ({}));
  const { motivo, aviso: avisoMotivo } = motivoValido(entrada.motivo);
  const accion = entrada.accion ?? 'ambas';
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const sellador = new SelladorHttp();
  const t0 = Date.now();

  const resumen: ResumenOrg[] = [];
  const actualizados: ResumenActualizacion[] = [];

  // Qué organizaciones tocan. Una cadena sin eventos no aparece aquí, así que
  // el cron no gasta un estampado en una organización que no ha hecho nada.
  let consulta = supabase.from('cadena_auditoria').select('organization_id, ultima_secuencia');
  if (entrada.organization_id) consulta = consulta.eq('organization_id', entrada.organization_id);
  const { data: cadenas, error: errCadenas } = await consulta;
  if (errCadenas) return json({ error: errCadenas.message }, 500);

  for (const cadena of accion === 'actualizar' ? [] : (cadenas ?? [])) {
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

  // ------------------------------------------------------------------
  // Recoger las pruebas que Bitcoin ya confirmó
  // ------------------------------------------------------------------
  // Va DESPUÉS de anclar y no antes: lo recién anclado nunca está confirmado,
  // así que preguntarlo primero sería una petición garantizadamente inútil a
  // cada calendario.
  if (accion !== 'anclar') {
    const actualizador = new ActualizadorHttp();

    let pend = supabase
      .from('anclaje')
      .select('id, organization_id, raiz_merkle, ots')
      .eq('estado', 'pendiente')
      .not('ots', 'is', null)
      .order('creado_en')
      .limit(50);
    if (entrada.organization_id) pend = pend.eq('organization_id', entrada.organization_id);

    const { data: pendientes, error: errPend } = await pend;
    if (errPend) return json({ error: errPend.message }, 500);

    for (const a of pendientes ?? []) {
      try {
        const r = await actualizarPrueba(deBytea(a.ots as string), actualizador);

        // Sólo se escribe cuando hay algo que escribir. Un anclaje que sigue
        // pendiente no se toca: reescribirlo cada día sólo movería
        // `actualizado_en` y ensuciaría el rastro.
        if (r.ots || r.confirmado) {
          const { error } = await supabase
            .from('anclaje')
            .update({
              ...(r.ots ? { ots: bytea(r.ots) } : {}),
              // `fecha_bloque` se queda en null a propósito: la atestiguación
              // de Bitcoin lleva la ALTURA del bloque, no su hora. Poner aquí
              // el momento en que revisamos sería fechar la certificación
              // cuando nos enteramos, que es justo lo que no se debe afirmar.
              // La hora real se saca de la altura contra un explorador, y eso
              // todavía no está construido.
              ...(r.confirmado ? { estado: 'confirmado', bloque_btc: r.bloque } : {}),
              ...(r.detalle ? { detalle: r.detalle } : {}),
            })
            .eq('id', a.id);
          if (error) throw new Error(error.message);
        }

        actualizados.push({
          anclaje_id: a.id as string,
          confirmado: r.confirmado,
          bloque: r.bloque,
          detalle: r.detalle,
        });
      } catch (e) {
        // Un anclaje que falle al actualizar no debe impedir los demás: la
        // prueba que ya tiene sigue siendo válida y mañana se reintenta.
        actualizados.push({
          anclaje_id: a.id as string,
          confirmado: false,
          bloque: null,
          detalle: (e as Error).message,
        });
      }
    }
  }

  return json({
    ok: true,
    motivo,
    accion,
    aviso: avisoMotivo,
    organizaciones: resumen.length,
    ancladas: resumen.filter((r) => r.anclado).length,
    detalle: resumen,
    actualizados: actualizados.length ? actualizados : undefined,
    confirmados: actualizados.filter((a) => a.confirmado).length,
    duracion_ms: Date.now() - t0,
  });
});
