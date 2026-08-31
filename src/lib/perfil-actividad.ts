/**
 * Perfil de actividad — "vestir" Ikán por vertical (demo Notarías GDL).
 *
 * Mínimo viable: labels condicionados a un perfil resuelto desde
 * `organizations.perfil_actividad`. NO es la arquitectura generalizada de
 * verticales (eso se diseña después). Mismo motor, distinta cara.
 */

export type PerfilActividad = 'generico' | 'notarias';

export interface LabelsPerfil {
  clientes: string;
  clienteNuevoBtn: string;
  clienteAltaTitulo: string;
  clientesVacio: string;
  volverAClientes: string;
  operaciones: string;
  operacionNuevaBtn: string;
  operacionAltaTitulo: string;
  operacionAltaDesc: string;
  operacionesVacio: string;
}

export const LABELS: Record<PerfilActividad, LabelsPerfil> = {
  generico: {
    clientes: 'Clientes',
    clienteNuevoBtn: 'Nuevo Cliente',
    clienteAltaTitulo: 'Alta de cliente',
    clientesVacio: 'Sin clientes registrados.',
    volverAClientes: 'Volver a clientes',
    operaciones: 'Operaciones',
    operacionNuevaBtn: 'Registrar operación',
    operacionAltaTitulo: 'Registrar operación',
    operacionAltaDesc:
      'Captura de operación. Al registrar se ejecuta el monitoreo automatizado.',
    operacionesVacio: 'Sin operaciones registradas.',
  },
  notarias: {
    clientes: 'Comparecientes / Otorgantes',
    clienteNuevoBtn: 'Nuevo compareciente',
    clienteAltaTitulo: 'Alta de compareciente',
    clientesVacio: 'Sin comparecientes registrados.',
    volverAClientes: 'Volver a comparecientes',
    operaciones: 'Actos / Instrumentos',
    operacionNuevaBtn: 'Registrar acto',
    operacionAltaTitulo: 'Registrar acto / instrumento',
    operacionAltaDesc:
      'Captura del acto o instrumento. Al registrar se ejecuta el monitoreo automatizado.',
    operacionesVacio: 'Sin actos registrados.',
  },
};

/** Overrides de etiqueta del sidebar por ruta (solo lo que cambia). */
export const NAV_LABEL_OVERRIDES: Record<PerfilActividad, Record<string, string>> = {
  generico: {},
  notarias: {
    '/clientes': 'Comparecientes',
    '/operaciones': 'Actos / Instrumentos',
  },
};

/**
 * Tipos de acto de la fracción XII, con la etiqueta XML del aviso.
 *
 * NO son una lista razonable: son los diez que el SAT define en el instructivo
 * del layout de fe pública (rama 3.6.1.3 del `instructivo_fep`), uno por cada
 * plantilla que publica. La versión anterior tenía cuatro inventados
 * («compraventa_inmueble», «fideicomiso») que no existen como tales en el
 * layout, así que un aviso generado con ellos habría fallado la validación.
 *
 * `etiqueta_xml` es lo que va en el aviso; `value` es lo que se guarda en
 * `operation.contraparte.tipo_acto`. Se mantienen iguales a propósito, para
 * que el generador no tenga que traducir.
 *
 * Fuente: docs/layouts-sat/tipos_acto_fep.json
 */
export interface TipoActoNotaria {
  value: string;
  label: string;
  /** Quién lo puede instrumentar. El corredor público no otorga poderes
   *  irrevocables ni transmite inmuebles; el notario no hace avalúos como
   *  actividad vulnerable. */
  fedatario: 'notario' | 'corredor' | 'ambos';
  /**
   * Por dónde se presenta. NO es un detalle técnico: son dos sistemas
   * distintos, con formatos distintos y plazos propios.
   *
   *   'sppld'      Portal de PLD del SAT, en XML contra el layout de fe
   *                pública. Son los diez tipos de acto del instructivo.
   *   'declaranot' Declaración Informativa de Notarios. Por aquí va la
   *                transmisión o constitución de derechos reales sobre
   *                inmuebles (inciso a del artículo 17 fracción XII), y por
   *                eso ese acto NO aparece en el layout del SPPLD.
   *
   * Confundirlos hace que un notario crea que ya reportó cuando no lo hizo.
   */
  canal: 'sppld' | 'declaranot';
}

