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
      const detalle = a.datos_acto ?? {};
      const claves = Object.keys(detalle).filter((k) => String(detalle[k] ?? '').trim() !== '');
      if (claves.length === 0) {
        advertencias.push(
          `${donde}: la rama <${acto}> va vacía. El detalle del acto todavía no se captura en ` +
            'Ikán, así que el portal va a rechazar este aviso hasta que se complete.',
        );
        l.push(`      <${acto}/>`);
      } else {
        l.push(`      <${acto}>`);
        for (const k of claves.sort()) l.push(et(k, String(detalle[k]), 7));
        l.push(`      </${acto}>`);
      }
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
