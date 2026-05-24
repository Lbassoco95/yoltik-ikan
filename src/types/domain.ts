/**
 * Tipos de dominio Ikán.
 * Las definiciones más estrictas vienen de Supabase (src/types/database.ts),
 * generadas con `npm run supabase:gen:types` después de aplicar migrations.
 */

export type SectorAV = 'IV' | 'V' | 'VII' | 'VIII' | 'XV' | 'XVI';

export type RolUsuario = 'operador' | 'oc' | 'admin';

export type ClasificacionRiesgo = 'bajo' | 'medio' | 'alto' | 'alto_oficio';

export type NivelKyc = 'N1' | 'N2' | 'N3';

export type SeveridadTipologia = 'baja' | 'media' | 'alta' | 'critica';

export type EstadoHallazgo =
  | 'abierto'
  | 'en_revision'
  | 'confirmado_inusual'
  | 'confirmado_preocupante'
  | 'descartado'
  | 'falso_positivo';

export type EstadoAviso = 'borrador' | 'listo_firma' | 'enviado' | 'acusado';

export type TipoAviso = '24h' | 'mensual';

export type TipoPersona = 'fisica' | 'moral';

export interface Organization {
  id: string;
  rfc: string;
  razon_social: string;
  sectores: SectorAV[];
  oficio_alta_sat: string | null;
  fecha_alta_sat: string | null;
  representante_legal: string | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  organization_id: string;
  organization_name?: string;
  email: string;
  nombre: string;
  roles: RolUsuario[];
  activo: boolean;
  mfa_habilitado: boolean;
}
