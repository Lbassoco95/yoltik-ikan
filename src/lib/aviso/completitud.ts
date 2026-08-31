/**
 * Qué le falta a un expediente para poder convertirse en aviso.
 *
 * El notario captura el día que firma; el aviso se arma el mes siguiente. Entre
 * una cosa y otra hay semanas y decenas de instrumentos. Este módulo existe
 * para que la falta se vea el día de la captura —cuando el compareciente aún
 * está enfrente y el expediente físico está abierto— y no el día 17, cuando ya
 * no hay a quién preguntarle.
 *
 * Cada regla de aquí sale del instructivo del layout de fe pública
 * (docs/layouts-sat/instructivo_fep_campos.csv). Ninguna es criterio propio: el
 * campo `no` de cada pendiente apunta al número del instructivo que la exige.
 *
 * Módulo puro: sin Supabase, sin React. Se prueba solo.
 */

import { CAMPOS_FEP, type CampoFep } from './campos-fep.generated';
import { ramaDelActo, type NodoRama } from './ramas-acto';
import { leerValor, leerVariante, numeroRepeticiones, type DatosActo } from './valores-acto';
import { validarCampo } from './validacion-acto';

// =====================================================================
// Vocabulario
// =====================================================================

/**
 * Cuándo tiene que existir el dato.
 *
 *   'captura'    Se sabe el día del acto. Pedirlo después es volver al
 *                protocolo a buscarlo.
 *   'cierre_mes' Nace con el aviso, no con el acto (folio de referencia,
 *                prioridad, alertas). No tiene sentido pedirlo antes.
 */
export type Momento = 'captura' | 'cierre_mes';

export type Origen = 'sujeto_obligado' | 'compareciente' | 'acto' | 'aviso';

/**
 * Gravedad para el usuario. NO es la obligatoriedad del layout: un campo
 * "Obligatorio" del instructivo puede ser condicional (ver `bloqueante` en las
 * reglas de RFC/CURP/fecha de nacimiento).
 */
export type Gravedad = 'bloquea_aviso' | 'recomendado';

export interface Pendiente {
  /** Número del campo en el instructivo. Es la trazabilidad de la regla. */
  no: string;
  /** Etiqueta XML del campo. */
  campo: string;
  /** Qué falta, en español, para quien captura. */
  detalle: string;
  origen: Origen;
  momento: Momento;
  gravedad: Gravedad;
  /**
   * Repetición a la que pertenece, cuando el campo cuelga de un grupo que se
   * repite. Sin esto, "falta el RFC" no dice de cuál de los tres apoderados.
   */
  ruta?: number[];
  /** Dónde está, en palabras: "Datos de los Apoderados 2". */
  contexto?: string;
}

/** Identifica un pendiente sin ambigüedad, repeticiones incluidas. */
export function clavePendiente(p: Pendiente): string {
  return `${p.origen}-${p.no}-${p.campo}-${(p.ruta ?? []).join('.')}`;
}

/** El layout pide cuatro equis cuando la persona no tiene ese apellido
 *  (reglas VC352R1 y VC353R1). No es un valor inventado. */
export const SIN_APELLIDO = 'XXXX';

// =====================================================================
// Formatos del layout
// =====================================================================

/** <instrumento_publico> 3.6.1.1: sólo 0-9, A-Z, guion bajo y guion medio.
 *  La coma de "45,321" hace que el portal rechace el aviso. */
const INSTRUMENTO_VALIDO = /^[0-9A-Z_-]{1,20}$/;

const RFC_PF = /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/;
const RFC_PM = /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/;
const CURP_RE = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/;

const vacio = (v: unknown): boolean => String(v ?? '').trim() === '';

/** Los seis dígitos AAMMDD que RFC y CURP llevan embebidos. Null si no los trae. */
function aammddDeClave(clave: string | null | undefined): string | null {
  const c = String(clave ?? '').trim().toUpperCase();
  const m = c.match(/^[A-ZÑ&]{3,4}([0-9]{6})/);
  return m ? m[1] : null;
}

/** Los mismos seis dígitos, pero desde una fecha ISO (AAAA-MM-DD). */
function aammddDeFecha(iso: string | null | undefined): string | null {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1].slice(2) + m[2] + m[3] : null;
}

