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

/** Tipos de acto para notarías. Se guardan en `operation.contraparte.tipo_acto`
 *  (jsonb) — no requieren cambio de schema en `operation`. */
export const TIPOS_ACTO_NOTARIA: { value: string; label: string }[] = [
  { value: 'compraventa_inmueble', label: 'Compraventa de inmueble' },
  { value: 'poder_irrevocable', label: 'Poder irrevocable' },
  { value: 'constitucion_sociedad', label: 'Constitución de sociedad' },
  { value: 'fideicomiso', label: 'Fideicomiso' },
];

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
