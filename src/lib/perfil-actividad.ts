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
}

export const TIPOS_ACTO_NOTARIA: TipoActoNotaria[] = [
  { value: 'otorgamiento_poder', fedatario: 'notario',
    label: 'Otorgamiento de poder irrevocable' },
  { value: 'constitucion_personas_morales', fedatario: 'ambos',
    label: 'Constitución de personas morales' },
  { value: 'modificacion_patrimonial', fedatario: 'ambos',
    label: 'Modificación patrimonial (aumento o disminución de capital)' },
  { value: 'fusion', fedatario: 'ambos', label: 'Fusión' },
  { value: 'escision', fedatario: 'ambos', label: 'Escisión' },
  { value: 'compra_venta_acciones', fedatario: 'ambos',
    label: 'Compra o venta de acciones o partes sociales' },
  { value: 'constitucion_modificacion_fideicomiso', fedatario: 'notario',
    label: 'Constitución o modificación de fideicomiso traslativo de dominio o garantía' },
  { value: 'cesion_derechos_fideicomitente_fideicomisario', fedatario: 'corredor',
    label: 'Cesión de derechos de fideicomitente o fideicomisario' },
  { value: 'contrato_mutuo_credito', fedatario: 'ambos',
    label: 'Contrato de mutuo o crédito, con o sin garantía' },
  { value: 'avaluo', fedatario: 'corredor', label: 'Realización de avalúos' },
];

/** La transmisión de inmuebles NO tiene etiqueta propia en el layout: se
 *  reporta según el acto que la instrumenta. Se deja escrito porque es el
 *  error más fácil de cometer al leer el artículo 17 fracción XII. */
export const NOTA_TRANSMISION_INMUEBLES =
  'La transmisión o constitución de derechos reales sobre inmuebles se reporta a través del ' +
  'acto que la instrumenta (compraventa de acciones, fideicomiso, mutuo con garantía), no como ' +
  'un tipo de acto propio: el layout del SAT no tiene una etiqueta para ella.';

/** Umbrales de referencia de la fracción XII (fe pública). FIJOS, no calculados. */
export const UMBRALES_XII_REFERENCIA = {
  nota:
    'Cifras de referencia, sujetas a confirmación con Kawiil-Cumplimiento. ' +
    'Provienen de fuentes secundarias aún no cruzadas con el texto legal vigente.',
  items: [
    {
      concepto: 'Transmisión de inmuebles',
      umbral: '16,000 UMA',
      detalle: 'Aviso al alcanzar o superar el umbral.',
    },
    {
      concepto: 'Poderes irrevocables',
      umbral: 'Siempre',
      detalle: 'Aviso en todos los casos, sin umbral de monto.',
    },
    {
      concepto: 'Constitución de personas morales',
      umbral: '8,025 UMA',
      detalle: 'Aviso al alcanzar o superar el umbral.',
    },
  ],
};

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
