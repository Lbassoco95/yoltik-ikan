/**
 * Generador del aviso mensual en XML, contra el layout de fe pública del SPPLD.
 *
 * Es el archivo que el notario sube al portal el día 17. Todo lo construido en
 * los bloques anteriores —expediente del acto, catálogos, claves del padrón—
 * existe para alimentarlo.
 *
 * Dos decisiones de fondo:
 *
 *   1. Si hay errores NO devuelve XML. Entregar un archivo que el portal va a
 *      rechazar es peor que no entregar nada: el notario lo sube, se confía, y
 *      se entera cuando ya se le pasó el plazo.
 *
 *   2. El orden de las etiquetas no es estético. El XSD del SAT define
 *      secuencias, así que un campo fuera de lugar invalida el archivo aunque
 *      el contenido esté bien. El orden de aquí es el del instructivo, campo
 *      por campo.
 *
 * Módulo puro: sin Supabase, sin React.
 */

import { actosDelSppld } from '@/lib/perfil-actividad';
import { controlDe, ramaDelActo, type NodoRama } from '@/lib/aviso/ramas-acto';
import {
  leerValor,
  leerVariante,
  numeroRepeticiones,
  type DatosActo,
} from '@/lib/aviso/valores-acto';
import type { CampoFep } from '@/lib/aviso/campos-fep.generated';
import { validarCampo } from '@/lib/aviso/validacion-acto';

// =====================================================================
// Normalización a lo que el layout admite
// =====================================================================

/**
 * Los campos de texto del layout admiten SÓLO A-Z mayúsculas sin acentos, la
 * Ñ y el espacio. "Pérez" tiene que viajar como "PEREZ".
 *
 * No es cosmético: el portal rechaza el archivo completo por un acento, y el
 * aviso lleva decenas de nombres.
 */
