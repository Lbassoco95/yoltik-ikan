import { supabase } from '@/lib/supabase';

/**
 * Prospectos del formulario público.
 *
 * Los escribe la Edge Function `on-prospect-intake` con service_role. Sólo los
 * lee Kawiil: la política de la migration 0027 lo comprueba en la base, así
 * que si alguien llama esto desde una organización cliente recibe una lista
 * vacía, no un error — y eso es lo correcto, porque ni siquiera debe saber
 * cuántos hay.
 */

export type EstadoProspecto =
  | 'nuevo'
  | 'contactado'
  | 'en_diagnostico'
  | 'cliente'
  | 'descartado';

/** Los cinco que admite `marcar_prospecto`. Cambiar esta lista sin cambiar la
 *  función de la base produce un error en la cara del usuario. */
export const ESTADOS_PROSPECTO: { valor: EstadoProspecto; etiqueta: string }[] = [
  { valor: 'nuevo', etiqueta: 'Nuevo' },
  { valor: 'contactado', etiqueta: 'Contactado' },
  { valor: 'en_diagnostico', etiqueta: 'En diagnóstico' },
  { valor: 'cliente', etiqueta: 'Ya es cliente' },
  { valor: 'descartado', etiqueta: 'Descartado' },
];

export interface Prospecto {
  id: string;
  razon_social: string;
  rfc: string;
  regimen_fiscal: string | null;
  actividad_vulnerable: string[];
  estado_operacion: string | null;
  volumen_ops_mes: number | null;
  clientes_activos: number | null;
  /** Lo que el formulario pregunta sobre su cumplimiento. Null = no contestó,
   *  que no es lo mismo que «no». */
  tiene_oc_designado: boolean | null;
  registrado_sppld: boolean | null;
  tiene_manual_pld: boolean | null;
  contacto_nombre: string;
  contacto_cargo: string | null;
  contacto_email: string;
  contacto_telefono: string | null;
  ciudad: string | null;
  estado_republica: string | null;
  origen: string | null;
  notas: string | null;
  status: EstadoProspecto | null;
  created_at: string;
  updated_at: string;
}

export async function listarProspectos(estado?: EstadoProspecto): Promise<Prospecto[]> {
  let q = supabase
    .from('prospect_intake')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (estado) q = q.eq('status', estado);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Prospecto[];
}

export interface ResumenProspectos {
  status: string;
  cuantos: number;
  mas_reciente: string | null;
}

export async function resumenProspectos(): Promise<ResumenProspectos[]> {
  const { data, error } = await supabase.from('v_prospectos_resumen').select('*');
  if (error) throw error;
  return (data ?? []) as unknown as ResumenProspectos[];
}

/**
 * Mueve un prospecto de estado y le añade una nota.
 *
 * Va por la función de la base y no por un `update`: con update abierto se
 * podría reescribir el nombre o el correo con el que esa persona se registró,
 * y ese dato es la constancia de lo que escribió. Las notas se ACUMULAN, no se
 * sustituyen: son el historial de lo que se habló, y perderlo al escribir la
 * siguiente sería perder el motivo por el que el prospecto está donde está.
 */
export async function marcarProspecto(
  id: string,
  status: EstadoProspecto,
  nota?: string,
): Promise<void> {
  const { error } = await supabase.rpc('marcar_prospecto', {
    p_id: id,
    p_status: status,
    p_notas: nota?.trim() || null,
  });
  if (error) throw error;
}
