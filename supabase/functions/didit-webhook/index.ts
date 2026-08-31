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

  await supabase
    .from('verificacion_identidad')
    .update({
      estado,
      resumen: resumirDecision(evento.decision),
      ultimo_evento_id: evento.event_id ?? null,
      resuelta_en: esFinal(estado) ? new Date().toISOString() : null,
    })
    .eq('id', fila.id);

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
        resumen: resumirDecision(evento.decision),
      },
      p_actor_tipo: 'sistema',
      p_actor_id: null,
    });
  }

  // 2xx dentro de 5 segundos: pasado ese plazo Didit lo cuenta como fallo y
  // reintenta.
  return new Response('ok');
});
