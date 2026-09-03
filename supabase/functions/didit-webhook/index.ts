// =====================================================================
// Edge Function · didit-webhook
// =====================================================================
// Recibe el resultado de la verificación. Es la ÚNICA fuente de verdad sobre si
// un compareciente quedó aprobado: ni el `onComplete` del SDK ni el redirect de
// vuelta prueban nada, porque los dos viven en el navegador del interesado.
//
// Este endpoint es público —Didit tiene que poder llamarlo— así que lo único
// que separa una entrega auténtica de cualquiera que descubra la URL es la
// firma. La comprobación vive en _shared/didit.ts y está probada aparte: un
// webhook mal verificado no falla ruidosamente, acepta lo que le manden, y aquí
// lo que le mandan es «este compareciente quedó aprobado».
//
// Desplegar SIN verificación de JWT:
//   npx supabase functions deploy didit-webhook --no-verify-jwt
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { esFinal, estadoDeDidit, resumirDecision, verificarWebhook } from '../_shared/didit.ts';
import { custodiarArtefactos, modulosAplicados } from '../_shared/artefactos.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRETO = Deno.env.get('DIDIT_WEBHOOK_SECRET')!;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('método no permitido', { status: 405 });

  const crudo = await req.text();
  const verificacion = await verificarWebhook(
    crudo,
    req.headers.get('x-signature-v2'),
    req.headers.get('x-timestamp'),
    SECRETO,
  );

  if (!verificacion.ok) {
    // Se registra el motivo pero NO se le dice a quien llama: una respuesta que
    // distinga «firma inválida» de «entrega caducada» le sirve a quien está
    // probando a ver si acierta.
    console.warn('[didit-webhook] entrega rechazada:', verificacion.motivo);
    return new Response('no autorizado', { status: 401 });
  }

  const evento = JSON.parse(crudo);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: fila } = await supabase
    .from('verificacion_identidad')
    .select('id, organization_id, client_id, estado, ultimo_evento_id')
    .eq('didit_session_id', evento.session_id)
    .maybeSingle();

  // Una entrega para una sesión que no conocemos no es un error nuestro: puede
  // venir de otra aplicación apuntando al mismo destino. Se responde 2xx para
  // que Didit no reintente algo que nunca va a funcionar.
  if (!fila) {
    console.warn('[didit-webhook] sesión desconocida:', evento.session_id);
    return new Response('ok');
  }

  // Didit reintenta ante 5xx, así que la misma entrega puede llegar dos veces.
  if (evento.event_id && fila.ultimo_evento_id === evento.event_id) {
    return new Response('ok');
  }

  const estado = estadoDeDidit(evento.status);
  const resumen = resumirDecision(evento.decision);

  await supabase
    .from('verificacion_identidad')
    .update({
      estado,
      resumen,
      // Qué módulos corrieron DE VERDAD en esta sesión. No los que el workflow
      // tenga hoy: la primera verificación de producción corrió sin barrido de
      // listas porque el módulo se encendió después, y sin este dato el
      // expediente no podría decirlo.
      features_aplicadas: modulosAplicados(evento.decision),
      ultimo_evento_id: evento.event_id ?? null,
      resuelta_en: esFinal(estado) ? new Date().toISOString() : null,
    })
    .eq('id', fila.id);

  // --- Condición de PPE, con su evidencia (migration 0038) ------------
  //
  // Sólo se escribe cuando la verificación terminó: un screening a medias no
  // determina nada, y dejar constancia de una consulta que no acabó sería
  // acreditar algo que no ocurrió.
  //
  // Lo que se escribe puede ser `no_pep` —una determinación— o
  // `coincidencia_sin_resolver` —un hallazgo que espera a la célula—. Nunca el
  // NIVEL de PPE: nacional, extranjera o familiar los determina una persona,
  // porque las RCG reservan esa decisión al sujeto obligado y no al proveedor.
  //
  // Y no se pisa una condición que alguien ya resolvió a mano. Una
  // reverificación posterior no puede borrar el juicio de la célula: si el
  // screening nuevo dijera algo distinto, eso es un caso para mirar, no para
  // sobrescribir en silencio.
  if (esFinal(estado)) {
    const { data: pep } = await supabase.rpc('pep_desde_resumen', { p_resumen: resumen });
    const decidido = pep as { condicion?: string; evidencia?: unknown } | null;

    if (decidido?.condicion) {
      const { data: cliente } = await supabase
        .from('client')
        .select('condicion_pep')
        .eq('id', fila.client_id)
        .maybeSingle();

      const yaResuelta =
        cliente?.condicion_pep != null &&
        cliente.condicion_pep !== 'coincidencia_sin_resolver';

      if (!yaResuelta) {
        await supabase
          .from('client')
          .update({
            condicion_pep: decidido.condicion,
            pep_evidencia: {
              ...(decidido.evidencia as Record<string, unknown>),
              consultado_en: new Date().toISOString(),
              didit_session_id: evento.session_id ?? null,
            },
          })
          .eq('id', fila.client_id);
      }
    }
  }

  // A la bitácora encadenada de SU organización. Que a un compareciente se le
  // verificara la identidad, cuándo y con qué resultado es parte del expediente,
  // y el sujeto obligado tiene que poder enseñarlo en su propio paquete.
  if (esFinal(estado)) {
    await supabase.rpc('registrar_evento', {
      p_organization_id: fila.organization_id,
      p_tipo: 'verificacion_identidad_resuelta',
      p_entidad: 'client',
      p_entidad_id: fila.client_id,
      p_payload: {
        proveedor: 'didit',
        didit_session_id: evento.session_id,
        estado,
        estado_proveedor: evento.status,
        resumen,
      },
      p_actor_tipo: 'sistema',
      p_actor_id: null,
    });
  }

  // --- Custodia de los artefactos (Adenda 7, apartado 1) --------------
  //
  // Va DESPUÉS de responder, no antes. Didit cuenta como fallo cualquier
  // respuesta que tarde más de cinco segundos, y bajar dos o cuatro imágenes no
  // cabe en ese presupuesto: hacerlo en línea convertiría una descarga lenta en
  // una entrega reintentada, que es peor que la descarga lenta.
  //
  // Y es el camino RÁPIDO, no la garantía. La garantía es la conciliación: si
  // esto falla, o si la entrega nunca llega, el expediente queda sin artefactos
  // y la conciliación lo levanta. Las dos vías hacen lo mismo y no se estorban
  // porque la llave (verificación, tipo) es única.
  //
  // Las ligas de la decisión vienen firmadas y vencen en horas: por eso se bajan
  // ahora y no se guardan para después.
  if (esFinal(estado) && estado === 'aprobada') {
    const tarea = (async () => {
      const r = await custodiarArtefactos(supabase as never, {
        verificacionId: fila.id,
        organizationId: fila.organization_id,
        clientId: fila.client_id,
        decision: evento.decision,
      });
      if (r.fallidos.length > 0) {
        console.error('[didit-webhook] artefactos no custodiados:', r.fallidos);
        await supabase.rpc('registrar_hallazgo_conciliacion', {
          p_session: evento.session_id,
          p_hallazgo: 'sin_artefactos',
          p_org: fila.organization_id,
          p_verificacion: fila.id,
          p_detalle:
            'La descarga desde el webhook falló en: ' +
            r.fallidos.map((f) => `${f.tipo} (${f.motivo})`).join(', ') +
            '. La conciliación lo reintentará.',
        });
      }
    })();

    // `waitUntil` deja la tarea viva después de responder. Si el entorno no lo
    // ofrece se espera: es peor perder la custodia que arriesgar el plazo.
    const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
      .EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(tarea);
    else await tarea;
  }

  // 2xx dentro de 5 segundos: pasado ese plazo Didit lo cuenta como fallo y
  // reintenta.
  return new Response('ok');
});
