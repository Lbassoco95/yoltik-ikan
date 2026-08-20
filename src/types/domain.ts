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

// =====================================================================
// Cliente final (tabla `client`, migration 0004)
// =====================================================================
export type TipoOperacion =
  | 'compra_fiat_cripto'
  | 'venta_cripto_fiat'
  | 'retiro_cripto'
  | 'deposito_fiat'
  | 'otro';

export interface Client {
  id: string;
  organization_id: string;
  tipo_persona: TipoPersona;
  nombre_razon_social: string;
  curp: string | null;
  rfc: string | null;
  nacionalidad: string | null;
  entidad_federativa: string | null;
  pais_residencia_iso2: string | null;
  datos_kyc: Record<string, unknown>;
  datos_kyb: Record<string, unknown> | null;
  nivel_kyc: NivelKyc;
  alto_de_oficio: boolean;
  activo: boolean;
  capturado_por: string | null;
  capturado_en: string;
}

/** Payload de alta que captura el Operador. `organization_id` y `capturado_por`
 *  los resuelve la capa de API desde la sesión (no los envía el formulario). */
export interface NuevoClienteInput {
  tipo_persona: TipoPersona;
  nombre_razon_social: string;
  rfc?: string;
  curp?: string;
  nacionalidad?: string;
  entidad_federativa?: string;
  pais_residencia_iso2?: string;
  datos_kyc?: Record<string, unknown>;
}

export interface Operation {
  id: string;
  organization_id: string;
  client_id: string;
  tipo: TipoOperacion;
  monto_mxn: number;
  moneda_origen: string;
  activo_virtual: string | null;
  contraparte: Record<string, unknown> | null;
  fecha: string;
  requiere_aviso: boolean;
  capturado_por: string | null;
  capturado_en: string;
}

export interface NuevaOperacionInput {
  client_id: string;
  tipo: TipoOperacion;
  monto_mxn: number;
  moneda_origen?: string;
  activo_virtual?: string;
  contraparte?: Record<string, unknown>;
  fecha?: string;
}

// =====================================================================
// Plantilla de matriz de riesgo del cliente (tabla client_risk_template)
// =====================================================================
export interface MatrizOpcion {
  valor: number;
  label: string;
  /** Marca opcional para triggers de alto de oficio (no presente en el seed actual). */
  alto_de_oficio?: boolean;
}
export interface MatrizVariable {
  codigo: string;
  pregunta: string;
  criterio?: string;
  peso?: number;
  opciones: MatrizOpcion[];
}
export interface MatrizElemento {
  codigo: string;
  nombre: string;
  /** Predicado tipo "tipo_persona == 'fisica'". */
  aplica_si?: string;
  variables: MatrizVariable[];
}
export interface MatrizEscalaRango {
  min: number;
  max: number;
  acciones: string;
}
export interface MatrizConfig {
  elementos: MatrizElemento[];
  escala_cliente: {
    bajo: MatrizEscalaRango;
    medio: MatrizEscalaRango;
    alto: MatrizEscalaRango;
  };
  triggers_alto_de_oficio: { codigo: string; descripcion: string }[];
}
export interface ClientRiskTemplate {
  id: string;
  organization_id: string;
  sector: SectorAV;
  version: number;
  configuracion: MatrizConfig;
  activa: boolean;
}
