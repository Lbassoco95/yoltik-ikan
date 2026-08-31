import { supabase } from '@/lib/supabase';
import { contextoSesion } from './contexto';
import { canalDeActo } from '@/lib/perfil-actividad';
import type { OperacionDelPeriodo, HallazgoDelPeriodo } from '@/lib/aviso-mensual';
import type { ActoParaXml, EntradaAviso } from '@/lib/aviso/generador-xml';

/** Primer y último día del periodo AAAA-MM, en ISO. */
function rangoDelMes(periodo: string): { desde: string; hasta: string } {
  const [a, m] = periodo.split('-').map(Number);
  const desde = new Date(Date.UTC(a, m - 1, 1));
  const hasta = new Date(Date.UTC(a, m, 1));
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

interface FilaOperacion {
  id: string;
  client_id: string;
  monto_mxn: number;
  fecha: string;
  requiere_aviso: boolean;
  evaluada_en: string | null;
  instrumento_publico: string | null;
  datos_acto: Record<string, unknown> | null;
  contraparte: Record<string, unknown> | null;
  folio?: string | null;
}

interface FilaCliente {
  id: string;
  nombre_razon_social: string;
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  fecha_nacimiento: string | null;
  rfc: string | null;
  curp: string | null;
}

export interface PeriodoAviso {
  periodo: string;
  operaciones: OperacionDelPeriodo[];
  hallazgos: HallazgoDelPeriodo[];
  /** Todo lo que hace falta para armar el XML, ya cruzado con comparecientes. */
  entrada: EntradaAviso;
  /** Sujeto obligado incompleto: la pantalla lo dice antes de intentar generar. */
  faltanClavesPadron: boolean;
}

/**
 * Arma todo lo que el periodo necesita: operaciones, hallazgos abiertos y la
 * entrada del generador de XML.
 *
 * Una sola función a propósito. Si la pantalla pidiera las piezas por separado
 * podría acabar evaluando la regla del informe en ceros con un conjunto de
 * operaciones y generando el XML con otro —por una recarga a medias, por un
 * filtro distinto— y presentar en ceros un mes que sí tenía operaciones. Eso es
 * exactamente el error que la regla existe para impedir.
 */
export async function cargarPeriodo(periodo: string): Promise<PeriodoAviso> {
  const { organizationId } = await contextoSesion();
  const { desde, hasta } = rangoDelMes(periodo);

  const [ops, org] = await Promise.all([
    supabase
      .from('operation')
      .select('id, client_id, monto_mxn, fecha, requiere_aviso, evaluada_en, instrumento_publico, datos_acto, contraparte, folio')
      .eq('organization_id', organizationId)
      .gte('fecha', desde)
      .lt('fecha', hasta)
      .order('fecha'),
    supabase
      .from('organizations')
      .select('clave_sujeto_obligado, clave_actividad, clave_entidad_colegiada')
      .eq('id', organizationId)
      .maybeSingle(),
  ]);
  if (ops.error) throw ops.error;

  const filas = (ops.data ?? []) as unknown as FilaOperacion[];

  // Los comparecientes de esas operaciones, en una sola consulta.
  const ids = [...new Set(filas.map((o) => o.client_id))];
  const clientes = ids.length
    ? await supabase
        .from('client')
        .select('id, nombre_razon_social, nombre, apellido_paterno, apellido_materno, fecha_nacimiento, rfc, curp')
        .in('id', ids)
    : { data: [], error: null };
  if (clientes.error) throw clientes.error;
  const porId = new Map(
    ((clientes.data ?? []) as unknown as FilaCliente[]).map((c) => [c.id, c]),
  );

  // Hallazgos abiertos del periodo. No bloquean el aviso: sólo se recuerdan.
  const hall = await supabase
    .from('hallazgo')
    .select('id, folio, estado, tipologia_codigo, fecha_compromiso, creado_en')
    .eq('organization_id', organizationId)
    .in('estado', ['abierto', 'en_revision'])
    .lt('creado_en', hasta);

  const operaciones: OperacionDelPeriodo[] = filas.map((o) => {
    const tipoActo = String((o.contraparte as Record<string, unknown> | null)?.tipo_acto ?? '');
    return {
      id: o.id,
      tipo_acto: tipoActo,
      monto_mxn: Number(o.monto_mxn),
      fecha: o.fecha,
      rebasa_umbral: o.requiere_aviso,
      evaluada: o.evaluada_en != null,
      canal: canalDeActo(tipoActo) ?? 'sppld',
    };
  });

  const hallazgos: HallazgoDelPeriodo[] = (
    (hall.data ?? []) as unknown as {
      id: string; folio: string | null; estado: string;
      tipologia_codigo: string; fecha_compromiso: string | null;
    }[]
  ).map((h) => ({
    id: h.id,
    folio: h.folio,
    tipologia_codigo: h.tipologia_codigo,
    estado: h.estado,
    fecha_compromiso: h.fecha_compromiso,
  }));

  // Sólo los actos del SPPLD entran al XML. Los de DeclaraNOT se listan aparte
  // en la evaluación, para que nadie los dé por reportados aquí.
  const actos: ActoParaXml[] = filas
    .filter((o) => canalDeActo(String((o.contraparte as Record<string, unknown> | null)?.tipo_acto ?? '')) === 'sppld')
    .map((o, i) => {
      const c = porId.get(o.client_id);
      return {
        // Referencia estable y trazable: el folio del acto si lo tiene, si no
        // su posición en el periodo. Hasta 14 caracteres, sin guiones.
        referencia_aviso: (o.folio ?? `${periodo.replace('-', '')}${String(i + 1).padStart(4, '0')}`)
          .replace(/[^A-Za-z0-9]/g, '')
          .slice(0, 14),
        prioridad: '1',
        // TODO[Sprint D-3]: cuando el OC confirme un hallazgo sobre el acto,
        // la alerta sale de su tipología y la prioridad pasa a 2.
        alerta: { tipo: '100', descripcion: 'Sin alerta' },
        persona: {
          nombre: c?.nombre ?? null,
          apellido_paterno: c?.apellido_paterno ?? null,
          apellido_materno: c?.apellido_materno ?? null,
          fecha_nacimiento: c?.fecha_nacimiento ?? null,
          rfc: c?.rfc ?? null,
          curp: c?.curp ?? null,
        },
        instrumento_publico: o.instrumento_publico,
        fecha_operacion: o.fecha,
        tipo_acto: String((o.contraparte as Record<string, unknown> | null)?.tipo_acto ?? ''),
        datos_acto: o.datos_acto ?? {},
      };
    });

  const claves = (org.data ?? {}) as {
    clave_sujeto_obligado?: string | null;
    clave_actividad?: string | null;
    clave_entidad_colegiada?: string | null;
  };

  return {
    periodo,
    operaciones,
    hallazgos,
    faltanClavesPadron: !claves.clave_sujeto_obligado || !claves.clave_actividad,
    entrada: {
      mes_reportado: periodo,
      sujeto: {
        clave_sujeto_obligado: claves.clave_sujeto_obligado ?? null,
        clave_actividad: claves.clave_actividad ?? null,
        clave_entidad_colegiada: claves.clave_entidad_colegiada ?? null,
      },
      actos,
    },
  };
}

/** Los periodos con actividad, del más reciente al más viejo. */
export async function periodosConActos(): Promise<string[]> {
  const { organizationId } = await contextoSesion();
  const { data, error } = await supabase
    .from('operation')
    .select('fecha')
    .eq('organization_id', organizationId)
    .order('fecha', { ascending: false })
    .limit(2000);
  if (error) throw error;
  const meses = new Set(
    ((data ?? []) as { fecha: string }[]).map((o) => o.fecha.slice(0, 7)),
  );
  return [...meses].sort().reverse();
}

/**
 * Guarda el aviso generado. El XML se conserva tal cual: si el SAT observa el
 * aviso, lo que hay que mostrar es el archivo, no una reconstrucción.
 * El insert dispara el emisor de bitácora (migration 0025).
 */
export async function guardarAviso(entrada: {
  periodo: string;
  xml: string;
  referencia: string;
  operation_ids: string[];
  exento: boolean;
  layout_version?: string;
}): Promise<string> {
  const { uid, organizationId } = await contextoSesion();
  const { data, error } = await supabase
    .from('aviso')
    .insert({
      organization_id: organizationId,
      tipo: 'mensual',
      periodo: entrada.periodo,
      payload: { actos: entrada.operation_ids.length, exento: entrada.exento },
      operation_ids: entrada.operation_ids,
      xml: entrada.xml,
      referencia: entrada.referencia,
      exento: entrada.exento,
      layout: 'fep',
      layout_version: entrada.layout_version ?? null,
      generado_por: uid,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export interface AvisoGuardado {
  id: string;
  periodo: string | null;
  referencia: string | null;
  exento: boolean;
  estado: string;
  operation_ids: string[];
  layout: string;
  layout_version: string | null;
  generado_en: string;
  xml: string | null;
}

/** Los avisos ya generados de un periodo, del más reciente al más viejo. */
export async function listarAvisos(periodo: string): Promise<AvisoGuardado[]> {
  const { organizationId } = await contextoSesion();
  const { data, error } = await supabase
    .from('aviso')
    .select('id, periodo, referencia, exento, estado, operation_ids, layout, layout_version, generado_en, xml')
    .eq('organization_id', organizationId)
    .eq('periodo', periodo)
    .order('generado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as AvisoGuardado[];
}
