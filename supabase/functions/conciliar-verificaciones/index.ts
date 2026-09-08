// =====================================================================
// Edge Function · conciliar-verificaciones
// =====================================================================
// Adenda 7, apartado 1.2, instrucción 89: extracción GARANTIZADA, no
// oportunista.
//
// Un webhook puede perderse, llegar dos veces o llegar fuera de orden. Si la
// extracción depende sólo de que el aviso llegue, un aviso perdido produce un
// expediente que SE VE COMPLETO y no tiene nada detrás. Es la misma familia de
// fallas que esta serie lleva siete documentos persiguiendo: el control que no
// corrió se ve igual que el que corrió sin hallazgos.
//
// Esta función es la otra mitad. Recorre las verificaciones que deberían estar
// resueltas y custodiadas, le pregunta al proveedor por cada una, y deja
// asentada toda diferencia. No arregla en silencio: baja lo que falta —eso sí—
// pero cada hueco que encontró queda registrado, porque el valor de la
// conciliación no es sólo tapar el agujero, es saber que existió.
//
// Se invoca por horario. Protegida por secreto compartido, porque toca
// expedientes de todas las organizaciones:
//   npx supabase functions deploy conciliar-verificaciones
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ESTADOS_CONOCIDOS, estadoDeDidit, resumirDecision } from '../_shared/didit.ts';

/** La versión que escribe hoy `resumirDecision`. Subirla ahí obliga a subirla
 *  aquí: es lo que hace que la conciliación rehaga los resúmenes atrasados. */
const VERSION_RESUMEN = 3;
import { custodiarArtefactos, modulosAplicados } from '../_shared/artefactos.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DIDIT_API_KEY = Deno.env.get('DIDIT_API_KEY')!;
const SECRETO = Deno.env.get('CONCILIACION_SECRET') ?? '';
const API_BASE = Deno.env.get('DIDIT_API_BASE') ?? 'https://verification.didit.me/v3';

/** Cuánto se le concede a una verificación antes de considerarla colgada. */
const HORAS_DE_GRACIA = 2;

/** Cuántas revisa cada corrida. Acotado para no agotar el tiempo de la función. */
const TOPE = 50;

