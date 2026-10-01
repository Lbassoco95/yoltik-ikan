/**
 * API del catálogo de formatos oficiales UIF y del perfil AV.
 */
import { supabase } from '@/lib/supabase';
import { contextoSesion } from './contexto';
import { huellaSha256 } from '@/lib/formatos-uif/presentacion';
import type { CampoFormato } from '@/lib/formatos-uif/validacion';

/** Tablas nuevas (0076–0079) hasta regenerar `database.ts`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface FormatoOficialRow {
  id: string;
  codigo_anexo: string;
  ambito: string;
  version: string;
  estado: 'activo' | 'pendiente' | 'retirado';
  regimen_entrada: string;
  vigente_desde: string;
  vigente_hasta: string | null;
  total_campos: number;
  archivo_origen: string | null;
  notas: string | null;
}

export async function listarFormatosOficiales(): Promise<FormatoOficialRow[]> {
  const { data, error } = await db
    .from('formato_oficial')
    .select(
      'id, codigo_anexo, ambito, version, estado, regimen_entrada, vigente_desde, vigente_hasta, total_campos, archivo_origen, notas',
    )
    .order('codigo_anexo');
  if (error) throw error;
  return (data ?? []) as FormatoOficialRow[];
}

export async function camposDeFormato(formatoId: string): Promise<CampoFormato[]> {
  const { data, error } = await db
    .from('formato_oficial_campo')
    .select(
      'orden, numero, padre, nombre, etiqueta_xml, obligatoriedad, tipo_dato, longitud, formato, catalogo_codigo',
    )
    .eq('formato_id', formatoId)
    .order('orden');
  if (error) throw error;
  return (data ?? []).map((c: Record<string, unknown>) => ({
    orden: c.orden as number,
    numero: c.numero as string,
    padre: (c.padre as string | null) ?? null,
    nombre: c.nombre as string,
    etiqueta_xml: c.etiqueta_xml as string,
    obligatoriedad: c.obligatoriedad as string,
    tipo_dato: c.tipo_dato as string,
    longitud: c.longitud as string,
    formato: c.formato as string,
    catalogo_codigo: (c.catalogo_codigo as string | null) ?? null,
  }));
}

export async function conteoCamposActivos(): Promise<number> {
  const { data, error } = await db
    .from('formato_oficial_campo')
    .select('id, formato_oficial!inner(estado, version)');
  if (error) throw error;
  return ((data ?? []) as { formato_oficial: { estado: string; version: string } }[]).filter(
    (r) => r.formato_oficial?.estado === 'activo' && r.formato_oficial?.version === 'dof-2026-09-24',
  ).length;
}

export async function conteoFraccionesAnexoA(): Promise<number> {
  const { data: cat, error: e1 } = await db
    .from('catalogo_formato')
    .select('id')
    .eq('codigo', 'anexo_a_fracciones_arancelarias')
    .maybeSingle();
  if (e1) throw e1;
  if (!cat) return 0;
  const { data, error } = await db
    .from('catalogo_formato_valor')
    .select('id')
    .eq('catalogo_id', cat.id)
    .is('vigente_hasta', null);
  if (error) throw error;
  return (data ?? []).length;
}

export interface PerfilAv {
  id: string;
  fraccion: string;
  codigo_anexo: string;
  formato_id: string | null;
  clave_actividad: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
}

export async function listarPerfilAv(): Promise<PerfilAv[]> {
  const { organizationId } = await contextoSesion();
  const { data, error } = await db
    .from('organizacion_actividad_vulnerable')
    .select('id, fraccion, codigo_anexo, formato_id, clave_actividad, vigente_desde, vigente_hasta')
    .eq('organization_id', organizationId)
    .is('vigente_hasta', null)
    .order('fraccion');
  if (error) throw error;
  return (data ?? []) as PerfilAv[];
}

export async function organizacionTienePerfilAv(): Promise<boolean> {
  const perfiles = await listarPerfilAv();
  return perfiles.length > 0;
}

/** Claves vigentes de un catálogo de formato (vacío = no cargado). */
export async function clavesCatalogoFormato(codigo: string): Promise<Set<string>> {
  const { data: cat, error: e1 } = await db
    .from('catalogo_formato')
    .select('id, version')
    .eq('codigo', codigo)
    .maybeSingle();
  if (e1) throw e1;
  if (!cat || (cat.version as number) === 0) return new Set();
  const { data, error } = await db
    .from('catalogo_formato_valor')
    .select('clave')
    .eq('catalogo_id', cat.id)
    .is('vigente_hasta', null);
  if (error) throw error;
  return new Set((data ?? []).map((r: { clave: string }) => r.clave));
}