/**
 * Coherencia de fecha de nacimiento entre fecha capturada, RFC y CURP
 * (reglas VC354R4, VC355R2 y VC356R2).
 *
 * Compara sólo AAMMDD porque eso es lo único que RFC y CURP codifican: el siglo
 * no viaja en la clave, así que exigirlo sería inventar.
 */
export function fechasIncoherentes(datos: {
  fecha_nacimiento?: string | null;
  rfc?: string | null;
  curp?: string | null;
}): boolean {
  const claves = [
    aammddDeFecha(datos.fecha_nacimiento),
    aammddDeClave(datos.rfc),
    aammddDeClave(datos.curp),
  ].filter((v): v is string => v !== null);
  return new Set(claves).size > 1;
}

// =====================================================================
// Compareciente — <persona_aviso> (rama 3.5)
// =====================================================================

export interface ComparecienteParaAviso {
  tipo_persona: 'fisica' | 'moral';
  nombre_razon_social?: string | null;
  nombre?: string | null;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  fecha_nacimiento?: string | null;
  fecha_constitucion?: string | null;
  rfc?: string | null;
  curp?: string | null;
  pais_nacionalidad_clave?: string | null;
  actividad_economica_clave?: string | null;
}

/**
 * Lo que le falta al compareciente para caber en el aviso.
 *
 * Ojo con <persona_aviso>: el layout describe a "la persona que solicita la
 * formalización del instrumento público" y le pide nombre, apellidos, fecha de
 * nacimiento, RFC y CURP. Es siempre una persona FÍSICA. Cuando quien comparece
 * es una sociedad, la que va en esa rama es la persona que la representa; la
 * sociedad va en el subárbol del acto. Por eso a una persona moral no se le
 * reclaman apellidos aquí.
 */
export function pendientesCompareciente(c: ComparecienteParaAviso): Pendiente[] {
  const out: Pendiente[] = [];
  const push = (
    no: string,
    campo: string,
    detalle: string,
    gravedad: Gravedad = 'bloquea_aviso',
  ) => out.push({ no, campo, detalle, origen: 'compareciente', momento: 'captura', gravedad });

  if (c.tipo_persona === 'fisica') {
    if (vacio(c.nombre)) push('3.5.1', 'nombre', 'Falta el nombre de pila, separado de los apellidos.');
    if (vacio(c.apellido_paterno))
      push(
        '3.5.2',
        'apellido_paterno',
        `Falta el apellido paterno. Si la persona no tiene, el layout pide capturar ${SIN_APELLIDO}.`,
      );
    if (vacio(c.apellido_materno))
      push(
        '3.5.3',
        'apellido_materno',
        `Falta el apellido materno. Si la persona no tiene, el layout pide capturar ${SIN_APELLIDO}.`,
      );
    if (
      String(c.apellido_paterno ?? '').trim().toUpperCase() === SIN_APELLIDO &&
      String(c.apellido_materno ?? '').trim().toUpperCase() === SIN_APELLIDO
    )
      push(
        '3.5.2',
        'apellido_paterno',
        `Los dos apellidos no pueden ser ${SIN_APELLIDO} a la vez (reglas VC352R2 y VC353R2).`,
      );

    // Reglas VC354R3, VC355R1 y VC356R1: los tres campos son intercambiables
    // entre sí, pero al menos uno tiene que existir. Faltar los tres sí frena
    // el aviso; faltar uno o dos sólo lo debilita.
    const identificadores = [c.fecha_nacimiento, c.rfc, c.curp].filter((v) => !vacio(v));
    if (identificadores.length === 0)
      push(
        '3.5.4',
        'fecha_nacimiento',
        'No hay fecha de nacimiento, ni RFC, ni CURP: el aviso necesita al menos uno de los tres.',
      );
    else {
      if (vacio(c.fecha_nacimiento))
        push('3.5.4', 'fecha_nacimiento', 'Falta la fecha de nacimiento.', 'recomendado');
      if (vacio(c.rfc)) push('3.5.5', 'rfc', 'Falta el RFC con homoclave.', 'recomendado');
      if (vacio(c.curp)) push('3.5.6', 'curp', 'Falta la CURP.', 'recomendado');
    }

    if (!vacio(c.rfc) && !RFC_PF.test(String(c.rfc).trim().toUpperCase()))
      push('3.5.5', 'rfc', 'El RFC de persona física debe traer 13 caracteres, con homoclave.');
    if (!vacio(c.curp) && !CURP_RE.test(String(c.curp).trim().toUpperCase()))
      push('3.5.6', 'curp', 'La CURP no cumple el patrón de 18 caracteres del layout.');
    if (fechasIncoherentes(c))
      push(
        '3.5.4',
        'fecha_nacimiento',
        'La fecha de nacimiento no coincide con la que traen el RFC o la CURP (regla VC354R4).',
      );
  } else {
    if (vacio(c.nombre_razon_social))
      push('3.6.1.3', 'denominacion_razon', 'Falta la denominación o razón social.');
    if (vacio(c.fecha_constitucion))
      push('3.6.1.3', 'fecha_constitucion', 'Falta la fecha de constitución de la sociedad.');
    if (vacio(c.rfc)) push('3.6.1.3', 'rfc', 'Falta el RFC de la sociedad (12 caracteres).');
    else if (!RFC_PM.test(String(c.rfc).trim().toUpperCase()))
      push('3.6.1.3', 'rfc', 'El RFC de persona moral debe traer 12 caracteres, con homoclave.');
    if (vacio(c.actividad_economica_clave))
      push(
        '3.6.1.3',
        'giro_mercantil',
        'Falta el giro mercantil (7 dígitos del catálogo de la UIF).',
        'recomendado',
      );
  }

  if (vacio(c.pais_nacionalidad_clave))
    push(
      '3.6.1.3',
      'pais_nacionalidad',
      'Falta la clave de país de nacionalidad (2 letras del catálogo de la UIF).',
      'recomendado',
    );

  return out;
}

