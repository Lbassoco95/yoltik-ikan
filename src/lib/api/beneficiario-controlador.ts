import { supabase } from '@/lib/supabase';
import { contextoSesion } from './contexto';
import type {
  EstadoCascada,
  EstadoPaso,
  Paso,
  SocioParaCascada,
  TipoSocial,
} from '@/lib/riesgo/beneficiario-controlador';
import {
  CASCADA_VACIA,
  motivoDelBloqueo,
  posteriorYaPracticado,
  sePuedePracticar,
} from '@/lib/riesgo/beneficiario-controlador';

// Las dos reglas de orden viven en el módulo puro y se reexportan desde aquí:
// son las que la pantalla necesita para explicar un bloqueo antes de intentar
// escribir, y así se pueden probar sin levantar el cliente de Supabase.
export { motivoDelBloqueo, posteriorYaPracticado };
import type { TipoPersona } from '@/types/domain';

// =====================================================================
// Catálogo de tipos sociales
// =====================================================================

/**
 * Los tipos sociales vigentes, con su mínimo de socios.
 *
 * Sale de la BD y no de una constante en el front porque el mínimo es una cifra
 * normativa: cuando la LGSM cambie, cambia el catálogo, no el código compilado.
 */
export async function listarTiposSociales(): Promise<TipoSocial[]> {
  const { data, error } = await supabase
    .from('tipo_social')
    .select('clave, nombre, socios_minimo, socios_maximo, fundamento, solo_personas_fisicas')
    .eq('vigente', true)
    .order('nombre');
  if (error) throw error;
  return (data ?? []) as unknown as TipoSocial[];
}

// =====================================================================
// Socios
// =====================================================================

export interface Socio extends SocioParaCascada {
  organization_id: string;
  client_id: string;
  cargo: string | null;
  acciones: number | null;
  capturado_en: string;
}

export interface NuevoSocioInput {
  client_id: string;
  tipo_persona: TipoPersona;
  nombre_razon_social: string;
  /** Cuando el socio ya existe como cliente en Ikán: la cadena sigue por aquí. */
  socio_client_id?: string | null;
  porcentaje_titularidad?: number | null;
  porcentaje_voto?: number | null;
  cargo?: string | null;
  acciones?: number | null;
}

export async function listarSocios(clientId: string): Promise<Socio[]> {
  const { data, error } = await supabase
    .from('socio')
    .select('*')
    .eq('client_id', clientId)
    .order('capturado_en');
  if (error) throw error;
  return (data ?? []) as unknown as Socio[];
}

/**
 * Los socios de varios clientes de un jalón.
 *
 * Para ascender en la cadena sin una consulta por eslabón: una estructura de
 * cuatro niveles con cinco socios cada uno son ciento veinte viajes a la BD si
 * se pregunta de uno en uno.
 */
export async function sociosDeVarios(clientIds: string[]): Promise<Map<string, Socio[]>> {
  const porCliente = new Map<string, Socio[]>();
  if (clientIds.length === 0) return porCliente;
  const { data, error } = await supabase
    .from('socio')
    .select('*')
    .in('client_id', clientIds)
    .order('capturado_en');
  if (error) throw error;
  for (const s of (data ?? []) as unknown as Socio[]) {
    const lista = porCliente.get(s.client_id);
    if (lista) lista.push(s);
    else porCliente.set(s.client_id, [s]);
  }
  return porCliente;
}

