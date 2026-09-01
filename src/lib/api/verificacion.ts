import { supabase } from '@/lib/supabase';

/**
 * Verificación de identidad del compareciente (Didit).
 *
 * Nada de esto habla con Didit desde el navegador: la clave de Didit lee
 * decisiones con documento de identidad y biometría de todos los verificados,
 * así que vive sólo en la Edge Function. Aquí sólo se le pide que abra una
 * sesión y se lee el resultado que el webhook dejó.
 */

export type EstadoVerificacion =
  | 'no_iniciada' | 'en_progreso' | 'en_revision' | 'aprobada'
  | 'rechazada' | 'reenviada' | 'abandonada' | 'expirada' | 'error';

/** Cómo se le hace llegar la verificación al compareciente. En una notaría el
 *  caso más común es que esté ahí mismo, así que 'presencial' no es un extra. */
export type CanalVerificacion = 'correo' | 'liga' | 'presencial';

export const ETIQUETA_ESTADO: Record<EstadoVerificacion, string> = {
  no_iniciada: 'Enviada, sin abrir',
  en_progreso: 'En proceso',
  en_revision: 'En revisión de Didit',
  aprobada: 'Identidad verificada',
  rechazada: 'No pasó la verificación',
  reenviada: 'Se le pidió repetir un paso',
  abandonada: 'La dejó a medias',
  expirada: 'Caducó sin completarse',
  error: 'No se pudo abrir',
};

export interface VerificacionVigente {
  client_id: string;
  verificacion_id: string;
  didit_session_id: string;
  estado: EstadoVerificacion;
  canal: CanalVerificacion;
  enviado_a: string | null;
  /** Qué módulos corrieron y con qué resultado. Sin imágenes ni biometría:
   *  eso se queda en Didit (ver migration 0032). */
  resumen: Record<string, unknown>;
  solicitada_en: string;
  resuelta_en: string | null;
}

/** La última verificación de cada compareciente de la organización. */
export async function verificacionesVigentes(): Promise<VerificacionVigente[]> {
  const { data, error } = await supabase.from('v_verificacion_vigente').select('*');
  if (error) throw error;
  return (data ?? []) as unknown as VerificacionVigente[];
}

export interface SesionAbierta {
  url: string;
  verificacion_id: string;
}

/**
 * Abre una verificación y devuelve la liga.
 *
 * El acuse dice que se ABRIÓ, no que la persona esté verificada. Lo segundo lo
 * decide el webhook, y sólo el webhook: ni el redirect de vuelta ni el
 * `onComplete` del SDK prueban nada, porque los dos corren en el navegador de
 * quien se está verificando.
 */
export async function abrirVerificacion(
  clientId: string,
  canal: CanalVerificacion,
  enviadoA?: string,
): Promise<SesionAbierta> {
  const { data, error } = await supabase.functions.invoke('didit-crear-sesion', {
    body: { client_id: clientId, canal, enviado_a: enviadoA ?? null },
  });
  if (error) {
    // El cuerpo del error trae el mensaje útil de la función; `error.message`
    // a secas suele ser un «non-2xx status» que no le dice nada a nadie.
    let detalle = error.message;
    try {
      const cuerpo = await (error as { context?: Response }).context?.json();
      if (cuerpo?.error) detalle = cuerpo.error;
    } catch {
      /* nos quedamos con error.message */
    }
    throw new Error(detalle);
  }
  return data as SesionAbierta;
}

/** Mensaje con el que se le manda la liga por WhatsApp o mensaje de texto. */
export function mensajeParaCompareciente(nombreNotaria: string, url: string): string {
  return (
    `${nombreNotaria} necesita verificar su identidad antes de continuar con su trámite.\n\n` +
    `Abra esta liga desde su teléfono y siga los pasos. Le tomará un par de minutos y ` +
    `necesitará su identificación oficial a la mano:\n\n${url}\n\n` +
    `Si no esperaba este mensaje, ignórelo.`
  );
}

/** Abre WhatsApp con el mensaje listo. Sin número, deja elegir contacto. */
export function ligaWhatsApp(mensaje: string, telefono?: string | null): string {
  const soloDigitos = (telefono ?? '').replace(/\D/g, '');
  const destino = soloDigitos.length >= 10 ? soloDigitos : '';
  return `https://wa.me/${destino}?text=${encodeURIComponent(mensaje)}`;
}

export interface VerificacionDeCliente extends VerificacionVigente {
  id: string;
  url: string;
}

/**
 * Todas las verificaciones de un compareciente, la más reciente primero.
 *
 * El historial y no sólo la vigente: una verificación rechazada seguida de una
 * aprobada no es lo mismo que una aprobada a la primera, y el expediente
 * debería poder enseñar la diferencia. La vista `v_verificacion_vigente` sirve
 * para la lista general; dentro del expediente se ve el rastro completo.
 */
export async function verificacionesDeCliente(
  clientId: string,
): Promise<VerificacionDeCliente[]> {
  const { data, error } = await supabase
    .from('verificacion_identidad')
    .select(
      'id, client_id, didit_session_id, url, estado, canal, enviado_a, resumen, solicitada_en, resuelta_en',
    )
    .eq('client_id', clientId)
    .order('solicitada_en', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((v) => ({
    ...(v as unknown as VerificacionDeCliente),
    verificacion_id: (v as { id: string }).id,
  }));
}

/**
 * Lo que Didit resolvió, con nombres en español.
 *
 * El `resumen` es jsonb y viene del proveedor: se lee a la defensiva y lo que
 * no venga simplemente no se pinta. Lo que NO se hace es rellenar un hueco con
 * un valor por defecto —«sin coincidencias» cuando el módulo no corrió es
 * exactamente la afirmación que no se puede sostener.
 */
export interface ResumenLegible {
  documento: {
    tipo: string | null;
    pais: string | null;
    nombre_leido: string | null;
    vence: string | null;
    avisos: number;
  } | null;
  prueba_de_vida: { estado: string | null; puntaje: number | null } | null;
  cotejo_facial: { estado: string | null; puntaje: number | null } | null;
  listas: {
    estado: string | null;
    coincidencias: number;
    categorias: string[];
  } | null;
}

export function leerResumen(resumen: Record<string, unknown> | null | undefined): ResumenLegible {
  const obj = (k: string): Record<string, unknown> | null => {
    const v = resumen?.[k];
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  };
  const texto = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

  const doc = obj('documento');
  const vida = obj('prueba_de_vida');
  const cara = obj('cotejo_facial');
  const listas = obj('listas');

  return {
    documento: doc
      ? {
          tipo: texto(doc.tipo),
          pais: texto(doc.pais),
          nombre_leido: texto(doc.nombre_leido),
          vence: texto(doc.vence),
          avisos: num(doc.avisos) ?? 0,
        }
      : null,
    prueba_de_vida: vida ? { estado: texto(vida.estado), puntaje: num(vida.puntaje) } : null,
    cotejo_facial: cara ? { estado: texto(cara.estado), puntaje: num(cara.puntaje) } : null,
    listas: listas
      ? {
          estado: texto(listas.estado),
          coincidencias: num(listas.coincidencias) ?? 0,
          categorias: Array.isArray(listas.categorias)
            ? listas.categorias.filter((c): c is string => typeof c === 'string')
            : [],
        }
      : null,
  };
}