// =====================================================================
// Acto — <datos_operacion> (rama 3.6.1)
// =====================================================================

export interface ActoParaAviso {
  /** Fecha del acto (no la de captura). ISO. */
  fecha?: string | null;
  instrumento_publico?: string | null;
  /** Valor de `contraparte.tipo_acto`, del catálogo de src/lib/perfil-actividad.ts. */
  tipo_acto?: string | null;
  /** Subárbol del tipo de acto ya capturado. */
  datos_acto?: Record<string, unknown> | null;
}

export function pendientesActo(a: ActoParaAviso): Pendiente[] {
  const out: Pendiente[] = [];
  const push = (no: string, campo: string, detalle: string, gravedad: Gravedad = 'bloquea_aviso') =>
    out.push({ no, campo, detalle, origen: 'acto', momento: 'captura', gravedad });

  const instrumento = String(a.instrumento_publico ?? '').trim();
  if (!instrumento)
    push('3.6.1.1', 'instrumento_publico', 'Falta el número de instrumento público.');
  else if (!INSTRUMENTO_VALIDO.test(instrumento.toUpperCase()))
    push(
      '3.6.1.1',
      'instrumento_publico',
      'El número de instrumento sólo admite letras, dígitos, guion medio y guion bajo: sin comas, puntos ni espacios.',
    );

  if (vacio(a.fecha)) push('3.6.1.2', 'fecha_operacion', 'Falta la fecha del acto.');

  if (vacio(a.tipo_acto))
    push('3.6.1.3', 'tipo_actividad', 'Falta el tipo de acto: sin él no hay rama que llenar.');
  // Lo que le falta a la rama del acto va campo por campo, no como un total:
  // "faltan 12" obliga a adivinar cuáles, y el formulario del acto es
  // justamente donde el notario puede llenarlos.
  else out.push(...pendientesDelSubarbol(String(a.tipo_acto), a.datos_acto ?? {}));

  return out;
}

// =====================================================================
// Sujeto obligado — claves del padrón (rama 2)
// =====================================================================

export interface SujetoObligadoParaAviso {
  clave_sujeto_obligado?: string | null;
  clave_actividad?: string | null;
}

/**
 * Se revisa una sola vez, no acto por acto: si falta, ningún aviso de la
 * organización se puede generar, por muy completo que esté el expediente.
 */
export function pendientesSujetoObligado(o: SujetoObligadoParaAviso): Pendiente[] {
  const out: Pendiente[] = [];
  const push = (no: string, campo: string, detalle: string) =>
    out.push({
      no,
      campo,
      detalle,
      origen: 'sujeto_obligado',
      momento: 'captura',
      gravedad: 'bloquea_aviso',
    });

  if (vacio(o.clave_sujeto_obligado))
    push(
      '2.2',
      'clave_sujeto_obligado',
      'Falta la clave del padrón SAT del sujeto obligado. Se captura una vez, en Configuración.',
    );
  if (vacio(o.clave_actividad))
    push(
      '2.3',
      'clave_actividad',
      'Falta la clave de la actividad vulnerable (3 caracteres) que asignó el SAT.',
    );
  return out;
}

