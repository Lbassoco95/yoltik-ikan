import { supabase } from '@/lib/supabase';
import { contextoSesion } from './contexto';
import { comoJson } from './json';
import type {
  ClasificacionRiesgo,
  Client,
  ClientRiskTemplate,
  NuevoClienteInput,
  SectorAV,
} from '@/types/domain';
import {
  evaluarMatriz,
  respuestasCompletas,
  type ContextoEvaluacion,
  type ResultadoEvaluacion,
} from '@/lib/riesgo/matriz';

/** Lista los clientes visibles para el usuario (RLS filtra por rol/organización). */
export async function listarClientes(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('client')
    .select('*')
    .order('capturado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Client[];
}

export async function getCliente(id: string): Promise<Client | null> {
  const { data, error } = await supabase.from('client').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as unknown as Client) ?? null;
}

/** Alta de cliente final por el Operador. organization_id y capturado_por
 *  se resuelven desde la sesión (no viajan en el formulario). */
export async function crearCliente(input: NuevoClienteInput): Promise<Client> {
  const { uid, organizationId } = await contextoSesion();

  // Perfil de actividad vulnerable (migration 0077): sin él la base también
  // rechaza, pero el mensaje de Postgres es opaco; aquí se dice en claro.
  const { organizacionTienePerfilAv } = await import('@/lib/api/formatos-uif');
  if (!(await organizacionTienePerfilAv())) {
    throw new Error(
      'Sin perfil de actividad vulnerable no se puede capturar clientes. Configure la fracción y el anexo de la organización antes de continuar.',
    );
  }

  const fila = {
    organization_id: organizationId,
    tipo_persona: input.tipo_persona,
    nombre_razon_social: input.nombre_razon_social,
    // Campos que el aviso pide por separado (layout fep 3.5.x, migration 0019).
    // Se mandan siempre, incluso en null, para que un alta corregida borre lo
    // que ya no aplica en vez de arrastrarlo.
    nombre: input.nombre ?? null,
    apellido_paterno: input.apellido_paterno ?? null,
    apellido_materno: input.apellido_materno ?? null,
    fecha_nacimiento: input.fecha_nacimiento ?? null,
    fecha_constitucion: input.fecha_constitucion ?? null,
    pais_nacionalidad_clave: input.pais_nacionalidad_clave ?? null,
    actividad_economica_clave: input.actividad_economica_clave ?? null,
    entidad_federativa_clave: input.entidad_federativa_clave ?? null,
    rfc: input.rfc ?? null,
    curp: input.curp ?? null,
    nacionalidad: input.nacionalidad ?? null,
    entidad_federativa: input.entidad_federativa ?? null,
    pais_residencia_iso2: input.pais_residencia_iso2 ?? null,
    datos_kyc: comoJson(input.datos_kyc ?? {}),
    // Factores del Capítulo III Ter y del catálogo de las RCG (migration 0041).
    // Se capturan en el alta y no después: el canal por el que llegó alguien
    // deja de saberse en cuanto pasa el día.
    canal_distribucion: input.canal_distribucion ?? null,
    municipio: input.municipio?.trim() || null,
    frecuencia_esperada_anual:
      typeof input.frecuencia_esperada_anual === 'number' ? input.frecuencia_esperada_anual : null,
    capturado_por: uid,
  };
  const { data, error } = await supabase.from('client').insert(fila).select('*').single();
  if (error) throw error;
  return data as unknown as Client;
}

/** Plantilla de matriz de riesgo vigente de la organización.
 *
 *  No filtra por sector a propósito: RLS ya acota a la organización y la
 *  migration 0010 garantiza una sola versión activa por organización y sector.
 *  Así sirve igual a Ixim Pay (XVI) que a la notaría (XII) sin condicionales
 *  por perfil.
 *  TODO[Sprint D-3]: recibir el sector cuando una organización opere más de uno. */
/**
 * Plantilla vigente para un sector.
 *
 * El sector es OBLIGATORIO. Antes esta función tomaba cualquier plantilla
 * activa de la organización, pero el índice único de la 0010 es
 * `(organization_id, sector) where activa`: una organización puede tener una
 * matriz activa POR SECTOR. Sin filtrar, una notaría con una plantilla XVI
 * espuria podía evaluar a un compareciente con la matriz de un exchange.
 */
export async function getPlantillaRiesgoActiva(
  sector: SectorAV,
): Promise<ClientRiskTemplate | null> {
  const { data, error } = await supabase
    .from('client_risk_template')
    .select('*')
    .eq('activa', true)
    .eq('sector', sector)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ClientRiskTemplate) ?? null;
}

export interface EvaluacionGuardada extends ResultadoEvaluacion {
  id: string;
}

/** Una evaluación tal como quedó guardada. */
export interface EvaluacionPersistida {
  id: string;
  client_id: string;
  template_id: string;
  respuestas: Record<string, number>;
  /** Clave de la opción elegida por variable (migration 0047). Vacío en las
   *  evaluaciones anteriores, que se guardaron sin ella. */
  respuestas_clave: Record<string, string>;
  score_total: number;
  clasificacion: ClasificacionRiesgo;
  motivo_alto_de_oficio: string | null;
  evaluado_en: string;
  /** Orden de llegada inequívoco (migration 0057). `evaluado_en` empata entre
   *  evaluaciones guardadas en la misma transacción. */
  secuencia: number;
}

/**
 * La última evaluación de un compareciente.
 *
 * Se escribía y nunca se leía: al reabrir el expediente la matriz salía en
 * blanco, como si nadie lo hubiera evaluado. Un expediente de PLD que no
 * muestra la calificación vigente de su cliente no sirve de mucho.
 */
