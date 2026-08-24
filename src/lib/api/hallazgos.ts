import { supabase } from '@/lib/supabase';
import type {
  ClasificacionUrgencia,
  EstadoHallazgo,
  Hallazgo,
  HallazgoBitacoraEntrada,
  HallazgoDocumento,
} from '@/types/domain';

/** Bucket privado del soporte documental (migration 0007). */
export const BUCKET_DOCUMENTOS = 'hallazgo-documentos';

/** Tipos aceptados por el bucket. Debe coincidir con `allowed_mime_types`
 *  de la migration 0007; si no, Storage rechaza la subida. */
export const MIME_DOCUMENTOS_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];

/** 20 MB — espejo de `file_size_limit` del bucket. */
export const TAMANO_MAX_DOCUMENTO_BYTES = 20 * 1024 * 1024;

/** Lista los hallazgos del Motor PLD para la bandeja del OC.
 *  RLS filtra por organización y rol (solo oc/admin ven hallazgos). */
export async function listarHallazgos(): Promise<Hallazgo[]> {
  const { data, error } = await supabase
    .from('hallazgo')
    .select(
      '*, client:client_id(nombre_razon_social), operation:operation_id(monto_mxn, activo_virtual, fecha, tipo, contraparte)',
    )
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Hallazgo[];
}

/** Conteo de hallazgos abiertos (badge del sidebar). */
export async function contarHallazgosAbiertos(): Promise<number> {
  const { count, error } = await supabase
    .from('hallazgo')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'abierto');
  if (error) throw error;
  return count ?? 0;
}

// =====================================================================
// Expediente del hallazgo (migration 0007)
// =====================================================================

/** Resuelve nombres legibles de usuario. `subido_por` / `usuario` apuntan a
 *  `auth.users`, que PostgREST no puede embeber; se cruza contra
 *  `user_profile` (mismo id) en una segunda consulta. */
async function nombresDeUsuario(ids: (string | null)[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter((i): i is string => !!i))];
  if (unicos.length === 0) return {};
  const { data, error } = await supabase
    .from('user_profile')
    .select('id, nombre')
    .in('id', unicos);
  if (error) throw error;
  const mapa: Record<string, string> = {};
  for (const fila of (data ?? []) as { id: string; nombre: string }[]) {
    mapa[fila.id] = fila.nombre;
  }
  return mapa;
}

/** Documentos de soporte de un hallazgo, del más reciente al más antiguo. */
export async function listarDocumentosHallazgo(hallazgoId: string): Promise<HallazgoDocumento[]> {
  const { data, error } = await supabase
    .from('hallazgo_documento')
    .select('*')
    .eq('hallazgo_id', hallazgoId)
    .order('subido_en', { ascending: false });
  if (error) throw error;

  const docs = (data ?? []) as unknown as HallazgoDocumento[];
  const nombres = await nombresDeUsuario(docs.map((d) => d.subido_por));
  return docs.map((d) => ({
    ...d,
    subido_por_nombre: d.subido_por ? (nombres[d.subido_por] ?? null) : null,
  }));
}

/** Normaliza el nombre de archivo para usarlo como llave en Storage:
 *  Storage rechaza rutas con acentos, espacios y caracteres especiales. */
function slugArchivo(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(-120);
}

export interface SubirDocumentoInput {
  hallazgoId: string;
  organizationId: string;
  usuarioId: string;
  archivo: File;
}

/** Sube el archivo al bucket privado y registra su metadato.
 *  La ruta es {organization_id}/{hallazgo_id}/{timestamp}-{archivo}: el primer
 *  folder es la llave que usa la política de Storage para aislar por
 *  organización. */
