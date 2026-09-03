// =====================================================================
// Custodia de artefactos · Adenda 7, apartado 1
// =====================================================================
// Didit es fuente, Ikán es archivo. Aquí se baja lo que el art. 18 fr. I manda
// conservar —la copia del documento de identidad— y se guarda con su huella.
//
// Qué NO se baja, y por qué está escrito aquí y no sólo en la migration:
// la imagen de referencia de la prueba de vida y el vídeo son biometría, Kawiil
// la trata como dato sensible, y de esos módulos se conserva el PUNTAJE como
// valor. El recorte del retrato tampoco: la imagen del documento ya lo
// contiene, y guardarlo aparte añade una fotografía de rostro sin ningún valor
// legal adicional. Quien añada un tipo aquí está ampliando lo que custodiamos
// de una persona: que sea a propósito.
// =====================================================================

/** Los tipos que custodiamos, y de qué campo de la decisión sale cada uno. */
const ARTEFACTOS: ReadonlyArray<{ tipo: string; campo: string }> = [
  { tipo: 'documento_frente', campo: 'front_image' },
  { tipo: 'documento_reverso', campo: 'back_image' },
  { tipo: 'documento_frente_completo', campo: 'full_front_image' },
  { tipo: 'documento_reverso_completo', campo: 'full_back_image' },
];

export interface ArtefactoPendiente {
  tipo: string;
  url: string;
}

/**
 * Las ligas de los artefactos que trae la decisión.
 *
 * Vienen firmadas y vencen en horas: por eso hay que bajarlas cuando llegan y
 * no guardarlas para después. Guardar la liga en vez del archivo es justamente
 * lo que la Adenda 7 §1.4 llama dependencia y no custodia.
 */
export function artefactosDeLaDecision(decision: unknown): ArtefactoPendiente[] {
  if (!decision || typeof decision !== 'object') return [];
  const d = decision as Record<string, unknown>;
  const idv = Array.isArray(d.id_verifications) ? d.id_verifications[0] : null;
  if (!idv || typeof idv !== 'object') return [];
  const nodo = idv as Record<string, unknown>;

  const salida: ArtefactoPendiente[] = [];
  for (const { tipo, campo } of ARTEFACTOS) {
    const url = nodo[campo];
    if (typeof url === 'string' && url.startsWith('https://')) {
      salida.push({ tipo, url });
    }
  }
  return salida;
}

/**
 * Qué módulos corrieron DE VERDAD en esta sesión.
 *
 * No los que el workflow tiene hoy. La diferencia no es teórica: la primera
 * verificación de producción corrió sin barrido de listas porque el módulo se
 * encendió después, y sin este dato el expediente no podría decirlo.
 */
export function modulosAplicados(decision: unknown): string[] | null {
  if (!decision || typeof decision !== 'object') return null;
  const f = (decision as Record<string, unknown>).features;
  if (!Array.isArray(f)) return null;
  const limpio = f.filter((x): x is string => typeof x === 'string');
  return limpio.length > 0 ? limpio : null;
}

/** SHA-256 en hexadecimal. La prueba de que es EL archivo, no un archivo. */
export async function huella(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface ResultadoCustodia {
  guardados: string[];
  fallidos: { tipo: string; motivo: string }[];
}

/**
 * Baja los artefactos y los custodia.
 *
 * Idempotente por (verificación, tipo): la base tiene la llave única, así que un
 * reintento no duplica ni pisa lo ya guardado. Es la instrucción 90 y también
 * lo que permite que el webhook y la conciliación hagan lo mismo sin estorbarse
 * —el webhook es el camino rápido; la conciliación es la garantía—.
 *
 * No lanza: devuelve qué se guardó y qué falló. Un fallo de descarga NO debe
 * tumbar el webhook, porque entonces Didit reintentaría toda la entrega y el
 * expediente se quedaría sin actualizar por un problema de red.
 */
export async function custodiarArtefactos(
  supabase: {
    from: (t: string) => {
      select: (c: string) => { eq: (a: string, b: string) => Promise<{ data: unknown }> };
      insert: (fila: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
    storage: {
      from: (b: string) => {
        upload: (
          ruta: string,
          datos: Uint8Array,
          opciones: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  },
  ctx: {
    verificacionId: string;
    organizationId: string;
    clientId: string;
    decision: unknown;
  },
): Promise<ResultadoCustodia> {
  const pendientes = artefactosDeLaDecision(ctx.decision);
  const salida: ResultadoCustodia = { guardados: [], fallidos: [] };
  if (pendientes.length === 0) return salida;

  const { data: yaEstan } = await supabase
    .from('artefacto_verificacion')
    .select('tipo')
    .eq('verificacion_id', ctx.verificacionId);
  const custodiados = new Set(
    ((yaEstan ?? []) as { tipo: string }[]).map((a) => a.tipo),
  );

  for (const { tipo, url } of pendientes) {
    if (custodiados.has(tipo)) continue;
    try {
      const respuesta = await fetch(url);
      if (!respuesta.ok) {
        salida.fallidos.push({ tipo, motivo: `descarga ${respuesta.status}` });
        continue;
      }
      const bytes = await respuesta.arrayBuffer();
      const mime = respuesta.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
      const ext = EXTENSION[mime] ?? 'bin';
      const nombre = `${tipo}.${ext}`;
      // La carpeta empieza por la organización: es lo que la política de
      // storage compara para aislar entre notarías.
      const ruta = `${ctx.organizationId}/${ctx.clientId}/${ctx.verificacionId}/${nombre}`;

      const { error: errSubida } = await supabase.storage
        .from('expedientes-identidad')
        .upload(ruta, new Uint8Array(bytes), { contentType: mime, upsert: false });
      if (errSubida) {
        salida.fallidos.push({ tipo, motivo: `almacenamiento: ${errSubida.message}` });
        continue;
      }

      const { error: errFila } = await supabase.from('artefacto_verificacion').insert({
        organization_id: ctx.organizationId,
        client_id: ctx.clientId,
        verificacion_id: ctx.verificacionId,
        tipo,
        storage_path: ruta,
        nombre_archivo: nombre,
        mime_type: mime,
        tamano_bytes: bytes.byteLength,
        sha256: await huella(bytes),
        // Dato ADICIONAL, nunca el dato: viene firmada y vence en horas. Se
        // conserva para poder rastrear la procedencia, no para volver a leerla.
        url_origen: url.split('?')[0],
      });
      if (errFila) {
        salida.fallidos.push({ tipo, motivo: `registro: ${errFila.message}` });
        continue;
      }
      salida.guardados.push(tipo);
    } catch (e) {
      salida.fallidos.push({ tipo, motivo: e instanceof Error ? e.message : 'error desconocido' });
    }
  }

  return salida;
}