interface Fila {
  id: string;
  organization_id: string;
  client_id: string;
  didit_session_id: string;
  estado: string;
  solicitada_en: string;
  resumen: Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  // Sin secreto configurado no corre. Una función que recorre expedientes de
  // todas las organizaciones y se puede llamar sin credencial es peor que no
  // tenerla.
  if (!SECRETO) {
    console.error('[conciliar] CONCILIACION_SECRET no está configurado.');
    return new Response('no configurado', { status: 503 });
  }
  if (req.headers.get('x-conciliacion-secret') !== SECRETO) {
    return new Response('no autorizado', { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const corte = new Date(Date.now() - HORAS_DE_GRACIA * 3600 * 1000).toISOString();

  // Dos poblaciones, y las dos importan:
  //
  //   · Las que siguen SIN RESOLVER pasado el plazo de gracia. Si el proveedor
  //     ya las cerró, el webhook se perdió.
  //   · Las APROBADAS. Aunque el estado sea correcto, los artefactos pueden no
  //     haberse bajado, y ahí el expediente se ve completo sin serlo.
  const { data: filas, error } = await supabase
    .from('verificacion_identidad')
    .select('id, organization_id, client_id, didit_session_id, estado, solicitada_en, resumen')
    .or(`estado.eq.aprobada,and(estado.neq.aprobada,solicitada_en.lt.${corte})`)
    .order('solicitada_en', { ascending: false })
    .limit(TOPE);

  if (error) {
    console.error('[conciliar] no se pudieron leer las verificaciones:', error.message);
    return new Response('error', { status: 500 });
  }

  const resumenCorrida = {
    revisadas: 0,
    estados_corregidos: 0,
    artefactos_bajados: 0,
    hallazgos: 0,
  };

  for (const fila of (filas ?? []) as Fila[]) {
    resumenCorrida.revisadas++;

    // ¿Ya está todo custodiado? Entonces no hay nada que preguntarle al
    // proveedor, y no se le pregunta: una conciliación que consulta de más
    // gasta cuota y ralentiza la corrida sin ganar nada.
    const { data: faltantes } = await supabase.rpc('artefactos_faltantes', {
      p_verificacion: fila.id,
    });
    const faltanArtefactos = Array.isArray(faltantes) && faltantes.length > 0;

    /**
     * ¿El resumen lo escribió una versión anterior de `resumirDecision`?
     *
     * Éste era el punto ciego de la conciliación. Se saltaba toda verificación
     * aprobada con sus artefactos completos —razonable para no gastar cuota—,
     * pero eso significaba que un resumen escrito antes de que entrara un
     * módulo se quedaba sin él PARA SIEMPRE. Las dos verificaciones de la
     * notaría de demostración se resolvieron el 31 de agosto y el 1 de
     * septiembre; las señales de canal entraron el 3. Nunca las iban a tener.
     *
     * Ahora se vuelve a preguntar cuando el resumen está atrasado, que es una
     * consulta por verificación y una sola vez: al guardarlo con la versión al
     * día, la siguiente corrida la vuelve a saltar.
     */
    const version = Number(
      (fila.resumen as Record<string, unknown> | null)?.version ?? 0,
    );
    const resumenAtrasado = version < VERSION_RESUMEN;

    if (fila.estado === 'aprobada' && !faltanArtefactos && !resumenAtrasado) continue;

    let decision: Record<string, unknown> | null = null;
    try {
      const r = await fetch(`${API_BASE}/session/${fila.didit_session_id}/decision/`, {
        headers: { 'x-api-key': DIDIT_API_KEY },
      });
      if (r.ok) {
        decision = await r.json();
      } else {
        // Se asienta y se sigue. Que el proveedor no conteste no puede detener
        // la conciliación de las demás.
        await registrar(supabase, fila, 'estado_divergente',
          `El proveedor respondió ${r.status} al consultar la sesión. Si es 404, revisa la ruta ` +
          `de la API en DIDIT_API_BASE antes de dar la conciliación por probada.`);
        resumenCorrida.hallazgos++;
        continue;
      }
    } catch (e) {
      await registrar(supabase, fila, 'estado_divergente',
        `No se pudo consultar al proveedor: ${e instanceof Error ? e.message : 'error'}`);
      resumenCorrida.hallazgos++;
      continue;
    }

    // --- El estado ---------------------------------------------------
    if (!decision) continue;
    const estadoCrudo = typeof decision.status === 'string' ? decision.status : '';

    // Antes de corregir hay que saber que se entendió lo que llegó.
    //
    // `estadoDeDidit` colapsa lo desconocido en `en_progreso`, que es el default
    // seguro para RECIBIR —nunca convierte algo raro en «aprobada»— pero sería
    // destructivo aquí: si el proveedor devolviera un estado nuevo, la
    // conciliación lo leería como divergencia y degradaría a `en_progreso` una
    // verificación aprobada. Se asienta y se deja quieto.
    if (!ESTADOS_CONOCIDOS.has(estadoCrudo)) {
      await registrar(supabase, fila, 'estado_divergente',
        `El proveedor devolvió un estado que no sabemos leer: «${estadoCrudo}». No se tocó la ` +
        `verificación. Hay que mapearlo antes de que la conciliación pueda decidir sobre él.`);
      resumenCorrida.hallazgos++;
      continue;
    }

    const estadoProveedor = estadoDeDidit(estadoCrudo);
    if (estadoProveedor !== fila.estado) {
      // El webhook se perdió, llegó fuera de orden, o nunca salió. Se corrige y
      // se DEJA CONSTANCIA: sin el registro, el expediente quedaría bien y
      // nadie sabría que el aviso no llegó.
      await supabase
        .from('verificacion_identidad')
        .update({
          estado: estadoProveedor,
          resumen: resumirDecision(decision),
          features_aplicadas: modulosAplicados(decision),
          resuelta_en: new Date().toISOString(),
        })
        .eq('id', fila.id);

      await registrar(supabase, fila, 'estado_divergente',
        `Ikán tenía «${fila.estado}» y el proveedor «${estadoProveedor}». Se corrigió por ` +
        `conciliación: la entrega del webhook no llegó o llegó fuera de orden.`);
      resumenCorrida.estados_corregidos++;
      resumenCorrida.hallazgos++;
    }

    // --- Los artefactos ----------------------------------------------
    if (estadoProveedor === 'aprobada') {
      const r = await custodiarArtefactos(supabase as never, {
        verificacionId: fila.id,
        organizationId: fila.organization_id,
        clientId: fila.client_id,
        decision,
      });
      resumenCorrida.artefactos_bajados += r.guardados.length;

      if (r.guardados.length > 0) {
        // Que hubiera que bajarlos aquí ya es el hallazgo: significa que el
        // camino rápido no los bajó.
        await registrar(supabase, fila, 'sin_artefactos',
          `La conciliación custodió ${r.guardados.join(', ')}. El webhook no los había bajado.`);
        resumenCorrida.hallazgos++;
      }
      if (r.fallidos.length > 0) {
        await registrar(supabase, fila, 'sin_artefactos',
          'No se pudieron custodiar: ' +
          r.fallidos.map((f) => `${f.tipo} (${f.motivo})`).join(', '));
        resumenCorrida.hallazgos++;
      }
    }
  }

  console.log('[conciliar]', JSON.stringify(resumenCorrida));
  return new Response(JSON.stringify(resumenCorrida), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function registrar(
  supabase: { rpc: (f: string, p: Record<string, unknown>) => Promise<unknown> },
  fila: Fila,
  hallazgo: string,
  detalle: string,
) {
  await supabase.rpc('registrar_hallazgo_conciliacion', {
    p_session: fila.didit_session_id,
    p_hallazgo: hallazgo,
    p_org: fila.organization_id,
    p_verificacion: fila.id,
    p_detalle: detalle,
  });
}