export const TIPOS_ACTO_NOTARIA: TipoActoNotaria[] = [
  // Por DeclaraNOT, no por el SPPLD. Va primero porque es el acto más común
  // de una notaría y el que más fácil se reporta por el canal equivocado.
  { value: 'transmision_inmueble', fedatario: 'notario', canal: 'declaranot',
    label: 'Transmisión o constitución de derechos reales sobre inmuebles' },

  { value: 'otorgamiento_poder', fedatario: 'notario', canal: 'sppld',
    label: 'Otorgamiento de poder irrevocable' },
  { value: 'constitucion_personas_morales', fedatario: 'ambos', canal: 'sppld',
    label: 'Constitución de personas morales' },
  { value: 'modificacion_patrimonial', fedatario: 'ambos', canal: 'sppld',
    label: 'Modificación patrimonial (aumento o disminución de capital)' },
  { value: 'fusion', fedatario: 'ambos', canal: 'sppld', label: 'Fusión' },
  { value: 'escision', fedatario: 'ambos', canal: 'sppld', label: 'Escisión' },
  { value: 'compra_venta_acciones', fedatario: 'ambos', canal: 'sppld',
    label: 'Compra o venta de acciones o partes sociales' },
  { value: 'constitucion_modificacion_fideicomiso', fedatario: 'notario', canal: 'sppld',
    label: 'Constitución o modificación de fideicomiso traslativo de dominio o garantía' },
  { value: 'cesion_derechos_fideicomitente_fideicomisario', fedatario: 'corredor', canal: 'sppld',
    label: 'Cesión de derechos de fideicomitente o fideicomisario' },
  { value: 'contrato_mutuo_credito', fedatario: 'ambos', canal: 'sppld',
    label: 'Contrato de mutuo o crédito, con o sin garantía' },
  { value: 'avaluo', fedatario: 'corredor', canal: 'sppld', label: 'Realización de avalúos' },
];

/** Por qué la transmisión de inmuebles no está en el layout del SPPLD. Se deja
 *  escrito porque es el error más fácil de cometer al leer el artículo. */
export const NOTA_CANALES =
  'La transmisión o constitución de derechos reales sobre inmuebles se presenta por DeclaraNOT, ' +
  'no por el SPPLD, y por eso no tiene etiqueta en el layout de fe pública. Los demás actos van ' +
  'por el SPPLD en XML. Son dos sistemas distintos: confundirlos hace que un notario crea que ya ' +
  'reportó cuando no lo hizo.';

/**
 * Los supuestos de aviso de la fracción XII que la pantalla publica.
 *
 * Aquí NO va ninguna cifra. La llevaba —16,000 UMA para inmuebles y 8,025 para
 * personas morales— y eso resultó ser el mismo error que la migration 0011 vino
 * a matar, resucitado en el front: un umbral regulatorio escrito a mano en un
 * archivo de código. Cuando la reforma DOF 16/07/2025 cambió los umbrales, el
 * motor se corrigió con la 0030 y esta constante se quedó publicando las cifras
 * derogadas. Durante días la pantalla dijo 16,000 y el motor usó 8,000.
 *
 * Ahora sólo se declara QUÉ supuestos existen y con qué código de catálogo se
 * resuelve cada uno; la cifra la pone `parametro_regulatorio`, que es la única
 * fuente de verdad y la que el motor también consulta.
 *
 * `codigo: null` es el supuesto que no tiene umbral porque el Aviso procede
 * siempre. No es un hueco: es la respuesta.
 */
export const SUPUESTOS_AVISO_XII: {
  concepto: string;
  codigo: string | null;
  detalle: string;
}[] = [
  {
    concepto: 'Transmisión o constitución de derechos reales sobre inmuebles',
    codigo: 'umbral_xii_inmueble_uma',
    detalle:
      'La base es el mayor entre precio pactado, valor catastral, valor comercial y monto ' +
      'garantizado, sin contribuciones.',
  },
  {
    concepto: 'Poderes irrevocables',
    codigo: null,
    detalle: 'Se avisa en todos los casos, sin importar el monto.',
  },
  {
    concepto: 'Constitución de personas morales y cambios en su capital',
    codigo: null,
    detalle:
      'Incluye fusión, escisión y compraventa de acciones. Desde la reforma de 2025 se avisa ' +
      'siempre, sin importar el monto.',
  },
  {
    concepto: 'Fideicomisos traslativos o de garantía',
    codigo: 'umbral_xii_fideicomiso_uma',
    detalle: 'Ya no se limita a inmuebles.',
  },
];

export function resolverPerfil(raw: string | null | undefined): PerfilActividad {
  return raw === 'notarias' ? 'notarias' : 'generico';
}

/** Etiqueta legible del tipo de acto notarial (guardado en contraparte.tipo_acto). */
export function labelTipoActo(value: unknown): string {
  const v = String(value ?? '');
  return TIPOS_ACTO_NOTARIA.find((t) => t.value === v)?.label ?? (v || '—');
}

/** Los actos que puede instrumentar un tipo de fedatario. */
export function actosDe(fedatario: 'notario' | 'corredor'): TipoActoNotaria[] {
  return TIPOS_ACTO_NOTARIA.filter((t) => t.fedatario === fedatario || t.fedatario === 'ambos');
}

/** Por dónde se presenta un acto. `undefined` si el tipo no está en el catálogo. */
export function canalDeActo(value: unknown): 'sppld' | 'declaranot' | undefined {
  return TIPOS_ACTO_NOTARIA.find((t) => t.value === String(value ?? ''))?.canal;
}

/** Los actos que sí van en el aviso XML del SPPLD. El generador sólo debe
 *  considerar éstos: incluir uno de DeclaraNOT produciría un XML inválido. */
export function actosDelSppld(): TipoActoNotaria[] {
  return TIPOS_ACTO_NOTARIA.filter((t) => t.canal === 'sppld');
}