// =====================================================================
// Campos que nacen con el aviso, no con el acto
// =====================================================================

/**
 * Lo que NO tiene sentido pedirle al notario el día que firma: son datos del
 * aviso. Se listan para que la pantalla pueda decir "esto se llena al cierre",
 * en vez de dejar al usuario con la duda de si se le olvidó algo.
 */
export const CAMPOS_DEL_CIERRE: Pendiente[] = [
  {
    no: '3.1',
    campo: 'referencia_aviso',
    detalle: 'Referencia interna del aviso (hasta 14 caracteres). La asigna Ikán al generarlo.',
    origen: 'aviso',
    momento: 'cierre_mes',
    gravedad: 'bloquea_aviso',
  },
  {
    no: '3.3',
    campo: 'prioridad',
    detalle: 'Prioridad del aviso: 1 normal, 2 con operaciones de 24 horas. La fija el OC.',
    origen: 'aviso',
    momento: 'cierre_mes',
    gravedad: 'bloquea_aviso',
  },
  {
    no: '3.4',
    campo: 'alerta',
    detalle: 'Tipo y descripción de alerta. Salen del hallazgo que confirma el OC.',
    origen: 'aviso',
    momento: 'cierre_mes',
    gravedad: 'bloquea_aviso',
  },
  {
    no: '2.4',
    campo: 'exento',
    detalle:
      'Marca de informe sin operaciones (artículo 27 Bis). Sólo aplica cuando el mes no tuvo actos reportables.',
    origen: 'aviso',
    momento: 'cierre_mes',
    gravedad: 'recomendado',
  },
];

// =====================================================================
// Diccionario del layout por tipo de acto
// =====================================================================

/** Nodo raíz del subárbol de un tipo de acto, buscado por su etiqueta XML. */
export function subarbolDeActo(tipoActo: string): CampoFep | undefined {
  return CAMPOS_FEP.find((c) => c.no.startsWith('3.6.1.3.') && c.etiqueta === tipoActo);
}

/** Todos los campos con valor (no las etiquetas contenedoras) de esa rama. */
export function camposDelActo(tipoActo: string): CampoFep[] {
  const raiz = subarbolDeActo(tipoActo);
  if (!raiz) return [];
  const prefijo = raiz.no + '.';
  return CAMPOS_FEP.filter((c) => c.no.startsWith(prefijo) && c.tipo !== 'Etiqueta');
}

/**
 * Qué le falta a la rama del acto, campo por campo y con nombre.
 *
 * Antes esto devolvía un número —"faltan 12 campos"— y el notario tenía que
 * adivinar cuáles. Ahora nombra cada uno y dice de qué apoderado o de qué socio
 * es, para que se llene en el formulario del acto y no el día 17, cuando el
 * portal lo rechace.
 *
 * Cuenta lo mismo que frena al generador del XML, ni más ni menos: los campos
 * de grado `siempre` sin capturar, los `<tipo_persona>` sin elegir y los
 * valores que no cumplen el formato del layout. Los condicionales y los "si se
 * cuenta con la información" no bloquean. Que las dos listas coincidan está
 * cubierto con una prueba: si divergieran, la pantalla diría "listo" y el
 * portal rechazaría.
 */
export function pendientesDelSubarbol(tipoActo: string, datosActo: DatosActo): Pendiente[] {
  const rama = ramaDelActo(tipoActo);
  if (!rama) return [];
  const out: Pendiente[] = [];
  recorrerNodo(rama, datosActo ?? {}, [], '', out, true);
  return out;
}

/** Cuántos campos de la rama siguen sin resolverse. Para la columna de la
 *  lista, donde no cabe el detalle. */
export function camposPendientesDelSubarbol(tipoActo: string, datosActo: DatosActo): number {
  return pendientesDelSubarbol(tipoActo, datosActo).length;
}

/** Abre el nodo en sus repeticiones y recorre cada una. */
function recorrerNodo(
  nodo: NodoRama,
  datos: DatosActo,
  ruta: number[],
  contexto: string,
  out: Pendiente[],
  raiz = false,
): void {
  if (!nodo.repetible) {
    recorrerUna(nodo, datos, ruta, contexto, out, raiz);
    return;
  }
  const total = numeroRepeticiones(datos, nodo.no, ruta);
  for (let i = 0; i < total; i++)
    recorrerUna(
      nodo,
      datos,
      [...ruta, i],
      total > 1 ? `${nodo.nombre} ${i + 1}` : nodo.nombre,
      out,
    );
}