export async function registrarDocumentoAviso(input: {
  avisoId: string;
  tipo: 'xml' | 'huella' | 'acuse' | 'constancia';
  nombreArchivo?: string;
  contenido: string;
  metadata?: Record<string, unknown>;
}): Promise<{ id: string; sha256: string }> {
  const { uid, organizationId } = await contextoSesion();
  const sha256 = await huellaSha256(input.contenido);
  const { data, error } = await db
    .from('aviso_documento')
    .insert({
      aviso_id: input.avisoId,
      organization_id: organizationId,
      tipo: input.tipo,
      nombre_archivo: input.nombreArchivo ?? null,
      contenido: input.contenido,
      sha256,
      metadata: input.metadata ?? {},
      creado_por: uid,
    })
    .select('id, sha256')
    .single();
  if (error) throw error;
  return { id: data.id as string, sha256: data.sha256 as string };
}

export async function confirmarPresentacionManual(input: {
  avisoId: string;
  validacionCompleta: boolean;
  camposNoValidados?: string[];
}): Promise<void> {
  const { uid } = await contextoSesion();
  const { error } = await db
    .from('aviso')
    .update({
      estado: 'presentado',
      presentado_en: new Date().toISOString(),
      presentado_por: uid,
      canal_presentacion: 'manual',
      validacion_completa: input.validacionCompleta,
      campos_no_validados: input.camposNoValidados ?? [],
    })
    .eq('id', input.avisoId);
  if (error) throw error;
}

export async function registrarAcuseManual(input: {
  avisoId: string;
  resultado: 'aceptado' | 'rechazo';
  acuseTexto: string;
  /** Folio de la autoridad; obligatorio si resultado = aceptado. */
  folio?: string | null;
  nombreArchivo?: string;
}): Promise<void> {
  const { estadoTrasAcuseConFolio, plazosTrasAcuse } = await import(
    '@/lib/formatos-uif/presentacion'
  );

  // Leer plazos actuales: el rechazo no los toca.
  const { data: aviso, error: eAviso } = await db
    .from('aviso')
    .select('fecha_conocimiento, plazo_limite_24h')
    .eq('id', input.avisoId)
    .single();
  if (eAviso) throw eAviso;

  const plazoLimite = aviso?.plazo_limite_24h ?? new Date().toISOString();
  const decision = estadoTrasAcuseConFolio({
    resultado: input.resultado,
    folio: input.folio ?? (input.resultado === 'aceptado' ? input.acuseTexto : null),
    plazoLimite,
  });

  const doc = await registrarDocumentoAviso({
    avisoId: input.avisoId,
    tipo: 'acuse',
    nombreArchivo: input.nombreArchivo ?? 'acuse.txt',
    contenido: input.acuseTexto,
    metadata: {
      resultado: input.resultado,
      folio: decision.folio,
      estado: decision.estado,
    },
  });

  const update: Record<string, unknown> = {
    estado: decision.estado,
    acuse_resultado: input.resultado,
    acuse: {
      resultado: input.resultado,
      folio: decision.folio,
      documento_id: doc.id,
      sha256: doc.sha256,
      registrado_en: new Date().toISOString(),
    },
  };

  // Rechazo: reafirmar plazos originales (no mutarlos).
  if (input.resultado === 'rechazo' && aviso?.fecha_conocimiento && aviso?.plazo_limite_24h) {
    const conservados = plazosTrasAcuse({
      resultado: 'rechazo',
      fechaConocimiento: new Date(aviso.fecha_conocimiento),
      plazoLimite: new Date(aviso.plazo_limite_24h),
    });
    update.fecha_conocimiento = conservados.fechaConocimiento.toISOString();
    update.plazo_limite_24h = conservados.plazoLimite.toISOString();
  }

  const { error } = await db.from('aviso').update(update).eq('id', input.avisoId);
  if (error) throw error;
}
