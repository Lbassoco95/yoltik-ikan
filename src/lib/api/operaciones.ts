import { supabase } from '@/lib/supabase';
import { contextoSesion } from './contexto';
import type { FormaPago, NuevaOperacionInput, Operation } from '@/types/domain';
import { comoJson, type Json } from './json';

export async function listarOperaciones(): Promise<Operation[]> {
  const { data, error } = await supabase
    .from('operation')
    .select('*')
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Operation[];
}

export async function listarOperacionesDeCliente(clientId: string): Promise<Operation[]> {
  const { data, error } = await supabase
    .from('operation')
    .select('*')
    .eq('client_id', clientId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Operation[];
}

/** Registra una operación capturada por el Operador. */
export async function crearOperacion(input: NuevaOperacionInput): Promise<Operation> {
  const { uid, organizationId } = await contextoSesion();
  const fila = {
    organization_id: organizationId,
    client_id: input.client_id,
    tipo: input.tipo,
    monto_mxn: input.monto_mxn,
    moneda_origen: input.moneda_origen ?? 'MXN',
    activo_virtual: input.activo_virtual ?? null,
    contraparte: comoJson(input.contraparte ?? null),
    fecha: input.fecha ?? new Date().toISOString(),
    instrumento_publico: input.instrumento_publico ?? null,
    datos_acto: comoJson(input.datos_acto ?? {}),
    forma_pago: input.forma_pago ?? null,
    pais_origen_recursos: input.pais_origen_recursos?.trim().toUpperCase() || null,
    efectivo_mxn: input.efectivo_mxn ?? null,
    fecha_pago: input.fecha_pago || null,
    pago_de_tercero: input.pago_de_tercero ?? null,
    institucion_financiera: input.institucion_financiera?.trim() || null,
    cuenta_ordenante: input.cuenta_ordenante?.trim() || null,
    // Zona geográfica del inmueble (migration 0041). Distinta del domicilio del
    // cliente: las dos cuentan como factor geográfico y la matriz toma la más
    // alta. Alguien domiciliado en Guadalajara que compra en una zona de
    // atención es justo el caso que el factor existe para ver.
    entidad_federativa_inmueble: input.entidad_federativa_inmueble?.trim() || null,
    municipio_inmueble: input.municipio_inmueble?.trim() || null,
    capturado_por: uid,
  };
  const { data, error } = await supabase.from('operation').insert(fila).select('*').single();
  if (error) throw error;
  return data as unknown as Operation;
}

/**
 * Lo único que `actualizarDatosActo` cambia de una operación.
 *
 * `null` en un campo opcional lo BORRA; ausente lo deja como estaba. La
 * diferencia importa: no es lo mismo «no toqué este campo» que «lo dejé en
 * blanco», y con un índice `string -> unknown` no había forma de expresarla.
 */
interface CambioActo {
  datos_acto: Json;
  forma_pago?: FormaPago | null;
  pais_origen_recursos?: string | null;
}

/**
 * Completa el subárbol del acto de una operación ya registrada.
 *
 * Sólo OC y Admin: la política `operation_update_motor_or_oc` lo exige y el
 * modelo de roles dice que el flujo del Operador termina con el acuse. Un
 * Operador que llame esto recibe un error de la base, no una escritura
 * silenciosa.
 */
export async function actualizarDatosActo(
  operationId: string,
  datosActo: Record<string, unknown>,
  /**
   * Forma de pago y país de origen de los recursos (migration 0036).
   *
   * Van aquí y no sólo en el alta porque el notario casi nunca tiene todo el
   * día de la firma, y porque los actos anteriores a la 0036 nacieron sin
   * ellos: sin manera de completarlos después, esos actos quedarían para
   * siempre sin poder cerrar su matriz de riesgo.
   *
   * `undefined` deja el valor como está; cadena vacía lo borra. La diferencia
   * importa: no es lo mismo «no toqué este campo» que «lo dejé en blanco».
   */
  extras?: { forma_pago?: FormaPago | ''; pais_origen_recursos?: string },
): Promise<void> {
  // Tipado como lo que es y no como `Record<string, unknown>`: ese índice
  // aceptaba cualquier llave con cualquier valor, así que un typo en el nombre
  // de una columna compilaba y se iba a fallar a la base, y nada impedía
  // escribir una forma de pago que el enum no admite.
  const cambios: CambioActo = { datos_acto: comoJson(datosActo) };
  if (extras?.forma_pago !== undefined) cambios.forma_pago = extras.forma_pago || null;
  if (extras?.pais_origen_recursos !== undefined) {
    cambios.pais_origen_recursos = extras.pais_origen_recursos.trim().toUpperCase() || null;
  }

  const { error } = await supabase.from('operation').update(cambios).eq('id', operationId);
  if (error) throw error;
}

/**
 * Corre el motor tras el alta de una operación.
 *
 * El acuse al Operador es neutro: el motor corre en segundo plano y sus
 * hallazgos los consume el OC. Un fallo al invocar NO rompe el alta —el acto ya
 * está registrado y perderlo sería peor que evaluarlo tarde—; se anota en
 * consola y el recorrido manual lo alcanza después.
 *
 * RECORRE TODO, NO SÓLO LA OPERACIÓN RECIÉN CAPTURADA
 *
 * Antes se acotaba con `operation_id`, y eso hacía dos cosas mal. Una regla
 * agregada mide una ventana: con una sola operación cargada, dos actos que
 * juntos cruzan el umbral no lo cruzan nunca. Y una corrida acotada no puede
 * sellar la constancia de evaluación —no ha visto lo suficiente para firmar que
 * el acto quedó juzgado—, así que cada captura dejaba una operación más sin
 * evaluar y el aviso del mes se quedaba bloqueado hasta que alguien fuera a
 * Reportes a pulsar el botón.
 *
 * Para una notaría son decenas de actos al mes y el recorrido es barato. Si
 * algún día un volumen lo vuelve caro, la respuesta es acotar por PERIODO —lo
 * que la ventana más larga necesita— no por operación: acotar por operación es
 * lo que rompe la regla.
 */
export async function invocarMotor(): Promise<void> {
  try {
    const { organizationId } = await contextoSesion();
    const { error } = await supabase.functions.invoke('motor-pld', {
      body: { organization_id: organizationId, trigger_tipo: 'on_insert' },
    });
    if (error) console.warn('[motor-pld] no se pudo invocar:', error.message);
  } catch (e) {
    console.warn('[motor-pld] no se pudo invocar:', (e as Error).message);
  }
}

export interface MotorRunResultado {
  ok: boolean;
  operaciones_procesadas: number;
  hallazgos_creados: number;
  /** Hallazgos abiertos que pasaron a una versión más nueva de su tipología en
   *  vez de duplicarse al lado del anterior. */
  hallazgos_reversionados?: number;
  por_tipologia?: Record<string, number>;
  operaciones_marcadas_aviso?: number;
  /** Cuántas quedaron con constancia de evaluación. Sólo un recorrido completo
   *  la sella: la corrida del alta ve una sola operación y no puede firmar que
   *  el acto quedó juzgado contra las reglas agregadas. */
  operaciones_evaluadas?: number;
  duracion_ms?: number;
}

/** Corre el motor sobre TODAS las operaciones de la organización (botón
 *  "Recorrer motor" del OC). A diferencia de `invocarMotor`, NO traga errores:
 *  lanza si la sesión/organización no se resuelve o si la función devuelve
 *  error, para que la UI distinga un éxito real de uno falso. Devuelve el
 *  resumen de la corrida (2xx). */
export async function recorrerMotor(): Promise<MotorRunResultado> {
  const { organizationId } = await contextoSesion();
  const { data, error } = await supabase.functions.invoke('motor-pld', {
    body: { organization_id: organizationId, trigger_tipo: 'manual' },
  });
  if (error) {
    // supabase-js envuelve el cuerpo del error en error.context (Response).
    let detalle = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) detalle = body.error;
    } catch {
      /* sin cuerpo JSON; se queda con error.message */
    }
    throw new Error(detalle);
  }
  return data as MotorRunResultado;
}