export function textoLayout(valor: string | null | undefined): string {
  return sinAcentos(valor)
    .replace(/[^A-ZÑ0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Quita acentos y sube a mayúsculas, PERO conserva la Ñ.
 *
 * `normalize('NFD')` descompone la Ñ en N + tilde combinante igual que a la Á,
 * así que quitar los diacríticos a secas convierte MUÑOZ en MUNOZ. El layout
 * admite la Ñ explícitamente y un apellido mal escrito en un aviso no es un
 * detalle tipográfico. Se aparta antes de descomponer y se repone después.
 */
function sinAcentos(valor: string | null | undefined): string {
  const CENTINELA = '\u0001';
  return String(valor ?? '')
    .replace(/[ñÑ]/g, CENTINELA)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(CENTINELA)
    .join('Ñ');
}

/**
 * RFC y CURP. Aparte de `textoLayout` porque el RFC admite el ampersand
 * —"BA&E900101AB1" es un RFC legítimo— y ahí sí hay que escaparlo en el XML en
 * lugar de borrarlo. Sin espacios: son claves, no texto.
 */
export function claveLayout(valor: string | null | undefined): string {
  return sinAcentos(valor).replace(/[^A-ZÑ0-9&]/g, '');
}

/** AAAAMMDD, como pide el layout. Null si la fecha no es utilizable. */
export function fechaLayout(iso: string | null | undefined): string | null {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/** AAAAMM del periodo reportado. */
export function mesLayout(iso: string | null | undefined): string | null {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}${m[2]}` : null;
}

/** El RFC admite & y Ñ, que en XML hay que escapar. */
function escaparXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =====================================================================
// Entrada
// =====================================================================

export interface SujetoObligadoAviso {
  /** Campo 2.2. Sin esto no hay aviso posible. */
  clave_sujeto_obligado: string | null;
  /** Campo 2.3, tres caracteres. FEP para fe pública. */
  clave_actividad: string | null;
  /** Campo 2.1. Sólo si los avisos se remiten por un colegio. */
  clave_entidad_colegiada?: string | null;
}

/** Campo 3.5. Siempre es una persona FÍSICA: quien solicita la formalización. */
export interface PersonaAviso {
  nombre?: string | null;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  /** ISO AAAA-MM-DD. */
  fecha_nacimiento?: string | null;
  rfc?: string | null;
  curp?: string | null;
}

export interface ActoParaXml {
  /** Campo 3.1, hasta 14 caracteres. Lo asigna Ikán. */
  referencia_aviso: string;
  /** Campo 3.3. 1 normal, 2 con operaciones de 24 horas. */
  prioridad: '1' | '2';
  /** Campo 3.4. Obligatorio dentro de cada aviso. */
  alerta: { tipo: string; descripcion: string };
  /** Campo 3.2. Sólo cuando este aviso corrige uno ya enviado. */
  modificatorio?: { folio: string; descripcion: string };
  persona: PersonaAviso;
  /** Campo 3.6.1.1. */
  instrumento_publico?: string | null;
  /** Campo 3.6.1.2, ISO AAAA-MM-DD. */
  fecha_operacion?: string | null;
  /** Etiqueta del acto dentro de <tipo_actividad>. */
  tipo_acto?: string | null;
  /** Subárbol propio del acto. Todavía no se captura: ver `advertencias`. */
  datos_acto?: Record<string, unknown> | null;
}

export interface EntradaAviso {
  /** ISO AAAA-MM del periodo. */
  mes_reportado: string;
  sujeto: SujetoObligadoAviso;
  actos: ActoParaXml[];
  /**
   * Informe sin operaciones (artículo 27 Bis). Va con <exento>1</exento> y SIN
   * ninguna etiqueta <aviso>: el instructivo lo dice explícito en la regla
   * VC3R1. Quién puede presentarlo lo decide `evaluarAvisoMensual`, no esto.
   */
  en_ceros?: boolean;
}

export interface ResultadoXml {
  /** Null si hay errores. A propósito: ver el encabezado. */
  xml: string | null;
  errores: string[];
  /** No impiden generar, pero el aviso sale incompleto. */
  advertencias: string[];
}

// =====================================================================
// Generación
// =====================================================================

const INSTRUMENTO_VALIDO = /^[0-9A-Z_-]{1,20}$/;
const REFERENCIA_VALIDA = /^[A-ZÑ0-9]{1,14}$/;

/**
 * La referencia con la que un acto entra al aviso (campo 3.1 del layout).
 *
 * Hasta 14 caracteres alfanuméricos, y tiene que identificar SIEMPRE al mismo
 * acto: es por donde el SAT liga un aviso modificatorio con el original, y por
 * donde se explica meses después de qué instrumento salió un renglón.
 *
 * Se pedía `operation.folio` con un respaldo por posición en el periodo. La
 * columna no existe —nunca existió, y la consulta entera fallaba con «column
 * operation.folio does not exist», así que la pantalla del aviso no cargaba—,
 * de modo que el respaldo era en realidad el único camino. Y ese respaldo es
 * peor que el error: la posición cambia en cuanto se captura otro acto del
 * mismo mes, así que regenerar el aviso de agosto en septiembre le habría dado
 * al mismo instrumento una referencia distinta. Dos avisos del mismo acto sin
 * nada que los relacione.
 *
 * El id de la operación no se mueve nunca. Seis dígitos del periodo y ocho del
 * uuid caben justo en los catorce y se leen: AAAAMM + 8 hexadecimales.
 *
 * Se toman los ÚLTIMOS ocho, no los primeros. Con los primeros, los cuatro
 * actos del demo —cuyos ids son deterministas y empiezan igual: 88888888-0000-…—
 * salían los cuatro con la misma referencia. En un aviso con dos actos que se
 * llaman igual, el SAT no puede distinguirlos y un modificatorio no sabe a cuál
 * corrige. Con uuids aleatorios daba lo mismo, pero que un caso real del
 * producto lo reventara a la primera dice que la elección estaba mal.
 */
export function referenciaDelActo(periodo: string, operationId: string): string {
  const mes = periodo.replace(/[^0-9]/g, '').slice(0, 6);
  const id = operationId.replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase();
  return `${mes}${id}`.slice(0, 14);
}


const et = (nombre: string, valor: string, sangria: number) =>
  `${' '.repeat(sangria)}<${nombre}>${escaparXml(valor)}</${nombre}>`;

export function generarAvisoXml(entrada: EntradaAviso): ResultadoXml {
  const errores: string[] = [];
  const advertencias: string[] = [];
  const l: string[] = [];

  const mes = mesLayout(entrada.mes_reportado);
  if (!mes) errores.push('El mes reportado no es una fecha válida (se espera AAAA-MM).');

  const { clave_sujeto_obligado, clave_actividad, clave_entidad_colegiada } = entrada.sujeto;
  if (!clave_sujeto_obligado)
    errores.push('Falta la clave del sujeto obligado (campo 2.2). Se captura en Configuración.');
  if (!clave_actividad)
    errores.push('Falta la clave de actividad vulnerable (campo 2.3). Para fe pública es FEP.');

  if (entrada.en_ceros && entrada.actos.length > 0)
    errores.push(
      'Un informe sin operaciones no puede llevar avisos: el layout prohíbe la etiqueta <aviso> ' +
        'en un reporte en ceros (regla VC3R1).',
    );
  if (!entrada.en_ceros && entrada.actos.length === 0)
    errores.push('No hay actos que reportar. Si el mes no tuvo operaciones, marca el informe en ceros.');

  l.push('<?xml version="1.0" encoding="UTF-8"?>');
  l.push('<archivo>');
  l.push(' <informe>');
  if (mes) l.push(et('mes_reportado', mes, 2));

  l.push('  <sujeto_obligado>');
  if (clave_entidad_colegiada) l.push(et('clave_entidad_colegiada', clave_entidad_colegiada, 3));
  if (clave_sujeto_obligado) l.push(et('clave_sujeto_obligado', clave_sujeto_obligado, 3));
  if (clave_actividad) l.push(et('clave_actividad', clave_actividad, 3));
  // <exento> sólo existe en el informe en ceros, y su único valor válido es 1.
  if (entrada.en_ceros) l.push(et('exento', '1', 3));
  l.push('  </sujeto_obligado>');

  const actosValidos = new Set(actosDelSppld().map((a) => a.value));

  // Dos actos con la misma referencia dentro de un aviso. El portal puede
  // aceptarlo —es un campo libre de catorce caracteres— y ahí está el problema:
  // la referencia es por donde un aviso modificatorio dice a cuál de los actos
  // corrige, y con dos iguales no hay respuesta. Pasó de verdad: los ids
  // deterministas del demo empiezan igual y una referencia derivada de los
  // primeros dígitos salía idéntica para los cuatro actos.
  const vistas = new Map<string, number>();
  entrada.actos.forEach((a, i) => {
    const ref = claveLayout(a.referencia_aviso).replace(/&/g, '');
    if (!ref) return;
    const antes = vistas.get(ref);
    if (antes !== undefined) {
      errores.push(
        `Acto ${i + 1}: repite la referencia «${ref}» del acto ${antes + 1}. Cada acto del ` +
          'aviso necesita la suya: es por donde se identifica si después hay que corregirlo.',
      );
    } else {
      vistas.set(ref, i);
    }
  });

  entrada.actos.forEach((a, i) => {
    const donde = `Acto ${i + 1} (${a.referencia_aviso || 'sin referencia'})`;

    l.push('  <aviso>');

    // La referencia no admite &: sólo letras y dígitos (campo 3.1).
    const ref = claveLayout(a.referencia_aviso).replace(/&/g, '');
    if (!REFERENCIA_VALIDA.test(ref))
      errores.push(`${donde}: la referencia del aviso admite hasta 14 letras o dígitos (campo 3.1).`);
    else l.push(et('referencia_aviso', ref, 3));

    if (a.modificatorio) {
      l.push('   <modificatorio>');
      l.push(et('folio_modificacion', a.modificatorio.folio, 4));
      l.push(et('descripcion_modificacion', textoLayout(a.modificatorio.descripcion), 4));
      l.push('   </modificatorio>');
    }

    if (a.prioridad !== '1' && a.prioridad !== '2')
      errores.push(`${donde}: la prioridad debe ser 1 (normal) o 2 (24 horas con operaciones).`);
    else l.push(et('prioridad', a.prioridad, 3));

    l.push('   <alerta>');
    if (!a.alerta?.tipo) errores.push(`${donde}: falta el tipo de alerta (campo 3.4.1).`);
    else l.push(et('tipo_alerta', a.alerta.tipo, 4));
    l.push(et('descripcion_alerta', textoLayout(a.alerta?.descripcion), 4));
    l.push('   </alerta>');

    l.push(...personaAviso(a.persona, donde, errores, advertencias));

    l.push('   <detalle_operaciones>');
    l.push('    <datos_operacion>');

    const instrumento = String(a.instrumento_publico ?? '').trim().toUpperCase();
    if (!instrumento) errores.push(`${donde}: falta el número de instrumento público (campo 3.6.1.1).`);
    else if (!INSTRUMENTO_VALIDO.test(instrumento))
      errores.push(
        `${donde}: el número de instrumento "${instrumento}" tiene caracteres que el layout no ` +
          'admite. Sólo letras, dígitos, guion medio y guion bajo.',
      );
    else l.push(et('instrumento_publico', instrumento, 5));

    const fecha = fechaLayout(a.fecha_operacion);
    if (!fecha) errores.push(`${donde}: falta la fecha del acto (campo 3.6.1.2).`);
    else l.push(et('fecha_operacion', fecha, 5));

    l.push('     <tipo_actividad>');
    const acto = String(a.tipo_acto ?? '');
    if (!acto) {
      errores.push(`${donde}: falta el tipo de acto (campo 3.6.1.3).`);
    } else if (!actosValidos.has(acto)) {
      // La transmisión de inmuebles cae aquí: se presenta por DeclaraNOT y no
      // tiene etiqueta en este layout. Meterla produciría un XML inválido.
      errores.push(
        `${donde}: "${acto}" no es un acto del layout de fe pública. Si se presenta por ` +
          'DeclaraNOT, no va en este aviso.',
      );
    } else {
      const rama = ramaDelActo(acto);
      if (!rama)
        errores.push(
          `${donde}: el layout no trae la rama <${acto}>. Revisa el diccionario del instructivo.`,
        );
      else l.push(...ramaXml(rama, a.datos_acto ?? {}, [], 6, donde, errores, advertencias, true));
    }
    l.push('     </tipo_actividad>');

    l.push('    </datos_operacion>');
    l.push('   </detalle_operaciones>');
    l.push('  </aviso>');
  });

  l.push(' </informe>');
  l.push('</archivo>');

  return { xml: errores.length ? null : l.join('\n') + '\n', errores, advertencias };
}

/**
 * Rama 3.5. RFC, CURP y fecha de nacimiento son intercambiables entre sí
 * (reglas VC354R3, VC355R1 y VC356R1): faltar los tres frena el aviso, faltar
 * uno solo no. Los que no existan simplemente no se incluyen.
 */
function personaAviso(
  p: PersonaAviso,
  donde: string,
  errores: string[],
  advertencias: string[],
): string[] {
  const l: string[] = ['   <persona_aviso>'];

  const nombre = textoLayout(p.nombre);
  const paterno = textoLayout(p.apellido_paterno);
  const materno = textoLayout(p.apellido_materno);

  if (!nombre) errores.push(`${donde}: falta el nombre del compareciente (campo 3.5.1).`);
  else l.push(et('nombre', nombre, 4));

  if (!paterno) errores.push(`${donde}: falta el apellido paterno (campo 3.5.2). Si no tiene, va XXXX.`);
  else l.push(et('apellido_paterno', paterno, 4));

  if (!materno) errores.push(`${donde}: falta el apellido materno (campo 3.5.3). Si no tiene, va XXXX.`);
  else l.push(et('apellido_materno', materno, 4));

  if (paterno === 'XXXX' && materno === 'XXXX')
    errores.push(`${donde}: los dos apellidos no pueden ser XXXX a la vez (VC352R2 y VC353R2).`);

  const fnac = fechaLayout(p.fecha_nacimiento);
  const rfc = claveLayout(p.rfc);
  const curp = claveLayout(p.curp);

  if (!fnac && !rfc && !curp)
    errores.push(
      `${donde}: el compareciente no tiene fecha de nacimiento, ni RFC, ni CURP. El aviso ` +
        'necesita al menos uno de los tres.',
    );

  if (fnac) l.push(et('fecha_nacimiento', fnac, 4));
  else advertencias.push(`${donde}: sin fecha de nacimiento del compareciente.`);
  if (rfc) l.push(et('rfc', rfc, 4));
  else advertencias.push(`${donde}: sin RFC del compareciente.`);
  if (curp) l.push(et('curp', curp, 4));
  else advertencias.push(`${donde}: sin CURP del compareciente.`);

  l.push('   </persona_aviso>');
  return l;
}

// =====================================================================
// Rama del tipo de acto (3.6.1.3.x)
// =====================================================================

/**
 * Serializa el subárbol propio del acto desde el diccionario del instructivo.
 *
 * Recorre el árbol en el orden en que el instructivo numera los campos, que es
 * el orden de la secuencia del XSD. Un campo fuera de lugar invalida el archivo
 * aunque el contenido esté bien, así que el orden no se decide aquí: se hereda.
 *
 * Qué bloquea y qué no:
 *
 *   - `grado: 'siempre'` vacío es error. Sin eso el archivo se rechaza.
 *   - `grado: 'condicional'` y `'si_aplica'` vacíos se omiten. El instructivo
 *     los exige sólo en ciertos casos y evaluar esa condición en automático
 *     obligaría a mapear prosa a claves de catálogo, que es inventar.
 *   - Un contenedor opcional sin nada capturado no se emite. Emitirlo vacío
 *     produce un <datos_garantia/> que el portal rechaza por incompleto.
 */
function ramaXml(
  nodo: NodoRama,
  datos: DatosActo,
  ruta: number[],
  sangria: number,
  donde: string,
  errores: string[],
  advertencias: string[],
  /** La raíz del acto va siempre, aunque el instructivo la marque opcional:
   *  es opcional entre las diez ramas, no dentro del acto que ya se eligió. */
  raiz = false,
): string[] {
  if (!nodo.repetible)
    return nodoXml(nodo, datos, ruta, sangria, donde, errores, advertencias, undefined, undefined, raiz);

  const total = numeroRepeticiones(datos, nodo.no, ruta);
  const l: string[] = [];
  for (let i = 0; i < total; i++)
    l.push(...nodoXml(nodo, datos, [...ruta, i], sangria, donde, errores, advertencias, i, total));
  return l;
}

function nodoXml(
  nodo: NodoRama,
  datos: DatosActo,
  ruta: number[],
  sangria: number,
  donde: string,
  errores: string[],
  advertencias: string[],
  indice?: number,
  total?: number,
  raiz = false,
): string[] {
  const ubicacion =
    indice != null && (total ?? 1) > 1
      ? `${donde} · ${nodo.nombre} ${indice + 1}`
      : `${donde} · ${nodo.nombre}`;

  // Un contenedor que no se exige SIEMPRE y que nadie llenó no va en el
  // archivo. Incluye los condicionales: <datos_garantia> existe si hay
  // garantía, y un mutuo sin garantía tiene que poder cerrarse.
  if (nodo.grado !== 'siempre' && !raiz && !tieneAlgo(nodo, datos, ruta)) return [];

  const dentro = nodo.esTipoPersona
    ? tipoPersonaXml(nodo, datos, ruta, sangria + 1, ubicacion, errores, advertencias)
    : contenidoXml(nodo, datos, ruta, sangria + 1, ubicacion, errores, advertencias);

  const s = ' '.repeat(sangria);
  return [`${s}<${nodo.etiqueta}>`, ...dentro, `${s}</${nodo.etiqueta}>`];
}

function contenidoXml(
  nodo: NodoRama,
  datos: DatosActo,
  ruta: number[],
  sangria: number,
  donde: string,
  errores: string[],
  advertencias: string[],
): string[] {
  const l: string[] = [];
  for (const campo of nodo.campos)
    l.push(...campoXml(campo, datos, ruta, sangria, donde, errores));

  identificadoresXml(nodo, datos, ruta, donde, errores, advertencias);

  for (const hijo of nodo.hijos)
    l.push(...ramaXml(hijo, datos, ruta, sangria, donde, errores, advertencias));
  return l;
}

/** Sólo la variante elegida. Las otras dos no existen en el archivo. */
function tipoPersonaXml(
  nodo: NodoRama,
  datos: DatosActo,
  ruta: number[],
  sangria: number,
  donde: string,
  errores: string[],
  advertencias: string[],
): string[] {
  const l: string[] = [];
  for (const campo of nodo.campos)
    l.push(...campoXml(campo, datos, ruta, sangria, donde, errores));

  const elegida = leerVariante(datos, nodo.no, ruta);
  const variante = nodo.hijos.find((h) => h.etiqueta === elegida);
  if (!variante) {
    errores.push(`${donde}: falta el tipo de persona (física, moral o fideicomiso).`);
    return l;
  }
  return [...l, ...ramaXml(variante, datos, ruta, sangria, donde, errores, advertencias)];
}

/**
 * RFC, CURP y fecha son intercambiables entre sí dentro de una persona: el
 * instructivo los marca "obligatorio si se cuenta con los mismos", pero exige
 * al menos uno. Faltar los tres frena el aviso; faltar uno, no.
 */
const IDENTIFICADORES = ['rfc', 'curp', 'fecha_nacimiento', 'fecha_constitucion'];

function identificadoresXml(
  nodo: NodoRama,
  datos: DatosActo,
  ruta: number[],
  donde: string,
  errores: string[],
  advertencias: string[],
): void {
  const propios = nodo.campos.filter((c) => IDENTIFICADORES.includes(c.etiqueta));
  if (propios.length < 2) return;
  const capturados = propios.filter((c) => leerValor(datos, c.no, ruta).trim() !== '');
  if (capturados.length === 0)
    errores.push(
      `${donde}: no tiene ${propios.map((c) => c.etiqueta).join(', ')}. El layout necesita al ` +
        'menos uno de ellos.',
    );
  else if (capturados.length < propios.length)
    advertencias.push(
      `${donde}: sin ${propios
        .filter((c) => leerValor(datos, c.no, ruta).trim() === '')
        .map((c) => c.etiqueta)
        .join(', ')}.`,
    );
}

function campoXml(
  campo: CampoFep,
  datos: DatosActo,
  ruta: number[],
  sangria: number,
  donde: string,
  errores: string[],
): string[] {
  const crudo = leerValor(datos, campo.no, ruta).trim();
  if (!crudo) {
    if (campo.grado === 'siempre')
      errores.push(`${donde}: falta ${campo.nombre} (campo ${campo.no}).`);
    return [];
  }

  // El mismo juicio que hace la captura. Si aquí pasara algo que allá se marcó
  // como inválido, el notario vería "listo" y el portal rechazaría el archivo.
  const problema = validarCampo(campo, crudo);
  if (problema) {
    errores.push(`${donde}: ${campo.nombre} (campo ${campo.no}) — ${problema}`);
    return [];
  }

  const valor = valorLayout(campo, crudo);
  if (valor === null) {
    errores.push(`${donde}: ${campo.nombre} (campo ${campo.no}) no tiene un valor utilizable.`);
    return [];
  }
  return [et(campo.etiqueta, valor, sangria)];
}

/**
 * El valor tal como lo espera el layout. Las fechas se guardan en ISO durante
 * la captura y se convierten aquí, en un solo lugar; los importes llevan dos
 * decimales obligatorios; RFC y CURP conservan el & y la Ñ.
 */
export function valorLayout(campo: CampoFep, crudo: string): string | null {
  switch (controlDe(campo)) {
    case 'fecha':
      return fechaLayout(crudo) ?? (/^\d{8}$/.test(crudo) ? crudo : null);
    case 'monto': {
      const n = Number(crudo.replace(/[, ]/g, ''));
      return Number.isFinite(n) ? n.toFixed(2) : null;
    }
    case 'catalogo':
    case 'numero':
      return claveLayout(crudo) || null;
    default:
      return IDENTIFICADORES.includes(campo.etiqueta) || /^(rfc|curp)$/.test(campo.etiqueta)
        ? claveLayout(crudo) || null
        : textoLayout(crudo) || null;
  }
}

/** ¿Hay algo capturado en este nodo o debajo? Decide si un contenedor opcional
 *  se emite o no existe. */
function tieneAlgo(nodo: NodoRama, datos: DatosActo, ruta: number[]): boolean {
  if (nodo.campos.some((c) => leerValor(datos, c.no, ruta).trim() !== '')) return true;
  if (nodo.esTipoPersona && leerVariante(datos, nodo.no, ruta)) return true;
  return nodo.hijos.some((h) =>
    h.repetible
      ? Array.from({ length: numeroRepeticiones(datos, h.no, ruta) }, (_, i) => [
          ...ruta,
          i,
        ]).some((r) => tieneAlgo(h, datos, r))
      : tieneAlgo(h, datos, ruta),
  );
}
