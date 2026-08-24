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

/** SLA operativo interno de la bandeja del OC (migration 0007).
 *  NO es un plazo regulatorio distinto al de la fracción XII: sirve para que
 *  el OC sepa qué atender primero. */
export type ClasificacionUrgencia = '24_horas' | 'por_umbral';

export type TipoBitacoraHallazgo =
  | 'cambio_estado'
  | 'nota'
  | 'documento_subido'
  | 'cambio_urgencia';

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

// =====================================================================
// Hallazgo del Motor PLD (tabla `hallazgo`, migration 0005)
// =====================================================================
export interface Hallazgo {
  id: string;
  organization_id: string;
  operation_id: string | null;
  client_id: string | null;
  tipologia_id: string;
  tipologia_codigo: string;
  tipologia_nombre: string;
  tipologia_version: number;
  severidad: SeveridadTipologia;
  regla_payload: Record<string, unknown>;
  estado: EstadoHallazgo;
  clasificacion_urgencia: ClasificacionUrgencia;
  /** Folio emitido por `emitir_folio_hallazgo` al crear el hallazgo (migration 0008).
   *  Null solo en hallazgos anteriores al backfill. */
  folio: string | null;
  asignado_a: string | null;
  resolucion: string | null;
  creado_en: string;
  /** Joins de display (no columnas propias de `hallazgo`). */
  client?: { nombre_razon_social: string } | null;
  operation?: {
    monto_mxn: number;
    activo_virtual: string | null;
    fecha: string;
    tipo?: string | null;
    contraparte?: Record<string, unknown> | null;
  } | null;
}

// =====================================================================
// Expediente del hallazgo (migration 0007)
// =====================================================================
export interface HallazgoDocumento {
  id: string;
  hallazgo_id: string;
  storage_path: string;
  nombre_archivo: string;
  mime_type: string | null;
  tamano_bytes: number | null;
  subido_por: string | null;
  subido_en: string;
  /** Resuelto contra `user_profile` (no es columna de la tabla). */
  subido_por_nombre?: string | null;
}

export interface HallazgoBitacoraEntrada {
  id: string;
  hallazgo_id: string;
  tipo: TipoBitacoraHallazgo;
  descripcion: string;
  estado_anterior: EstadoHallazgo | null;
  estado_nuevo: EstadoHallazgo | null;
  usuario: string | null;
  creado_en: string;
  /** Resuelto contra `user_profile` (no es columna de la tabla). */
  usuario_nombre?: string | null;
}
