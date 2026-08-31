/**
 * Listas restrictivas (migrations 0012 y 0013) — núcleo puro.
 *
 * Sin dependencias de red, para poder probarlo aislado. La lectura y la
 * escritura contra la base viven en `src/lib/api/listas.ts`.
 */

export type ModoActualizacion = 'snapshot' | 'movimientos';
export type NaturalezaLista = 'sancion_aml' | 'fiscal' | 'jurisdiccion' | 'pep' | 'interna';
export type AccionMovimiento = 'alta' | 'baja';
export type EstadoCarga = 'borrador' | 'aplicada' | 'revertida';
export type TipoEntidad = 'persona' | 'empresa' | 'embarcacion' | 'aeronave';

export interface ListaFuente {
  id: string;
  codigo: string;
  nombre: string;
  autoridad: string;
  naturaleza: NaturalezaLista;
  modo_actualizacion: ModoActualizacion;
  url_oficial: string | null;
  frecuencia_objetivo: string | null;
  obligatoria: boolean;
  activa: boolean;
  notas: string | null;
  /** Situaciones posibles en esta fuente. Null = no las maneja (OFAC, ONU:
   *  estar en la lista es el único estado). */
  situaciones: string[] | null;
  /** Cuáles cuentan como coincidencia que exige acción. Null = todas.
   *  En el 69-B sólo 'definitivo': un presunto tiene plazo para desvirtuar. */
  situaciones_bloqueantes: string[] | null;
}

export interface ListaCarga {
  id: string;
  fuente_id: string;
  tipo: 'archivo' | 'captura_manual' | 'api';
  estado: EstadoCarga;
  fecha_publicacion_fuente: string | null;
  num_movimientos: number;
  cargada_en: string;
  notas: string | null;
  fuente_codigo?: string;
}

export interface RegistroVigente {
  registro_id: string;
  fuente: string;
  fuente_nombre: string;
  naturaleza: NaturalezaLista;
  tipo_entidad: TipoEntidad;
  nombre: string;
  rfc: string | null;
  curp: string | null;
  pais: string | null;
  alta_oficio: string | null;
  alta_fecha: string | null;
  actualizado_en: string;
  situacion: string | null;
  /** false = aparece en la lista pero NO exige acción (ej. un presunto del
   *  69-B, o alguien con sentencia favorable). Es contexto para debida
   *  diligencia reforzada, nunca un hallazgo confirmado. */
  bloqueante: boolean;
}

/** Una línea de captura antes de mandarse a la base. */
export interface MovimientoCaptura {
  accion: AccionMovimiento;
  tipo_entidad: TipoEntidad;
  nombre: string;
  rfc: string;
  curp: string;
  oficio_numero: string;
  oficio_fecha: string;
  motivo: string;
  /** Sólo en fuentes que manejan situaciones. Cadena vacía = ninguna. */
  situacion: string;
}

export function movimientoVacio(accion: AccionMovimiento = 'alta'): MovimientoCaptura {
  return {
    accion,
    tipo_entidad: 'persona',
    nombre: '',
    rfc: '',
    curp: '',
    oficio_numero: '',
    oficio_fecha: '',
    motivo: '',
    situacion: '',
  };
}

/**
 * Valida una línea antes de tocar la base.
 *
 * El oficio NO es obligatorio en el esquema pero sí lo exigimos aquí: en la
 * lista de la UIF es lo que justifica por qué alguien entró o salió, y una
 * baja sin oficio no es defendible ante una revisión. Mejor frenarlo en el
 * formulario que descubrirlo en una verificación.
 */
export function validarMovimiento(m: MovimientoCaptura, fuente?: ListaFuente): string[] {
  const errores: string[] = [];

  if (!m.nombre.trim()) {
    errores.push('Falta el nombre o razón social.');
  }
  if (!m.oficio_numero.trim()) {
    errores.push('Falta el número de oficio: es lo que respalda el movimiento.');
  }
  if (m.rfc.trim() && !esRfcPlausible(m.rfc)) {
    errores.push(`El RFC "${m.rfc.trim()}" no tiene forma de RFC (12 caracteres para moral, 13 para física).`);
  }
  if (m.oficio_fecha && Number.isNaN(Date.parse(m.oficio_fecha))) {
    errores.push('La fecha del oficio no es válida.');
  }
  if (m.oficio_fecha && new Date(m.oficio_fecha) > new Date()) {
    errores.push('La fecha del oficio está en el futuro.');
  }

  // La situación se valida también en la base, pero atajarla aquí evita
  // mandar una carga completa que va a fallar a la mitad.
  if (fuente) {
    const situaciones = fuente.situaciones;
    if (m.situacion && !situaciones) {
      errores.push(`«${fuente.nombre}» no maneja situaciones; deja ese campo vacío.`);
    } else if (m.situacion && situaciones && !situaciones.includes(m.situacion)) {
      errores.push(`Situación no válida. Las de esta fuente: ${situaciones.join(', ')}.`);
    } else if (!m.situacion && situaciones) {
      errores.push(`«${fuente.nombre}» exige una situación: ${situaciones.join(', ')}.`);
    }
  }

  return errores;
}

/** Etiquetas legibles de las situaciones del 69-B. Otras fuentes que
 *  incorporen situaciones caen al valor crudo, que es preferible a inventar
 *  una traducción. */
export const SITUACION_LABEL: Record<string, string> = {
  presunto: 'Presunto',
  definitivo: 'Definitivo',
  desvirtuado: 'Desvirtuado',
  sentencia_favorable: 'Sentencia favorable',
};

export function labelSituacion(s: string | null): string {
  if (!s) return '—';
  return SITUACION_LABEL[s] ?? s;
}

/**
 * Forma de RFC, no existencia. Física: 4 letras + 6 dígitos + 3 de homoclave.
 * Moral: 3 letras + 6 dígitos + 3 de homoclave. No valida el dígito
 * verificador ni que exista ante el SAT: eso no se puede hacer sin consultar.
 */
export function esRfcPlausible(rfc: string): boolean {
  const v = rfc.trim().toUpperCase();
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(v);
}

/** Normaliza el RFC igual que la base: mayúsculas y sin espacios. */
export function normalizarRfc(rfc: string): string | null {
  const v = rfc.trim().toUpperCase();
  return v === '' ? null : v;
}

export const NATURALEZA_LABEL: Record<NaturalezaLista, string> = {
  sancion_aml: 'Sanción PLD/FT',
  fiscal: 'Fiscal',
  jurisdiccion: 'Jurisdicción',
  pep: 'Persona políticamente expuesta',
  interna: 'Lista interna',
};

export const MODO_LABEL: Record<ModoActualizacion, string> = {
  snapshot: 'Archivo completo',
  movimientos: 'Altas y bajas por oficio',
};

export const ESTADO_CARGA_LABEL: Record<EstadoCarga, string> = {
  borrador: 'Borrador',
  aplicada: 'Aplicada',
  revertida: 'Revertida',
};

/** Sólo las fuentes que se capturan por oficio admiten captura manual. */
export function admiteCapturaManual(f: ListaFuente): boolean {
  return f.modo_actualizacion === 'movimientos' && f.activa;
}
