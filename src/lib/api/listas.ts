import { supabase } from '@/lib/supabase';
import {
  normalizarRfc,
  type ListaCarga,
  type ListaFuente,
  type MovimientoCaptura,
  type RegistroVigente,
} from '@/lib/listas';

/** ¿El usuario de la sesión es administrador de plataforma (Kawiil)? */
export async function esAdminPlataforma(): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return false;

  // La política de `platform_admin` sólo deja ver la propia fila, así que
  // esta consulta devuelve una fila o ninguna. No hace falta filtrar más.
  const { data, error } = await supabase
    .from('platform_admin')
    .select('user_id')
    .eq('user_id', uid)
    .maybeSingle();

  if (error) return false;
  return data != null;
}

export async function listarFuentes(): Promise<ListaFuente[]> {
  const { data, error } = await supabase
    .from('lista_fuente')
    .select('*')
    .order('obligatoria', { ascending: false })
    .order('codigo');
  if (error) throw new Error(`No se pudieron leer las fuentes: ${error.message}`);
  return (data ?? []) as unknown as ListaFuente[];
}

export async function listarCargas(limite = 50): Promise<ListaCarga[]> {
  const { data, error } = await supabase
    .from('lista_carga')
    .select('*, lista_fuente(codigo)')
    .order('cargada_en', { ascending: false })
    .limit(limite);
  if (error) throw new Error(`No se pudieron leer las cargas: ${error.message}`);
  return (data ?? []).map((c: Record<string, unknown>) => ({
    ...(c as unknown as ListaCarga),
    fuente_codigo: (c.lista_fuente as { codigo?: string } | null)?.codigo,
  }));
}

export async function listarVigentes(fuente?: string, busqueda?: string): Promise<RegistroVigente[]> {
  let q = supabase.from('v_listas_vigentes').select('*').order('nombre').limit(500);
  if (fuente) q = q.eq('fuente', fuente);
  if (busqueda?.trim()) q = q.ilike('nombre', `%${busqueda.trim()}%`);
  const { data, error } = await q;
  if (error) throw new Error(`No se pudieron leer las listas: ${error.message}`);
  return (data ?? []) as unknown as RegistroVigente[];
}

export interface NuevaCargaInput {
  fuente_id: string;
  fecha_publicacion_fuente?: string;
  notas?: string;
  movimientos: MovimientoCaptura[];
}

/**
 * Registra una carga con sus movimientos.
 *
 * Se inserta la carga primero y los movimientos después, uno por uno: el
 * trigger `aplicar_movimiento_lista` resuelve a qué registro afecta cada uno,
 * y necesita ver el efecto del anterior (un alta seguida de una baja de la
 * misma persona en la misma carga tiene que cotejar).
 *
 * Si un movimiento falla —por ejemplo, una baja de alguien que nunca fue dado
 * de alta— se revierte la carga completa. No se deja a medias: media carga
 * aplicada es peor que ninguna, porque nadie sabría cuál sí entró.
 */
export async function registrarCarga(input: NuevaCargaInput): Promise<{ carga_id: string; aplicados: number }> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id ?? null;

  const { data: carga, error: errCarga } = await supabase
    .from('lista_carga')
    .insert({
      fuente_id: input.fuente_id,
      tipo: 'captura_manual',
      estado: 'aplicada',
      fecha_publicacion_fuente: input.fecha_publicacion_fuente || null,
      notas: input.notas || null,
      cargada_por: uid,
    })
    .select('id')
    .single();

  if (errCarga || !carga) {
    throw new Error(`No se pudo crear la carga: ${errCarga?.message ?? 'sin detalle'}`);
  }

  const cargaId = (carga as { id: string }).id;
  let aplicados = 0;

  for (const m of input.movimientos) {
    const { error } = await supabase.from('lista_movimiento').insert({
      carga_id: cargaId,
      accion: m.accion,
      tipo_entidad: m.tipo_entidad,
      nombre: m.nombre.trim(),
      rfc: normalizarRfc(m.rfc),
      curp: m.curp.trim() || null,
      oficio_numero: m.oficio_numero.trim() || null,
      oficio_fecha: m.oficio_fecha || null,
      motivo: m.motivo.trim() || null,
      situacion: m.situacion || null,
    });

    if (error) {
      await revertirCarga(cargaId, 'Revertida automáticamente: un movimiento de la carga falló').catch(() => {
        /* Si la reversión también falla, gana el error original: es el que
           explica qué pasó. La carga queda visible en la bitácora. */
      });
      throw new Error(
        `El movimiento "${m.nombre}" no se pudo aplicar y se revirtió la carga completa. ${error.message}`,
      );
    }
    aplicados += 1;
  }

  return { carga_id: cargaId, aplicados };
}

/** Deshace una carga equivocada (migration 0013). Recalcula el estado vigente. */
export async function revertirCarga(
  cargaId: string,
  motivo: string,
): Promise<{ registros_recalculados: number; registros_eliminados: number; movimientos_borrados: number }> {
  const { data, error } = await supabase.rpc('revertir_carga_lista', {
    p_carga_id: cargaId,
    p_motivo: motivo,
  });
  if (error) throw new Error(`No se pudo revertir la carga: ${error.message}`);
  const fila = Array.isArray(data) ? data[0] : data;
  return (fila ?? { registros_recalculados: 0, registros_eliminados: 0, movimientos_borrados: 0 }) as {
    registros_recalculados: number;
    registros_eliminados: number;
    movimientos_borrados: number;
  };
}

/** Movimientos de una carga, para poder ver qué entró en ella. */
export async function listarMovimientosDeCarga(cargaId: string) {
  const { data, error } = await supabase
    .from('lista_movimiento')
    .select('id, accion, nombre, rfc, oficio_numero, oficio_fecha, motivo, aplicado_en')
    .eq('carga_id', cargaId)
    .order('aplicado_en');
  if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);
  return data ?? [];
}