/** Una repetición concreta del nodo. */
function recorrerUna(
  nodo: NodoRama,
  datos: DatosActo,
  ruta: number[],
  contexto: string,
  out: Pendiente[],
  raiz = false,
): void {
  // Un contenedor que no se exige siempre y está vacío no se emite, así que no
  // le falta nada. Mismo criterio que el generador del XML.
  if (nodo.grado !== 'siempre' && !raiz && !hayAlgo(nodo, datos, ruta)) return;

  const donde = contexto || (raiz ? '' : nodo.nombre);

  for (const campo of nodo.campos) {
    const valor = leerValor(datos, campo.no, ruta);
    if (valor.trim() === '') {
      if (campo.grado === 'siempre')
        out.push(pendienteDeCampo(campo, ruta, donde, `Falta ${campo.nombre.toLowerCase()}.`));
      continue;
    }
    const problema = validarCampo(campo, valor);
    if (problema) out.push(pendienteDeCampo(campo, ruta, donde, `${campo.nombre}: ${problema}`));
  }

  if (nodo.esTipoPersona) {
    const elegida = leerVariante(datos, nodo.no, ruta);
    const variante = nodo.hijos.find((h) => h.etiqueta === elegida);
    if (!variante)
      out.push({
        no: nodo.no,
        campo: nodo.etiqueta,
        detalle: 'Falta indicar si es persona física, moral o fideicomiso.',
        origen: 'acto',
        momento: 'captura',
        gravedad: 'bloquea_aviso',
        ruta,
        contexto: donde || undefined,
      });
    else recorrerNodo(variante, datos, ruta, donde, out);
    return;
  }

  for (const hijo of nodo.hijos) recorrerNodo(hijo, datos, ruta, donde, out);
}

function pendienteDeCampo(
  campo: CampoFep,
  ruta: number[],
  contexto: string,
  detalle: string,
): Pendiente {
  return {
    no: campo.no,
    campo: campo.etiqueta,
    detalle,
    origen: 'acto',
    momento: 'captura',
    gravedad: 'bloquea_aviso',
    ruta,
    contexto: contexto || undefined,
  };
}

function hayAlgo(nodo: NodoRama, datos: DatosActo, ruta: number[]): boolean {
  if (nodo.campos.some((c) => leerValor(datos, c.no, ruta).trim() !== '')) return true;
  if (nodo.esTipoPersona && leerVariante(datos, nodo.no, ruta)) return true;
  return nodo.hijos.some((h) =>
    h.repetible
      ? Array.from({ length: numeroRepeticiones(datos, h.no, ruta) }, (_, i) => [...ruta, i]).some(
          (r) => hayAlgo(h, datos, r),
        )
      : hayAlgo(h, datos, ruta),
  );
}

/** Catálogos de la UIF que la rama necesita y que Ikán todavía no tiene
 *  cargados. Sirve para el aviso ámbar: el usuario captura la clave a mano
 *  mientras tanto, y sabe por qué. */
export function catalogosPendientes(tipoActo: string): string[] {
  return [...new Set(camposDelActo(tipoActo).map((c) => c.catalogo).filter((c): c is string => !!c))].sort();
}

// =====================================================================
// Resumen del expediente
// =====================================================================

export interface ResumenExpediente {
  pendientes: Pendiente[];
  bloqueanElAviso: Pendiente[];
  recomendados: Pendiente[];
  /** true cuando no queda nada que impida convertir el acto en aviso. */
  listoParaAviso: boolean;
}

export function resumenExpediente(
  organizacion: SujetoObligadoParaAviso,
  compareciente: ComparecienteParaAviso,
  acto: ActoParaAviso,
): ResumenExpediente {
  const pendientes = [
    ...pendientesSujetoObligado(organizacion),
    ...pendientesCompareciente(compareciente),
    ...pendientesActo(acto),
  ];
  const bloqueanElAviso = pendientes.filter((p) => p.gravedad === 'bloquea_aviso');
  return {
    pendientes,
    bloqueanElAviso,
    recomendados: pendientes.filter((p) => p.gravedad === 'recomendado'),
    listoParaAviso: bloqueanElAviso.length === 0,
  };
}