export async function subirDocumentoHallazgo({
  hallazgoId,
  organizationId,
  usuarioId,
  archivo,
}: SubirDocumentoInput): Promise<HallazgoDocumento> {
  if (archivo.size > TAMANO_MAX_DOCUMENTO_BYTES) {
    throw new Error('El archivo supera el máximo de 20 MB.');
  }
  if (archivo.type && !MIME_DOCUMENTOS_PERMITIDOS.includes(archivo.type)) {
    throw new Error('Solo se aceptan archivos PDF o imagen (JPG, PNG, WEBP, HEIC).');
  }

  const storagePath = `${organizationId}/${hallazgoId}/${Date.now()}-${slugArchivo(archivo.name)}`;

  const { error: errStorage } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(storagePath, archivo, {
      contentType: archivo.type || undefined,
      upsert: false,
    });
  if (errStorage) throw errStorage;

  const { data, error } = await supabase
    .from('hallazgo_documento')
    .insert({
      organization_id: organizationId,
      hallazgo_id: hallazgoId,
      storage_path: storagePath,
      nombre_archivo: archivo.name,
      mime_type: archivo.type || null,
      tamano_bytes: archivo.size,
      subido_por: usuarioId,
    })
    .select('*')
    .single();

  if (error) {
    // El archivo ya quedó en el bucket pero el metadato no: se limpia para no
    // dejar huérfanos invisibles desde la UI.
    await supabase.storage.from(BUCKET_DOCUMENTOS).remove([storagePath]);
    throw error;
  }

  // El trigger trg_hallazgo_documento_bitacora ya escribió la entrada de
  // bitácora correspondiente; aquí no se duplica.
  return data as unknown as HallazgoDocumento;
}

/** URL firmada de corta vida para abrir un documento del bucket privado. */
export async function urlFirmadaDocumento(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrl(storagePath, 60);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Supabase Storage no devolvió una URL firmada.');
  return data.signedUrl;
}

/** Bitácora del expediente, de lo más reciente a lo más antiguo. */
export async function listarBitacoraHallazgo(
  hallazgoId: string,
): Promise<HallazgoBitacoraEntrada[]> {
  const { data, error } = await supabase
    .from('hallazgo_bitacora')
    .select('*')
    .eq('hallazgo_id', hallazgoId)
    .order('creado_en', { ascending: false });
  if (error) throw error;

  const entradas = (data ?? []) as unknown as HallazgoBitacoraEntrada[];
  const nombres = await nombresDeUsuario(entradas.map((e) => e.usuario));
  return entradas.map((e) => ({
    ...e,
    usuario_nombre: e.usuario ? (nombres[e.usuario] ?? null) : null,
  }));
}

export interface AgregarNotaInput {
  hallazgoId: string;
  organizationId: string;
  usuarioId: string;
  texto: string;
}

/** Nota manual del OC en la bitácora del expediente. */
export async function agregarNotaHallazgo({
  hallazgoId,
  organizationId,
  usuarioId,
  texto,
}: AgregarNotaInput): Promise<HallazgoBitacoraEntrada> {
  const descripcion = texto.trim();
  if (!descripcion) throw new Error('La nota no puede estar vacía.');

  const { data, error } = await supabase
    .from('hallazgo_bitacora')
    .insert({
      organization_id: organizationId,
      hallazgo_id: hallazgoId,
      tipo: 'nota',
      descripcion,
      usuario: usuarioId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as HallazgoBitacoraEntrada;
}

/** Un UPDATE bloqueado por RLS no devuelve error, solo afecta 0 filas: sin
 *  `.select().single()` el front cantaría un éxito falso. */
async function actualizarHallazgo(
  hallazgoId: string,
  cambios: Record<string, string>,
): Promise<void> {
  const { data, error } = await supabase
    .from('hallazgo')
    .update(cambios)
    .eq('id', hallazgoId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      'La actualización no afectó ningún hallazgo. Verifica que tu rol activo sea Oficial de Cumplimiento.',
    );
  }
}

/** Cambia el estado del hallazgo. La entrada de bitácora la escribe el trigger
 *  trg_hallazgo_bitacora, no este código: cualquier ruta que actualice el
 *  estado queda registrada igual. */
export async function cambiarEstadoHallazgo(
  hallazgoId: string,
  estado: EstadoHallazgo,
): Promise<void> {
  await actualizarHallazgo(hallazgoId, { estado });
}

/** Corrección manual del SLA operativo. También la registra el trigger. */
export async function cambiarUrgenciaHallazgo(
  hallazgoId: string,
  clasificacion: ClasificacionUrgencia,
): Promise<void> {
  await actualizarHallazgo(hallazgoId, { clasificacion_urgencia: clasificacion });
}
