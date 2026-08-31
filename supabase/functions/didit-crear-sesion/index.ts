// =====================================================================
// Edge Function · didit-crear-sesion
// =====================================================================
// Abre una verificación de identidad para un compareciente y devuelve la liga
// que hay que hacerle llegar.
//
// Corre en el servidor por una razón y no es de estilo: la clave de Didit lee
// decisiones con documento de identidad y biometría de todos los verificados.
// En el navegador, cualquiera que abra las herramientas de desarrollo la tiene.
//
// Quién puede pedirlo lo decide la RLS, no esta función: se consulta el cliente
// CON EL TOKEN DE QUIEN LLAMA, así que si no es de su organización no aparece y
// la petición muere ahí. Escribir sí va con service_role, porque la tabla no
// admite escritura desde la aplicación (migration 0032).
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DIDIT_API_KEY = Deno.env.get('DIDIT_API_KEY')!;
const DIDIT_WORKFLOW_ID = Deno.env.get('DIDIT_WORKFLOW_ID')!;
const CALLBACK = Deno.env.get('DIDIT_CALLBACK_URL') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });

type Canal = 'correo' | 'liga' | 'presencial';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const autorizacion = req.headers.get('Authorization');
    if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);

    const { client_id, canal, enviado_a } = await req.json();
    if (!client_id) return json({ error: 'Falta el compareciente.' }, 400);
    if (!['correo', 'liga', 'presencial'].includes(canal)) {
      return json({ error: 'Canal no válido.' }, 400);
    }
    if (canal === 'correo' && !enviado_a) {
      return json({ error: 'Para enviar por correo hace falta la dirección.' }, 400);
    }

    // Con el token de quien llama: la RLS decide si ese compareciente es suyo.
    const comoUsuario = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: autorizacion } },
    });
    const { data: cliente, error: errCliente } = await comoUsuario
      .from('client')
      .select('id, organization_id, nombre_razon_social')
      .eq('id', client_id)
      .maybeSingle();

    if (errCliente) return json({ error: errCliente.message }, 500);
    // Vacío y "no existe" se responden igual a propósito: decir "existe pero no
    // es tuyo" confirmaría que ese compareciente está dado de alta en otra
    // organización, que es justo lo que la RLS separa.
    if (!cliente) return json({ error: 'Ese compareciente no está disponible.' }, 404);

    const { data: usuario } = await comoUsuario.auth.getUser();

    const respuesta = await fetch('https://verification.didit.me/v3/session/', {
      method: 'POST',
      headers: { 'x-api-key': DIDIT_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: DIDIT_WORKFLOW_ID,
        vendor_data: cliente.id,
        ...(CALLBACK ? { callback: CALLBACK } : {}),
        // Que Didit mande el correo evita montar un servicio de envío nuestro y
        // deja el consentimiento donde se recoge. Para 'liga' y 'presencial' no
        // se le manda nada: la liga la entrega quien opera.
        ...(canal === 'correo'
          ? { contact_details: { email: enviado_a, send_notification_emails: true, email_lang: 'es' } }
          : {}),
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      // 403 de Didit = clave ausente, inválida o revocada. Se dice en claro
      // porque es lo primero que hay que revisar y el mensaje suyo no lo aclara.
      const pista = respuesta.status === 403
        ? 'Didit rechazó la clave (DIDIT_API_KEY). Revísala o rótala en la consola.'
        : `Didit respondió ${respuesta.status}.`;
      console.error('[didit] alta de sesión falló:', respuesta.status, detalle);
      return json({ error: pista }, 502);
    }

    const sesion = await respuesta.json();

    // Qué dijo Didit del correo. La sesión se crea igual aunque el envío no
    // salga —el 200 es de la sesión, no del correo—, así que sin esto un correo
    // que nunca se manda es indistinguible de uno entregado. Se anota en el log
    // de la función, que es donde se puede revisar sin abrir la base.
    if (canal === 'correo') {
      console.log(
        '[didit] sesión', sesion.session_id, 'creada con envío por correo solicitado.',
        'Respuesta de Didit sobre contacto:',
        JSON.stringify(sesion.contact_details ?? sesion.contact ?? null),
      );
    }

    const comoServicio = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: fila, error: errFila } = await comoServicio
      .from('verificacion_identidad')
      .insert({
        organization_id: cliente.organization_id,
        client_id: cliente.id,
        didit_session_id: sesion.session_id,
        didit_workflow_id: sesion.workflow_id ?? DIDIT_WORKFLOW_ID,
        url: sesion.url,
        canal: canal as Canal,
        enviado_a: canal === 'presencial' ? null : (enviado_a ?? null),
        solicitada_por: usuario?.user?.id ?? null,
      })
      .select('id')
      .single();

    if (errFila) {
      // La sesión ya existe en Didit; sin la fila, nadie la va a poder seguir.
      // Se dice en vez de devolver la liga y fingir que todo fue bien.
      console.error('[didit] sesión creada pero no registrada:', errFila.message);
      return json({
        error: 'La verificación se creó en Didit pero no quedó registrada aquí. '
             + 'No la envíes: vuelve a intentarlo.',
      }, 500);
    }

    // Sólo la liga y el identificador propio. El session_token de Didit sirve
    // para los SDK nativos y no hace falta en el navegador.
    return json({ url: sesion.url, verificacion_id: fila.id });
  } catch (e) {
    console.error('[didit] error inesperado:', (e as Error).message);
    return json({ error: 'No se pudo abrir la verificación.' }, 500);
  }
});
