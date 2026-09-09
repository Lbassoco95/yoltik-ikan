import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';
import {
  normalizarRfc,
  type DeterminacionFuente,
  type EfectoLista,
  type EstadoFuente,
  type FundamentoConsulta,
  type ModoOperacion,
  type ListaCarga,
  type ListaFuente,
  type ModoActualizacion,
  type MovimientoCaptura,
  type NaturalezaLista,
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
      // Se ordena por el fundamento y no por `obligatoria`: esa columna sigue en
    // la tabla pero ya no es lo que la pantalla afirma, y ordenar por ella
    // pondría arriba fuentes por una razón que dejamos de sostener.
    .order('fundamento', { ascending: true })
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

// =====================================================================
// Carga de archivo (fuentes de snapshot)
// =====================================================================

/** Filas por petición. 14,761 registros en una sola llamada excede el límite
 *  del gateway; de uno en uno serían 14,761 viajes. 500 es el punto donde
 *  cada lote pesa poco y el total cabe en ~30 peticiones. */
const TAMANO_LOTE = 500;

export interface RegistroParaCarga {
  nombre: string;
  rfc?: string | null;
  tipo_entidad?: string;
  situacion?: string | null;
  pais?: string | null;
  /** Fila del archivo de origen. Dato de PROCEDENCIA, para poder señalar una
   *  fila; ya no decide nada. Ver migration 0065. */
  orden_origen?: number | null;
  /** Publicación de la situación (DOF, o página del SAT). Es lo que resuelve
   *  cuando un mismo RFC viene varias veces: son procedimientos distintos y el
   *  archivo no los ordena por fecha. */
  fecha_situacion?: string | null;
  /** El oficio global que respalda la situación. Va al expediente. */
  oficio_situacion?: string | null;
  /** El historial por etapas que trae la fila. */
  identificadores?: Json;
  /**
   * El identificador estable que da la fuente: el id de la entidad en OFAC, el
   * REFERENCE_NUMBER de la ONU. Es la llave con la que el motor resuelve a qué
   * registro afecta el movimiento — nunca el nombre, que cambia de grafía entre
   * publicaciones. El 69-B no lo publica y usa el RFC.
   */
  identificador_fuente?: string | null;
  /** Alias que la fuente da por buenos. Son 30,309 en OFAC y 2,555 en la ONU. */
  nombres_alternos?: string[];
  /**
   * Alias que la fuente misma marca de baja calidad. Van aparte porque
   * levantan un candidato a revisar, no una coincidencia.
   */
  nombres_alternos_debiles?: string[];
}

export interface CargaArchivoInput {
  fuente_id: string;
  archivo: File;
  /** 'completa' aplica la diferencia y da de baja lo ausente. 'parcial' sólo
   *  agrega y actualiza. Ante la duda, parcial. */
  alcance: 'completa' | 'parcial';
  fecha_publicacion_fuente: string | null;
  notas?: string;
  registros: RegistroParaCarga[];
  /** Progreso, para que una carga de 30 lotes no parezca colgada. */
  onProgreso?: (hechos: number, total: number) => void;
}

export interface ResultadoCargaArchivo {
  carga_id: string;
  insertados: number;
  desactivados: number;
  archivo_hash: string;
}

/** SHA-256 del archivo original, para poder demostrar después que lo que se
 *  cargó es lo que la autoridad publicó. */
export async function hashArchivo(archivo: File): Promise<string> {
  const buf = await archivo.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Sube el archivo, registra la carga e inserta sus movimientos por lotes.
 *
 * El archivo original se guarda ANTES de tocar la base: sin evidencia de qué
 * se cargó, los registros son afirmaciones sin respaldo. Si la subida falla,
 * no se registra nada.
 *
 * Si un lote falla a la mitad, se revierte la carga completa. Media lista
 * aplicada es peor que ninguna: nadie sabría qué quedó dentro.
 */
export async function registrarCargaArchivo(
  input: CargaArchivoInput,
): Promise<ResultadoCargaArchivo> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id ?? null;

  const hash = await hashArchivo(input.archivo);
  const ruta = `${input.fuente_id}/${Date.now()}-${input.archivo.name}`;

  const { error: errSubida } = await supabase.storage
    .from('listas-archivos')
    .upload(ruta, input.archivo, { upsert: false });
  if (errSubida) {
    throw new Error(
      `No se pudo guardar el archivo original: ${errSubida.message}. ` +
        'No se registró ninguna carga: sin evidencia del archivo, los registros no tendrían respaldo.',
    );
  }

  const { data: carga, error: errCarga } = await supabase
    .from('lista_carga')
    .insert({
      fuente_id: input.fuente_id,
      tipo: 'archivo',
      estado: 'aplicada',
      alcance: input.alcance,
      fecha_publicacion_fuente: input.fecha_publicacion_fuente,
      archivo_path: ruta,
      archivo_hash: hash,
      archivo_nombre: input.archivo.name,
      notas: input.notas || null,
      cargada_por: uid,
    })
    .select('id')
    .single();

  if (errCarga || !carga) {
    throw new Error(`No se pudo crear la carga: ${errCarga?.message ?? 'sin detalle'}`);
  }
  const cargaId = (carga as { id: string }).id;

  let insertados = 0;
  try {
    for (let i = 0; i < input.registros.length; i += TAMANO_LOTE) {
      const lote = input.registros.slice(i, i + TAMANO_LOTE).map((r) => ({
        carga_id: cargaId,
        // `as const` y no `string`: dentro de un `.map()` el literal se ensancha
        // solo, y la columna es un enum de dos valores. El valor aquí SIEMPRE es
        // 'alta' —esta función carga, no da de baja—, así que no hay nada que
        // decidir: sólo que el tipo lo diga.
        accion: 'alta' as const,
        tipo_entidad: r.tipo_entidad ?? 'empresa',
        nombre: r.nombre,
        rfc: r.rfc ? normalizarRfc(r.rfc) : null,
        situacion: r.situacion ?? null,
        pais: r.pais ?? null,
        orden_origen: r.orden_origen ?? null,
        fecha_situacion: r.fecha_situacion ?? null,
        oficio_situacion: r.oficio_situacion ?? null,
        identificadores: r.identificadores ?? {},
        identificador_fuente: r.identificador_fuente ?? null,
        nombres_alternos: r.nombres_alternos ?? [],
        nombres_alternos_debiles: r.nombres_alternos_debiles ?? [],
      }));
      const { error } = await supabase.from('lista_movimiento').insert(lote);
      if (error) {
        throw new Error(
          `Falló el lote que empieza en el registro ${i + 1} («${lote[0]?.nombre}»): ${error.message}`,
        );
      }
      insertados += lote.length;
      input.onProgreso?.(insertados, input.registros.length);
    }
  } catch (e) {
    await revertirCarga(cargaId, `Revertida automáticamente: ${(e as Error).message}`).catch(() => {
      /* Si la reversión falla, gana el error original: es el que explica qué pasó. */
    });
    throw e;
  }

  // La diferencia se aplica al final: hasta aquí no se sabía si el archivo
  // había terminado. En una carga parcial devuelve cero y no da de baja a nadie.
  const { data: desactivados, error: errCierre } = await supabase.rpc('cerrar_carga_completa', {
    p_carga_id: cargaId,
  });
  if (errCierre) {
    throw new Error(
      `Los ${insertados} registros se cargaron, pero no se pudo aplicar la diferencia: ${errCierre.message}. ` +
        'La carga quedó registrada; revísala antes de dar por buena la lista.',
    );
  }

  return {
    carga_id: cargaId,
    insertados,
    desactivados: Number(desactivados ?? 0),
    archivo_hash: hash,
  };
}

// =====================================================================
// Job de listas: propuestas y avisos (migration 0016)
// =====================================================================

export interface JobEjecucion {
  id: string;
  fuente_id: string;
  iniciado_en: string;
  terminado_en: string | null;
  resultado: 'exito' | 'sin_cambios' | 'error' | null;
  carga_id: string | null;
  registros_leidos: number | null;
  filas_descartadas: number | null;
  error_mensaje: string | null;
  detalle: Record<string, unknown>;
  atendido_en: string | null;
  fuente_nombre?: string;
}

export interface DiferenciaCarga {
  concepto: string;
  cantidad: number;
  nota: string;
}

/** Errores del job que nadie ha revisado. Es lo que la consola muestra como
 *  aviso: un job que falla en silencio es peor que no tener job. */
export async function listarErroresJobPendientes(): Promise<JobEjecucion[]> {
  const { data, error } = await supabase
    .from('lista_job_ejecucion')
    .select('*, lista_fuente(nombre)')
    .eq('resultado', 'error')
    .is('atendido_en', null)
    .order('iniciado_en', { ascending: false });
  if (error) throw new Error(`No se pudieron leer los avisos del job: ${error.message}`);
  return (data ?? []).map((j: Record<string, unknown>) => ({
    ...(j as unknown as JobEjecucion),
    fuente_nombre: (j.lista_fuente as { nombre?: string } | null)?.nombre,
  }));
}

export async function marcarErrorAtendido(id: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('lista_job_ejecucion')
    .update({ atendido_en: new Date().toISOString(), atendido_por: userData?.user?.id ?? null })
    .eq('id', id);
  if (error) throw new Error(`No se pudo marcar el aviso: ${error.message}`);
}

/** Cargas que el job dejó propuestas y esperan que alguien decida. */
export async function listarCargasPendientes(): Promise<ListaCarga[]> {
  const { data, error } = await supabase
    .from('lista_carga')
    .select('*, lista_fuente(codigo, nombre)')
    .eq('estado', 'borrador')
    .order('cargada_en', { ascending: false });
  if (error) throw new Error(`No se pudieron leer las cargas pendientes: ${error.message}`);
  return (data ?? []).map((c: Record<string, unknown>) => ({
    ...(c as unknown as ListaCarga),
    fuente_codigo: (c.lista_fuente as { codigo?: string } | null)?.codigo,
  }));
}

/** La diferencia propuesta, calculada al vuelo contra el estado vigente. */
export async function diferenciaCargaBorrador(cargaId: string): Promise<DiferenciaCarga[]> {
  const { data, error } = await supabase.rpc('diferencia_carga_borrador', { p_carga_id: cargaId });
  if (error) throw new Error(`No se pudo calcular la diferencia: ${error.message}`);
  return (data ?? []) as DiferenciaCarga[];
}

/** Acepta la propuesta. Es el único camino por el que un job llega a afectar
 *  el estado vigente que consumen las organizaciones. */
export async function aprobarCargaBorrador(
  cargaId: string,
): Promise<{ promovidos: number; desactivados: number }> {
  const { data, error } = await supabase.rpc('promover_carga_borrador', { p_carga_id: cargaId });
  if (error) throw new Error(`No se pudo aprobar la carga: ${error.message}`);
  const fila = Array.isArray(data) ? data[0] : data;
  return (fila ?? { promovidos: 0, desactivados: 0 }) as { promovidos: number; desactivados: number };
}

export async function descartarCargaBorrador(cargaId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('descartar_carga_borrador', {
    p_carga_id: cargaId,
    p_motivo: motivo,
  });
  if (error) throw new Error(`No se pudo descartar la carga: ${error.message}`);
}

// =====================================================================
// Estado de listas para la organización cliente (migration 0017)
// =====================================================================

export interface EstadoLista {
  codigo: string;
  nombre: string;
  autoridad: string;
  naturaleza: NaturalezaLista;
  modo_actualizacion: ModoActualizacion;
  url_oficial: string | null;
  obligatoria: boolean;
  situaciones: string[] | null;
  situaciones_bloqueantes: string[] | null;
  /** Fecha de la FUENTE, no de cuándo Kawiil la cargó. Null = nunca se ha
   *  aplicado una carga, y la pantalla debe decirlo así de claro. */
  actualizada_al: string | null;
  registros_vigentes: number;
  /**
   * Qué produce una coincidencia en esta fuente. Null = la fuente todavía no
   * lo ha declarado, y entonces no puede producir efecto automático. Null NO
   * es «sin efecto»: es «no declarado», y son cosas distintas.
   */
  efecto: EfectoLista | null;
  /** Para las fuentes con situaciones, el efecto de cada una. Manda sobre `efecto`. */
  efectos_por_situacion: Record<string, EfectoLista> | null;
  determinacion: DeterminacionFuente;
  fundamento_determinacion: string | null;
  /**
   * De dónde nace la exigencia de consultar la fuente. Independiente de
   * `efecto`, que dice qué pasa si hay coincidencia. Null en la fuente que no
   * se puede consultar: ahí una etiqueta insinuaría que hay algo que mirar.
   */
  fundamento: Exclude<FundamentoConsulta, 'pendiente_manual'> | null;
  /** La cita que sostiene el fundamento, para poder defenderla en una visita. */
  fundamento_norma: string | null;
  /**
   * La etiqueta que se pinta. La resuelve la vista y no este front: vale
   * `pendiente_manual` cuando la organización no tiene Manual asentado, y esa
   * regla es demasiado fácil de olvidar en un componente.
   */
  fundamento_efectivo: FundamentoConsulta | null;
  /** Si el barrido la consulta, o si está cargada para revisarse. */
  modo_operacion: ModoOperacion;
  /** cargada · pendiente_carga · pendiente_determinacion · no_aplica */
  estado: EstadoFuente;
  /** Los que IMPIDEN. Un presunto del 69-B cuenta en el total pero no aquí, y
   *  una coincidencia de OFAC tampoco: eleva la diligencia, no impide. */
  registros_bloqueantes: number;
  /** Los que exigen diligencia reforzada sin impedir. */
  registros_eleva_diligencia: number;
  /** Cargados pero cuya fuente no declaró qué producen. Un hueco visible. */
  registros_sin_efecto_declarado: number;
}

/** Lo que ve el sujeto obligado: qué listas se consultan y desde cuándo.
 *  Sólo lectura — un cliente no actualiza listas, las consume. */
export async function estadoDeListas(): Promise<EstadoLista[]> {
  const { data, error } = await supabase
    .from('v_listas_estado')
    .select('*')
      // Se ordena por el fundamento y no por `obligatoria`: esa columna sigue en
    // la tabla pero ya no es lo que la pantalla afirma, y ordenar por ella
    // pondría arriba fuentes por una razón que dejamos de sostener.
    .order('fundamento', { ascending: true })
    .order('nombre');
  if (error) throw new Error(`No se pudo leer el estado de las listas: ${error.message}`);
  return (data ?? []) as unknown as EstadoLista[];
}

/**
 * Contra qué se barrió y contra qué no, con el motivo.
 *
 * Acompaña a `listarVigentes`. Sin esto, un resultado vacío se leería como «la
 * persona está limpia» cuando puede significar «no se miró nada»: es el falso
 * negativo que la instrucción 297 existe para evitar, y el material de la 246.
 */
export interface CoberturaBarrido {
  fuente: string;
  fuente_nombre: string;
  se_barrio: boolean;
  registros_vigentes: number;
  motivo: string | null;
}

export async function coberturaDelBarrido(): Promise<CoberturaBarrido[]> {
  const { data, error } = await supabase.rpc('cobertura_del_barrido');
  if (error) throw new Error(`No se pudo leer la cobertura del barrido: ${error.message}`);
  return (data ?? []) as CoberturaBarrido[];
}