export async function crearSocio(input: NuevoSocioInput): Promise<Socio> {
  const { uid, organizationId } = await contextoSesion();
  const { data, error } = await supabase
    .from('socio')
    .insert({
      organization_id: organizationId,
      client_id: input.client_id,
      tipo_persona: input.tipo_persona,
      nombre_razon_social: input.nombre_razon_social.trim(),
      socio_client_id: input.socio_client_id ?? null,
      porcentaje_titularidad: input.porcentaje_titularidad ?? null,
      porcentaje_voto: input.porcentaje_voto ?? null,
      cargo: input.cargo?.trim() || null,
      acciones: input.acciones ?? null,
      capturado_por: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as Socio;
}

export async function actualizarSocio(
  id: string,
  cambios: Partial<Omit<NuevoSocioInput, 'client_id'>>,
): Promise<void> {
  const { error } = await supabase.from('socio').update(cambios).eq('id', id);
  if (error) throw error;
}

/**
 * Quita un socio de la estructura.
 *
 * Se permite borrar porque una captura equivocada de la estructura societaria
 * no es un hecho registrado —como sí lo es una operación—: es un dato del
 * expediente que se corrige. Lo que no se borra es la cascada practicada sobre
 * ella; ver `borrarSocio` en la UI, que obliga a volver a practicar el paso I.
 */
export async function borrarSocio(id: string): Promise<void> {
  const { error } = await supabase.from('socio').delete().eq('id', id);
  if (error) throw error;
}

// =====================================================================
// La cascada
// =====================================================================

export interface PasoCascada {
  id: string;
  client_id: string;
  paso: Paso;
  estado: EstadoPaso;
  nota: string | null;
  practicado_en: string | null;
}

/**
 * El estado de los tres pasos de un cliente.
 *
 * Devuelve SIEMPRE los tres, rellenando con `no_practicado` los que no tienen
 * fila. Un paso sin fila y un paso no practicado son lo mismo, y la pantalla no
 * debería tener que distinguirlos.
 */
export async function getCascada(
  clientId: string,
): Promise<{ estado: EstadoCascada; pasos: PasoCascada[] }> {
  const { data, error } = await supabase
    .from('cascada_bc')
    .select('id, client_id, paso, estado, nota, practicado_en')
    .eq('client_id', clientId);
  if (error) throw error;

  const pasos = (data ?? []) as unknown as PasoCascada[];
  const estado: EstadoCascada = { ...CASCADA_VACIA };
  for (const p of pasos) estado[p.paso] = p.estado;
  return { estado, pasos };
}

export interface PracticarPasoInput {
  client_id: string;
  paso: Paso;
  estado: Exclude<EstadoPaso, 'no_practicado'>;
  /** Qué se hizo y qué se miró. El art. 23 Quinquies obliga a documentar el
   *  PROCEDIMIENTO, no sólo el resultado, así que es obligatoria. */
  nota: string;
}

/**
 * Asienta que un paso se practicó.
 *
 * Comprueba el orden ANTES de escribir: el art. 23 Quinquies fija «por lo menos
 * el siguiente orden de prelación», y un paso II practicado sin haber agotado
 * el I es un expediente que no resiste una verificación. La comprobación es
 * contra el estado real en BD, no contra lo que la pantalla cree.
 */
export async function practicarPaso(input: PracticarPasoInput): Promise<void> {
  const nota = input.nota.trim();
  if (!nota) {
    throw new Error(
      'Falta describir el procedimiento seguido. El art. 23 Quinquies obliga a documentarlo, no sólo su resultado.',
    );
  }

  const { estado } = await getCascada(input.client_id);
  if (!sePuedePracticar(input.paso, estado)) {
    throw new Error(
      `No se puede practicar el paso ${input.paso} todavía: ${motivoDelBloqueo(input.paso, estado)}`,
    );
  }

  // Corregir un paso a «con resultado» cuando ya se practicaron los
  // siguientes dejaría una cascada imposible: pasos posteriores a uno que
  // terminó la búsqueda. No se resuelve borrándolos —eso tiraría un
  // procedimiento ya documentado, que es justo lo que el art. 23 Quinquies
  // manda conservar—, se rechaza y se dice qué corregir primero.
  const posterior = posteriorYaPracticado(input.paso, input.estado, estado);
  if (posterior) {
    throw new Error(
      `El paso ${posterior} ya se practicó a partir de este. Corrígelo antes de asentar que el ` +
        `paso ${input.paso} sí arrojó beneficiarios.`,
    );
  }

  const { uid, organizationId } = await contextoSesion();
  const { error } = await supabase.from('cascada_bc').upsert(
    {
      organization_id: organizationId,
      client_id: input.client_id,
      paso: input.paso,
      estado: input.estado,
      nota,
      practicado_por: uid,
      practicado_en: new Date().toISOString(),
    },
    { onConflict: 'client_id,paso' },
  );
  if (error) throw error;
}

// =====================================================================
// Beneficiarios controladores
// =====================================================================

export interface BeneficiarioControlador {
  id: string;
  organization_id: string;
  client_id: string;
  paso: Paso;
  socio_id: string | null;
  apellido_paterno: string;
  apellido_materno: string | null;
  nombre: string;
  fecha_nacimiento: string;
  pais_nacionalidad_clave: string;
  curp: string | null;
  rfc: string | null;
  sin_curp: boolean;
  sin_rfc: boolean;
  nota: string | null;
  identificado_en: string;
}

export type NuevoBeneficiarioInput = Omit<
  BeneficiarioControlador,
  'id' | 'organization_id' | 'identificado_en'
>;

export async function listarBeneficiarios(
  clientId: string,
): Promise<BeneficiarioControlador[]> {
  const { data, error } = await supabase
    .from('beneficiario_controlador')
    .select('*')
    .eq('client_id', clientId)
    .order('identificado_en');
  if (error) throw error;
  return (data ?? []) as unknown as BeneficiarioControlador[];
}

/**
 * Registra un beneficiario controlador.
 *
 * Sólo los cuatro datos del Anexo 3, inciso a), numerales i), ii), iv) y ix).
 * NO se integra expediente completo ni se corre verificación de identidad sobre
 * él: la del art. 18 fr. I de la Ley está referida al Cliente con quien se
 * realiza la Actividad Vulnerable. Didit no se corre aquí.
 */
export async function registrarBeneficiario(
  input: NuevoBeneficiarioInput,
): Promise<BeneficiarioControlador> {
  const { uid, organizationId } = await contextoSesion();
  const { data, error } = await supabase
    .from('beneficiario_controlador')
    .insert({
      organization_id: organizationId,
      client_id: input.client_id,
      paso: input.paso,
      socio_id: input.socio_id,
      apellido_paterno: input.apellido_paterno.trim(),
      apellido_materno: input.apellido_materno?.trim() || null,
      nombre: input.nombre.trim(),
      fecha_nacimiento: input.fecha_nacimiento,
      pais_nacionalidad_clave: input.pais_nacionalidad_clave,
      // El «cuando cuente con ellas» aplica AL DATO, no a la obligación: si no
      // lo tiene, se registra la ausencia; no se deja el campo en blanco sin
      // decir nada.
      curp: input.sin_curp ? null : input.curp?.trim().toUpperCase() || null,
      rfc: input.sin_rfc ? null : input.rfc?.trim().toUpperCase() || null,
      sin_curp: input.sin_curp,
      sin_rfc: input.sin_rfc,
      nota: input.nota?.trim() || null,
      identificado_por: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as BeneficiarioControlador;
}

export async function borrarBeneficiario(id: string): Promise<void> {
  const { error } = await supabase.from('beneficiario_controlador').delete().eq('id', id);
  if (error) throw error;
}

// =====================================================================
// El tipo social, en el cliente
// =====================================================================

export interface DatosSociedad {
  tipo_social: string | null;
  pais_constitucion_clave: string | null;
}

/**
 * Guarda el tipo social y el país de constitución.
 *
 * Van juntos porque el mínimo de socios depende de los dos: el tipo lo fija, y
 * el país decide si la LGSM aplica siquiera. Guardar uno sin el otro deja la
 * revisión a medias.
 */
export async function guardarDatosSociedad(
  clientId: string,
  datos: DatosSociedad,
): Promise<void> {
  const { error } = await supabase
    .from('client')
    .update({
      tipo_social: datos.tipo_social,
      pais_constitucion_clave: datos.pais_constitucion_clave?.trim().toUpperCase() || null,
    })
    .eq('id', clientId);
  if (error) throw error;
}