export async function ultimaEvaluacion(clientId: string): Promise<EvaluacionPersistida | null> {
  const { data, error } = await supabase
    .from('client_risk_assessment')
    .select('id, client_id, template_id, respuestas, respuestas_clave, score_total, clasificacion, motivo_alto_de_oficio, evaluado_en, secuencia')
    .eq('client_id', clientId)
    .order('secuencia', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as EvaluacionPersistida) ?? null;
}

/**
 * La última evaluación de varios comparecientes, para la lista.
 *
 * Una consulta y no una por fila: con doscientos clientes, doscientas consultas
 * hacen la pantalla inusable. Se traen las evaluaciones ordenadas y se queda la
 * primera de cada cliente.
 */
export async function ultimasEvaluaciones(
  clientIds: string[],
): Promise<Map<string, EvaluacionPersistida>> {
  if (clientIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('client_risk_assessment')
    .select('id, client_id, template_id, respuestas, respuestas_clave, score_total, clasificacion, motivo_alto_de_oficio, evaluado_en, secuencia')
    .in('client_id', clientIds)
    .order('secuencia', { ascending: false });
  if (error) throw error;

  const porCliente = new Map<string, EvaluacionPersistida>();
  for (const e of (data ?? []) as unknown as EvaluacionPersistida[]) {
    if (!porCliente.has(e.client_id)) porCliente.set(e.client_id, e);
  }
  return porCliente;
}

/**
 * Calcula y guarda la evaluación de riesgo de un cliente.
 *
 * Rechaza la captura incompleta antes de tocar la BD: `client_risk_assessment`
 * exige `score_total` y `clasificacion` no nulos, y un score parcial sería un
 * dato falso, no uno provisional.
 */
export async function evaluarRiesgoCliente(
  plantilla: ClientRiskTemplate,
  cliente: Pick<Client, 'id' | 'tipo_persona'>,
  respuestas: Record<string, number>,
  /**
   * Catálogos cargados, indicadores booleanos y puntos de banderas externas.
   *
   * Sin él, una variable que depende de un catálogo vacío contaría como
   * incompleta para siempre y la matriz no se podría cerrar nunca.
   */
  ctx: ContextoEvaluacion & { plenario_gafi?: string | null } = {},
): Promise<EvaluacionGuardada> {
  const cfg = plantilla.configuracion;
  if (!respuestasCompletas(cfg, cliente.tipo_persona, respuestas, ctx.catalogos_disponibles)) {
    throw new Error('La captura está incompleta: responde todas las variables aplicables.');
  }

  const resultado = evaluarMatriz(cfg, cliente.tipo_persona, respuestas, ctx);
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;

  const { data, error } = await supabase
    .from('client_risk_assessment')
    .insert({
      client_id: cliente.id,
      template_id: plantilla.id,
      respuestas,
      // La clave de cada opción elegida, aparte del número: con el número solo,
      // un fideicomiso y un poder irrevocable son indistinguibles.
      respuestas_clave: comoJson(ctx.claves ?? {}),
      subtotales: resultado.subtotales,
      score_total: resultado.score_total,
      clasificacion: resultado.clasificacion,
      motivo_alto_de_oficio: resultado.motivo_alto_de_oficio,
      // Contra qué versiones se calculó (migration 0041). La metodología, las
      // bandas y los pesos son parámetros normativos igual que los umbrales:
      // sin registrarlos, la reclasificación semestral del Cap. III Bis es
      // indistinguible de una corrección de errores.
      snapshot_listas_plenario: ctx.plenario_gafi ?? null,
      metodologia_version: plantilla.version,
      evaluado_por: uid,
    })
    .select('id')
    .single();
  if (error) throw error;

  return { ...resultado, id: (data as { id: string }).id };
}

/** Un cambio de nivel de diligencia, tal como quedó asentado (migration 0057). */
export interface CambioNivel {
  desde: string;
  hacia: string;
  motivo: string;
  automatico: boolean;
  registrado_en: string;
}

/**
 * El último cambio de nivel de diligencia del expediente.
 *
 * Se lee para PINTAR el por qué. Un nivel sin motivo a la vista es un número
 * que nadie puede discutir: quien lo vea no sabe si está en N3 porque su
 * matriz salió alta, porque hay un piso activo, o porque alguien lo subió a
 * mano.
 */
export async function ultimoCambioDeNivel(clientId: string): Promise<CambioNivel | null> {
  const { data, error } = await supabase
    .from('cambio_nivel_diligencia')
    .select('desde, hacia, motivo, automatico, registrado_en')
    .eq('client_id', clientId)
    .order('registrado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as CambioNivel) ?? null;
}

/**
 * Guarda la subdivisión del domicilio (migration 0058).
 *
 * Se guarda sola y no dentro del alta porque llega después: el país se captura
 * al dar de alta y la subdivisión sale cuando alguien mira el domicilio con
 * detalle. Obligarla en el alta habría hecho lo que la migration evita a
 * propósito —impedir guardar hasta tener el dato— y en una notaría el
 * compareciente está delante.
 */
export async function guardarSubdivision(
  clientId: string,
  /** La clave, o `'fuera'` para «se preguntó y está fuera de las listadas». */
  respuesta: string | 'fuera' | null,
): Promise<void> {
  const fuera = respuesta === 'fuera';
  const { error } = await supabase
    .from('client')
    .update({
      subdivision_clave: fuera ? null : respuesta?.trim() || null,
      // Las dos viajan siempre: elegir una región después de haber contestado
      // «fuera» tiene que apagar la respuesta anterior, o el check de la base lo
      // rechaza y con razón.
      subdivision_fuera_de_lista: fuera,
    })
    .eq('id', clientId);
  if (error) throw error;
}
