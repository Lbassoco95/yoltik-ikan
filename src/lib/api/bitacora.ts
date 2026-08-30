import { supabase } from '@/lib/supabase';
import { contextoSesion } from './contexto';
import type { EventoBitacora, PaqueteVerificacion } from '@/lib/bitacora/verificador';

/** Cadena de plataforma: lo que hace Kawiil y afecta a todos los clientes. */
export const CADENA_PLATAFORMA = '00000000-0000-0000-0000-000000000000';

export interface EstadoCadena {
  organization_id: string;
  ultima_secuencia: number;
  ultimo_hash: string;
  actualizado_en: string | null;
}

/** Cabeza de la cadena. `ultima_secuencia = 0` es una cadena que aún no
 *  registra nada, no un error. */
export async function estadoCadena(organizationId?: string): Promise<EstadoCadena> {
  const id = organizationId ?? (await contextoSesion()).organizationId;
  const { data, error } = await supabase
    .from('cadena_auditoria')
    .select('organization_id, ultima_secuencia, ultimo_hash, actualizado_en')
    .eq('organization_id', id)
    .maybeSingle();
  if (error) throw error;
  return (
    (data as unknown as EstadoCadena) ?? {
      organization_id: id,
      ultima_secuencia: 0,
      ultimo_hash: '0'.repeat(64),
      actualizado_en: null,
    }
  );
}

export interface EventoListado {
  id: string;
  secuencia: number;
  tipo: string;
  entidad: string;
  entidad_id: string | null;
  actor_tipo: string;
  actor_id: string | null;
  versiones: Record<string, unknown>;
  payload: Record<string, unknown>;
  evento_hash: string;
  cadena_hash: string;
  hash_anterior: string;
  registrado_en: string;
}

export interface FiltroEventos {
  entidad?: string;
  tipo?: string;
  /** Página: se lee de la más reciente hacia atrás. */
  antesDeSecuencia?: number;
  limite?: number;
}

/**
 * Página de la bitácora, de la más reciente hacia atrás.
 *
 * Se pagina por `secuencia` y no por desplazamiento: la cadena sólo crece por
 * el final, así que un cursor por secuencia no se desordena ni repite filas
 * cuando entran eventos mientras alguien está leyendo.
 *
 * La lee OC y Admin de su organización; la política `evento_select` lo vuelve a
 * comprobar en la base.
 */
export async function listarEventos(filtro: FiltroEventos = {}): Promise<EventoListado[]> {
  const { organizationId } = await contextoSesion();
  const limite = filtro.limite ?? 50;
  let q = supabase
    .from('evento_auditoria')
    .select(
      'id, secuencia, tipo, entidad, entidad_id, actor_tipo, actor_id, versiones, payload, ' +
        'evento_hash, cadena_hash, hash_anterior, registrado_en',
    )
    .eq('organization_id', organizationId)
    .order('secuencia', { ascending: false })
    .limit(limite);

  if (filtro.entidad) q = q.eq('entidad', filtro.entidad);
  if (filtro.tipo) q = q.eq('tipo', filtro.tipo);
  if (filtro.antesDeSecuencia != null) q = q.lt('secuencia', filtro.antesDeSecuencia);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as EventoListado[];
}

/**
 * Las entidades y los tipos que la bitácora ya registró, para poblar los
 * filtros. Sale de los eventos reales y no de una lista fija: si mañana se
 * emite un evento nuevo, el filtro lo ofrece sin tocar código.
 *
 * Mira los últimos 1000 eventos, que es lo que la pantalla puede recorrer sin
 * traerse la bitácora entera.
 */
export async function facetasEventos(): Promise<{ entidades: string[]; tipos: string[] }> {
  const { organizationId } = await contextoSesion();
  const { data, error } = await supabase
    .from('evento_auditoria')
    .select('tipo, entidad')
    .eq('organization_id', organizationId)
    .order('secuencia', { ascending: false })
    .limit(1000);
  if (error) throw error;
  const filas = (data ?? []) as { tipo: string; entidad: string }[];
  return {
    entidades: [...new Set(filas.map((f) => f.entidad))].sort(),
    tipos: [...new Set(filas.map((f) => f.tipo))].sort(),
  };
}

/** Verificación hecha por la base. Devuelve las roturas; vacío = íntegra. */
export async function verificarEnBase(
  organizationId?: string,
): Promise<{ secuencia: number; motivo: string }[]> {
  const id = organizationId ?? (await contextoSesion()).organizationId;
  const { data, error } = await supabase.rpc('verificar_cadena', { p_organization_id: id });
  if (error) throw error;
  return (data ?? []) as { secuencia: number; motivo: string }[];
}

/**
 * Paquete de verificación descargable.
 *
 * Lleva lo necesario para recalcular la cadena sin nosotros. Se pagina porque
 * una bitácora de un año no cabe en una sola respuesta, y se pide en orden de
 * secuencia para que el verificador no dependa del orden en que llegó.
 */
export async function exportarPaquete(organizationId?: string): Promise<PaqueteVerificacion> {
  const id = organizationId ?? (await contextoSesion()).organizationId;
  const cabeza = await estadoCadena(id);

  const eventos: EventoBitacora[] = [];
  const TAMANO = 1000;
  for (let desde = 1; ; desde += TAMANO) {
    const { data, error } = await supabase
      .from('evento_auditoria')
      .select('secuencia, payload_canonico, nonce, evento_hash, cadena_hash, hash_anterior, tipo, entidad, registrado_en')
      .eq('organization_id', id)
      .gte('secuencia', desde)
      .lt('secuencia', desde + TAMANO)
      .order('secuencia');
    if (error) throw error;
    const lote = (data ?? []) as unknown as EventoBitacora[];
    eventos.push(...lote);
    if (desde + TAMANO > cabeza.ultima_secuencia) break;
  }

  return {
    organization_id: id,
    generado_en: new Date().toISOString(),
    ultima_secuencia: cabeza.ultima_secuencia,
    ultimo_hash: cabeza.ultimo_hash,
    eventos,
  };
}
