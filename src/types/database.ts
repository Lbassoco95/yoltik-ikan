export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerta_on_chain_signal: {
        Row: {
          activa: boolean
          codigo: string
          descripcion: string
          id: string
          organization_id: string
        }
        Insert: {
          activa?: boolean
          codigo: string
          descripcion: string
          id?: string
          organization_id: string
        }
        Update: {
          activa?: boolean
          codigo?: string
          descripcion?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerta_on_chain_signal_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      anclaje: {
        Row: {
          actualizado_en: string
          bloque_btc: number | null
          cadena_hash_final: string
          calendarios: string[]
          creado_en: string
          desde_secuencia: number
          detalle: string | null
          estado: string
          fecha_bloque: string | null
          hasta_secuencia: number
          id: string
          motivo: string
          organization_id: string
          ots: string | null
          raiz_merkle: string
        }
        Insert: {
          actualizado_en?: string
          bloque_btc?: number | null
          cadena_hash_final: string
          calendarios?: string[]
          creado_en?: string
          desde_secuencia: number
          detalle?: string | null
          estado?: string
          fecha_bloque?: string | null
          hasta_secuencia: number
          id?: string
          motivo: string
          organization_id: string
          ots?: string | null
          raiz_merkle: string
        }
        Update: {
          actualizado_en?: string
          bloque_btc?: number | null
          cadena_hash_final?: string
          calendarios?: string[]
          creado_en?: string
          desde_secuencia?: number
          detalle?: string | null
          estado?: string
          fecha_bloque?: string | null
          hasta_secuencia?: number
          id?: string
          motivo?: string
          organization_id?: string
          ots?: string | null
          raiz_merkle?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          accion: string
          actor: string | null
          antes: Json | null
          despues: Json | null
          id: string
          ip: unknown
          motivo: string | null
          organization_id: string | null
          recurso_id: string | null
          recurso_tipo: string
          rol_activo: Database["public"]["Enums"]["rol_usuario"] | null
          ts: string
          user_agent: string | null
        }
        Insert: {
          accion: string
          actor?: string | null
          antes?: Json | null
          despues?: Json | null
          id?: string
          ip?: unknown
          motivo?: string | null
          organization_id?: string | null
          recurso_id?: string | null
          recurso_tipo: string
          rol_activo?: Database["public"]["Enums"]["rol_usuario"] | null
          ts?: string
          user_agent?: string | null
        }
        Update: {
          accion?: string
          actor?: string | null
          antes?: Json | null
          despues?: Json | null
          id?: string
          ip?: unknown
          motivo?: string | null
          organization_id?: string | null
          recurso_id?: string | null
          recurso_tipo?: string
          rol_activo?: Database["public"]["Enums"]["rol_usuario"] | null
          ts?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      aviso: {
        Row: {
          acuse: Json | null
          de_demostracion: boolean
          estado: Database["public"]["Enums"]["estado_aviso"]
          exento: boolean
          firmado_en: string | null
          firmado_por: string | null
          generado_en: string
          generado_por: string | null
          hallazgo_ids: string[]
          id: string
          layout: string
          layout_version: string | null
          operation_ids: string[]
          organization_id: string
          payload: Json
          periodo: string | null
          referencia: string | null
          tipo: Database["public"]["Enums"]["tipo_aviso"]
          xml: string | null
        }
        Insert: {
          acuse?: Json | null
          de_demostracion?: boolean
          estado?: Database["public"]["Enums"]["estado_aviso"]
          exento?: boolean
          firmado_en?: string | null
          firmado_por?: string | null
          generado_en?: string
          generado_por?: string | null
          hallazgo_ids?: string[]
          id?: string
          layout?: string
          layout_version?: string | null
          operation_ids?: string[]
          organization_id: string
          payload: Json
          periodo?: string | null
          referencia?: string | null
          tipo: Database["public"]["Enums"]["tipo_aviso"]
          xml?: string | null
        }
        Update: {
          acuse?: Json | null
          de_demostracion?: boolean
          estado?: Database["public"]["Enums"]["estado_aviso"]
          exento?: boolean
          firmado_en?: string | null
          firmado_por?: string | null
          generado_en?: string
          generado_por?: string | null
          hallazgo_ids?: string[]
          id?: string
          layout?: string
          layout_version?: string | null
          operation_ids?: string[]
          organization_id?: string
          payload?: Json
          periodo?: string | null
          referencia?: string | null
          tipo?: Database["public"]["Enums"]["tipo_aviso"]
          xml?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aviso_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiario_controlador: {
        Row: {
          apellido_materno: string | null
          apellido_paterno: string
          client_id: string
          curp: string | null
          fecha_nacimiento: string
          id: string
          identificado_en: string
          identificado_por: string | null
          nombre: string
          nota: string | null
          organization_id: string
          pais_nacionalidad_clave: string
          paso: string
          rfc: string | null
          sin_curp: boolean
          sin_rfc: boolean
          socio_id: string | null
        }
        Insert: {
          apellido_materno?: string | null
          apellido_paterno: string
          client_id: string
          curp?: string | null
          fecha_nacimiento: string
          id?: string
          identificado_en?: string
          identificado_por?: string | null
          nombre: string
          nota?: string | null
          organization_id: string
          pais_nacionalidad_clave: string
          paso: string
          rfc?: string | null
          sin_curp?: boolean
          sin_rfc?: boolean
          socio_id?: string | null
        }
        Update: {
          apellido_materno?: string | null
          apellido_paterno?: string
          client_id?: string
          curp?: string | null
          fecha_nacimiento?: string
          id?: string
          identificado_en?: string
          identificado_por?: string | null
          nombre?: string
          nota?: string | null
          organization_id?: string
          pais_nacionalidad_clave?: string
          paso?: string
          rfc?: string | null
          sin_curp?: boolean
          sin_rfc?: boolean
          socio_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beneficiario_controlador_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiario_controlador_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiario_controlador_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "socio"
            referencedColumns: ["id"]
          },
        ]
      }
      cadena_auditoria: {
        Row: {
          actualizado_en: string
          organization_id: string
          ultima_secuencia: number
          ultimo_hash: string
        }
        Insert: {
          actualizado_en?: string
          organization_id: string
          ultima_secuencia?: number
          ultimo_hash?: string
        }
        Update: {
          actualizado_en?: string
          organization_id?: string
          ultima_secuencia?: number
          ultimo_hash?: string
        }
        Relationships: []
      }
      cambio_nivel_diligencia: {
        Row: {
          automatico: boolean
          client_id: string
          desde: Database["public"]["Enums"]["nivel_kyc"]
          firmado_por: string | null
          hacia: Database["public"]["Enums"]["nivel_kyc"]
          id: string
          motivo: string
          organization_id: string
          registrado_en: string
        }
        Insert: {
          automatico: boolean
          client_id: string
          desde: Database["public"]["Enums"]["nivel_kyc"]
          firmado_por?: string | null
          hacia: Database["public"]["Enums"]["nivel_kyc"]
          id?: string
          motivo: string
          organization_id: string
          registrado_en?: string
        }
        Update: {
          automatico?: boolean
          client_id?: string
          desde?: Database["public"]["Enums"]["nivel_kyc"]
          firmado_por?: string | null
          hacia?: Database["public"]["Enums"]["nivel_kyc"]
          id?: string
          motivo?: string
          organization_id?: string
          registrado_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "cambio_nivel_diligencia_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambio_nivel_diligencia_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cascada_bc: {
        Row: {
          client_id: string
          estado: Database["public"]["Enums"]["estado_paso_bc"]
          id: string
          nota: string | null
          organization_id: string
          paso: string
          practicado_en: string | null
          practicado_por: string | null
        }
        Insert: {
          client_id: string
          estado?: Database["public"]["Enums"]["estado_paso_bc"]
          id?: string
          nota?: string | null
          organization_id: string
          paso: string
          practicado_en?: string | null
          practicado_por?: string | null
        }
        Update: {
          client_id?: string
          estado?: Database["public"]["Enums"]["estado_paso_bc"]
          id?: string
          nota?: string | null
          organization_id?: string
          paso?: string
          practicado_en?: string | null
          practicado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cascada_bc_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cascada_bc_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_origen_recurso: {
        Row: {
          activo: boolean
          clave: string
          documentos_admitidos: Json
          id: string
          nombre: string
          requiere_justificacion: boolean
          version: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          activo?: boolean
          clave: string
          documentos_admitidos?: Json
          id?: string
          nombre: string
          requiere_justificacion?: boolean
          version?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          activo?: boolean
          clave?: string
          documentos_admitidos?: Json
          id?: string
          nombre?: string
          requiere_justificacion?: boolean
          version?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: []
      }
      catalogo_sat: {
        Row: {
          actualizado_en: string | null
          actualizado_por: string | null
          clave_patron: string | null
          codigo: string
          creado_en: string
          descripcion: string | null
          etiquetas_layout: string[]
          fuente: string
          id: string
          layout: string
          nombre: string
          notas: string | null
          version: number
        }
        Insert: {
          actualizado_en?: string | null
          actualizado_por?: string | null
          clave_patron?: string | null
          codigo: string
          creado_en?: string
          descripcion?: string | null
          etiquetas_layout?: string[]
          fuente?: string
          id?: string
          layout?: string
          nombre: string
          notas?: string | null
          version?: number
        }
        Update: {
          actualizado_en?: string | null
          actualizado_por?: string | null
          clave_patron?: string | null
          codigo?: string
          creado_en?: string
          descripcion?: string | null
          etiquetas_layout?: string[]
          fuente?: string
          id?: string
          layout?: string
          nombre?: string
          notas?: string | null
          version?: number
        }
        Relationships: []
      }
      catalogo_valor: {
        Row: {
          catalogo_id: string
          clave: string
          descripcion: string
          id: string
          orden: number | null
          version_carga: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          catalogo_id: string
          clave: string
          descripcion: string
          id?: string
          orden?: number | null
          version_carga?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          catalogo_id?: string
          clave?: string
          descripcion?: string
          id?: string
          orden?: number | null
          version_carga?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_valor_catalogo_id_fkey"
            columns: ["catalogo_id"]
            isOneToOne: false
            referencedRelation: "catalogo_sat"
            referencedColumns: ["id"]
          },
        ]
      }
      client: {
        Row: {
          actividad_economica_clave: string | null
          activo: boolean
          allegados_conyuge_declaracion:
            | Database["public"]["Enums"]["estado_declaracion"]
            | null
          allegados_conyuge_respondido_en: string | null
          allegados_dependientes_declaracion:
            | Database["public"]["Enums"]["estado_declaracion"]
            | null
          allegados_dependientes_respondido_en: string | null
          allegados_vinculos_declaracion:
            | Database["public"]["Enums"]["estado_declaracion"]
            | null
          allegados_vinculos_respondido_en: string | null
          alto_de_oficio: boolean
          apellido_materno: string | null
          apellido_paterno: string | null
          bc_exencion: string | null
          beneficiario_controlador: Json | null
          canal_distribucion: string | null
          capturado_en: string
          capturado_por: string | null
          clave_pizarra: string | null
          condicion_pep: string | null
          curp: string | null
          datos_kyb: Json | null
          datos_kyc: Json
          entidad_federativa: string | null
          entidad_federativa_clave: string | null
          fecha_constitucion: string | null
          fecha_nacimiento: string | null
          frecuencia_esperada_anual: number | null
          id: string
          moffin_case_id: string | null
          municipio: string | null
          nacionalidad: string | null
          nivel_kyc: Database["public"]["Enums"]["nivel_kyc"]
          nombre: string | null
          nombre_razon_social: string
          organization_id: string
          pais_constitucion_clave: string | null
          pais_nacionalidad_clave: string | null
          pais_residencia_iso2: string | null
          pep_evidencia: Json | null
          rfc: string | null
          subdivision_clave: string | null
          subdivision_fuera_de_lista: boolean
          tipo_persona: Database["public"]["Enums"]["tipo_persona"]
          tipo_social: string | null
          triggers_oficio: string[]
        }
        Insert: {
          actividad_economica_clave?: string | null
          activo?: boolean
          allegados_conyuge_declaracion?:
            | Database["public"]["Enums"]["estado_declaracion"]
            | null
          allegados_conyuge_respondido_en?: string | null
          allegados_dependientes_declaracion?:
            | Database["public"]["Enums"]["estado_declaracion"]
            | null
          allegados_dependientes_respondido_en?: string | null
          allegados_vinculos_declaracion?:
            | Database["public"]["Enums"]["estado_declaracion"]
            | null
          allegados_vinculos_respondido_en?: string | null
          alto_de_oficio?: boolean
          apellido_materno?: string | null
          apellido_paterno?: string | null
          bc_exencion?: string | null
          beneficiario_controlador?: Json | null
          canal_distribucion?: string | null
          capturado_en?: string
          capturado_por?: string | null
          clave_pizarra?: string | null
          condicion_pep?: string | null
          curp?: string | null
          datos_kyb?: Json | null
          datos_kyc?: Json
          entidad_federativa?: string | null
          entidad_federativa_clave?: string | null
          fecha_constitucion?: string | null
          fecha_nacimiento?: string | null
          frecuencia_esperada_anual?: number | null
          id?: string
          moffin_case_id?: string | null
          municipio?: string | null
          nacionalidad?: string | null
          nivel_kyc?: Database["public"]["Enums"]["nivel_kyc"]
          nombre?: string | null
          nombre_razon_social: string
          organization_id: string
          pais_constitucion_clave?: string | null
          pais_nacionalidad_clave?: string | null
          pais_residencia_iso2?: string | null
          pep_evidencia?: Json | null
          rfc?: string | null
          subdivision_clave?: string | null
          subdivision_fuera_de_lista?: boolean
          tipo_persona: Database["public"]["Enums"]["tipo_persona"]
          tipo_social?: string | null
          triggers_oficio?: string[]
        }
        Update: {
          actividad_economica_clave?: string | null
          activo?: boolean
          allegados_conyuge_declaracion?:
            | Database["public"]["Enums"]["estado_declaracion"]
            | null
          allegados_conyuge_respondido_en?: string | null
          allegados_dependientes_declaracion?:
            | Database["public"]["Enums"]["estado_declaracion"]
            | null
          allegados_dependientes_respondido_en?: string | null
          allegados_vinculos_declaracion?:
            | Database["public"]["Enums"]["estado_declaracion"]
            | null
          allegados_vinculos_respondido_en?: string | null
          alto_de_oficio?: boolean
          apellido_materno?: string | null
          apellido_paterno?: string | null
          bc_exencion?: string | null
          beneficiario_controlador?: Json | null
          canal_distribucion?: string | null
          capturado_en?: string
          capturado_por?: string | null
          clave_pizarra?: string | null
          condicion_pep?: string | null
          curp?: string | null
          datos_kyb?: Json | null
          datos_kyc?: Json
          entidad_federativa?: string | null
          entidad_federativa_clave?: string | null
          fecha_constitucion?: string | null
          fecha_nacimiento?: string | null
          frecuencia_esperada_anual?: number | null
          id?: string
          moffin_case_id?: string | null
          municipio?: string | null
          nacionalidad?: string | null
          nivel_kyc?: Database["public"]["Enums"]["nivel_kyc"]
          nombre?: string | null
          nombre_razon_social?: string
          organization_id?: string
          pais_constitucion_clave?: string | null
          pais_nacionalidad_clave?: string | null
          pais_residencia_iso2?: string | null
          pep_evidencia?: Json | null
          rfc?: string | null
          subdivision_clave?: string | null
          subdivision_fuera_de_lista?: boolean
          tipo_persona?: Database["public"]["Enums"]["tipo_persona"]
          tipo_social?: string | null
          triggers_oficio?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "client_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tipo_social_fkey"
            columns: ["tipo_social"]
            isOneToOne: false
            referencedRelation: "tipo_social"
            referencedColumns: ["clave"]
          },
        ]
      }
      client_risk_assessment: {
        Row: {
          clasificacion: Database["public"]["Enums"]["clasificacion_riesgo"]
          client_id: string
          evaluado_en: string
          evaluado_por: string | null
          id: string
          metodologia_version: number | null
          motivo_alto_de_oficio: string | null
          respuestas: Json
          respuestas_clave: Json
          score_total: number
          secuencia: number
          snapshot_listas_plenario: string | null
          subtotales: Json
          template_id: string
        }
        Insert: {
          clasificacion: Database["public"]["Enums"]["clasificacion_riesgo"]
          client_id: string
          evaluado_en?: string
          evaluado_por?: string | null
          id?: string
          metodologia_version?: number | null
          motivo_alto_de_oficio?: string | null
          respuestas: Json
          respuestas_clave?: Json
          score_total: number
          secuencia?: number
          snapshot_listas_plenario?: string | null
          subtotales: Json
          template_id: string
        }
        Update: {
          clasificacion?: Database["public"]["Enums"]["clasificacion_riesgo"]
          client_id?: string
          evaluado_en?: string
          evaluado_por?: string | null
          id?: string
          metodologia_version?: number | null
          motivo_alto_de_oficio?: string | null
          respuestas?: Json
          respuestas_clave?: Json
          score_total?: number
          secuencia?: number
          snapshot_listas_plenario?: string | null
          subtotales?: Json
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_risk_assessment_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_risk_assessment_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "client_risk_template"
            referencedColumns: ["id"]
          },
        ]
      }
      client_risk_template: {
        Row: {
          activa: boolean
          configuracion: Json
          creada_en: string
          creada_por: string | null
          estado: Database["public"]["Enums"]["estado_plantilla"]
          id: string
          notas_version: string | null
          organization_id: string
          publicada_en: string | null
          publicada_por: string | null
          sector: Database["public"]["Enums"]["sector_av"]
          version: number
        }
        Insert: {
          activa?: boolean
          configuracion: Json
          creada_en?: string
          creada_por?: string | null
          estado?: Database["public"]["Enums"]["estado_plantilla"]
          id?: string
          notas_version?: string | null
          organization_id: string
          publicada_en?: string | null
          publicada_por?: string | null
          sector: Database["public"]["Enums"]["sector_av"]
          version?: number
        }
        Update: {
          activa?: boolean
          configuracion?: Json
          creada_en?: string
          creada_por?: string | null
          estado?: Database["public"]["Enums"]["estado_plantilla"]
          id?: string
          notas_version?: string | null
          organization_id?: string
          publicada_en?: string | null
          publicada_por?: string | null
          sector?: Database["public"]["Enums"]["sector_av"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_risk_template_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_allegado: {
        Row: {
          apellido_materno: string | null
          apellido_paterno: string | null
          capturado_en: string
          capturado_por: string | null
          client_id: string
          curp: string | null
          fecha_constitucion: string | null
          fecha_nacimiento: string | null
          id: string
          justificacion: string | null
          naturaleza_vinculo: Database["public"]["Enums"]["naturaleza_allegado"]
          nombre: string | null
          nombre_razon_social: string | null
          organization_id: string
          pais_constitucion_clave: string | null
          pais_nacionalidad_clave: string | null
          porcentaje_participacion: number | null
          requiere_documentacion: boolean
          rfc: string | null
          sin_curp: boolean
          sin_rfc: boolean
          tipo_persona: Database["public"]["Enums"]["tipo_persona"]
        }
        Insert: {
          apellido_materno?: string | null
          apellido_paterno?: string | null
          capturado_en?: string
          capturado_por?: string | null
          client_id: string
          curp?: string | null
          fecha_constitucion?: string | null
          fecha_nacimiento?: string | null
          id?: string
          justificacion?: string | null
          naturaleza_vinculo: Database["public"]["Enums"]["naturaleza_allegado"]
          nombre?: string | null
          nombre_razon_social?: string | null
          organization_id: string
          pais_constitucion_clave?: string | null
          pais_nacionalidad_clave?: string | null
          porcentaje_participacion?: number | null
          requiere_documentacion?: boolean
          rfc?: string | null
          sin_curp?: boolean
          sin_rfc?: boolean
          tipo_persona: Database["public"]["Enums"]["tipo_persona"]
        }
        Update: {
          apellido_materno?: string | null
          apellido_paterno?: string | null
          capturado_en?: string
          capturado_por?: string | null
          client_id?: string
          curp?: string | null
          fecha_constitucion?: string | null
          fecha_nacimiento?: string | null
          id?: string
          justificacion?: string | null
          naturaleza_vinculo?: Database["public"]["Enums"]["naturaleza_allegado"]
          nombre?: string | null
          nombre_razon_social?: string | null
          organization_id?: string
          pais_constitucion_clave?: string | null
          pais_nacionalidad_clave?: string | null
          porcentaje_participacion?: number | null
          requiere_documentacion?: boolean
          rfc?: string | null
          sin_curp?: boolean
          sin_rfc?: boolean
          tipo_persona?: Database["public"]["Enums"]["tipo_persona"]
        }
        Relationships: [
          {
            foreignKeyName: "cliente_allegado_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_allegado_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_aprobacion_relacion: {
        Row: {
          aprobada_en: string | null
          aprobada_por: string | null
          aprobada_rol_activo: Database["public"]["Enums"]["rol_usuario"] | null
          autoaprobacion: boolean
          calidad_aprobacion:
            | Database["public"]["Enums"]["calidad_aprobacion"]
            | null
          client_id: string
          creado_en: string
          creado_por: string | null
          evaluacion_riesgo_id: string | null
          id: string
          motivo: string | null
          organization_id: string
          vigencia_desde: string | null
          vigencia_hasta: string | null
        }
        Insert: {
          aprobada_en?: string | null
          aprobada_por?: string | null
          aprobada_rol_activo?:
            | Database["public"]["Enums"]["rol_usuario"]
            | null
          autoaprobacion?: boolean
          calidad_aprobacion?:
            | Database["public"]["Enums"]["calidad_aprobacion"]
            | null
          client_id: string
          creado_en?: string
          creado_por?: string | null
          evaluacion_riesgo_id?: string | null
          id?: string
          motivo?: string | null
          organization_id: string
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Update: {
          aprobada_en?: string | null
          aprobada_por?: string | null
          aprobada_rol_activo?:
            | Database["public"]["Enums"]["rol_usuario"]
            | null
          autoaprobacion?: boolean
          calidad_aprobacion?:
            | Database["public"]["Enums"]["calidad_aprobacion"]
            | null
          client_id?: string
          creado_en?: string
          creado_por?: string | null
          evaluacion_riesgo_id?: string | null
          id?: string
          motivo?: string | null
          organization_id?: string
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_aprobacion_relacion_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_aprobacion_relacion_evaluacion_riesgo_id_fkey"
            columns: ["evaluacion_riesgo_id"]
            isOneToOne: false
            referencedRelation: "client_risk_assessment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_aprobacion_relacion_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_consulta_secretaria_economia: {
        Row: {
          client_id: string
          cliente_aprobacion_relacion_id: string | null
          creado_en: string
          creado_por: string | null
          estado: Database["public"]["Enums"]["estado_consulta_se"]
          evidencia_storage_path: string | null
          fecha_consulta: string | null
          folio_acuse: string | null
          id: string
          medio_empleado: string | null
          motivo_no_disponible: string | null
          organization_id: string
          realizada_por: string | null
          resultado: Database["public"]["Enums"]["resultado_consulta_se"] | null
          version_expediente: string | null
          vigencia_desde: string | null
          vigencia_hasta: string | null
        }
        Insert: {
          client_id: string
          cliente_aprobacion_relacion_id?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_consulta_se"]
          evidencia_storage_path?: string | null
          fecha_consulta?: string | null
          folio_acuse?: string | null
          id?: string
          medio_empleado?: string | null
          motivo_no_disponible?: string | null
          organization_id: string
          realizada_por?: string | null
          resultado?:
            | Database["public"]["Enums"]["resultado_consulta_se"]
            | null
          version_expediente?: string | null
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Update: {
          client_id?: string
          cliente_aprobacion_relacion_id?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_consulta_se"]
          evidencia_storage_path?: string | null
          fecha_consulta?: string | null
          folio_acuse?: string | null
          id?: string
          medio_empleado?: string | null
          motivo_no_disponible?: string | null
          organization_id?: string
          realizada_por?: string | null
          resultado?:
            | Database["public"]["Enums"]["resultado_consulta_se"]
            | null
          version_expediente?: string | null
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_consulta_secretaria_e_cliente_aprobacion_relacion__fkey"
            columns: ["cliente_aprobacion_relacion_id"]
            isOneToOne: false
            referencedRelation: "cliente_aprobacion_relacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_consulta_secretaria_economia_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_consulta_secretaria_economia_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_cuestionario_reforzado: {
        Row: {
          client_id: string
          cliente_aprobacion_relacion_id: string | null
          creado_en: string
          creado_por: string | null
          estado: Database["public"]["Enums"]["estado_cuestionario"]
          firma_mecanismo: Database["public"]["Enums"]["firma_mecanismo"] | null
          firma_paquete_evidencia: Json | null
          firma_verificacion_identidad_id: string | null
          firmado_en: string | null
          firmado_por: string | null
          id: string
          operation_id: string | null
          organization_id: string
          respuestas: Json
          vigencia_desde: string | null
          vigencia_hasta: string | null
        }
        Insert: {
          client_id: string
          cliente_aprobacion_relacion_id?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_cuestionario"]
          firma_mecanismo?:
            | Database["public"]["Enums"]["firma_mecanismo"]
            | null
          firma_paquete_evidencia?: Json | null
          firma_verificacion_identidad_id?: string | null
          firmado_en?: string | null
          firmado_por?: string | null
          id?: string
          operation_id?: string | null
          organization_id: string
          respuestas?: Json
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Update: {
          client_id?: string
          cliente_aprobacion_relacion_id?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_cuestionario"]
          firma_mecanismo?:
            | Database["public"]["Enums"]["firma_mecanismo"]
            | null
          firma_paquete_evidencia?: Json | null
          firma_verificacion_identidad_id?: string | null
          firmado_en?: string | null
          firmado_por?: string | null
          id?: string
          operation_id?: string | null
          organization_id?: string
          respuestas?: Json
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_cuestionario_reforzad_cliente_aprobacion_relacion__fkey"
            columns: ["cliente_aprobacion_relacion_id"]
            isOneToOne: false
            referencedRelation: "cliente_aprobacion_relacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_cuestionario_reforzad_firma_verificacion_identidad_fkey"
            columns: ["firma_verificacion_identidad_id"]
            isOneToOne: false
            referencedRelation: "v_verificacion_vigente"
            referencedColumns: ["verificacion_id"]
          },
          {
            foreignKeyName: "cliente_cuestionario_reforzad_firma_verificacion_identidad_fkey"
            columns: ["firma_verificacion_identidad_id"]
            isOneToOne: false
            referencedRelation: "verificacion_identidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_cuestionario_reforzado_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_cuestionario_reforzado_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_cuestionario_reforzado_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "v_revision_total_auditoria"
            referencedColumns: ["operation_id"]
          },
          {
            foreignKeyName: "cliente_cuestionario_reforzado_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_documento_soporte: {
        Row: {
          client_id: string
          cliente_origen_recurso_id: string | null
          emisor: string
          emisor_nombre: string | null
          es_identificacion: boolean
          fecha_documento: string | null
          id: string
          justificacion: string | null
          mime_type: string | null
          moneda: string
          monto_acreditado: number | null
          nombre_archivo: string
          operation_id: string | null
          organization_id: string
          periodo_cubre_fin: string | null
          periodo_cubre_inicio: string | null
          storage_path: string
          subido_en: string
          subido_por: string | null
          tamano_bytes: number | null
          tipo_documento: string
        }
        Insert: {
          client_id: string
          cliente_origen_recurso_id?: string | null
          emisor: string
          emisor_nombre?: string | null
          es_identificacion?: boolean
          fecha_documento?: string | null
          id?: string
          justificacion?: string | null
          mime_type?: string | null
          moneda?: string
          monto_acreditado?: number | null
          nombre_archivo: string
          operation_id?: string | null
          organization_id: string
          periodo_cubre_fin?: string | null
          periodo_cubre_inicio?: string | null
          storage_path: string
          subido_en?: string
          subido_por?: string | null
          tamano_bytes?: number | null
          tipo_documento: string
        }
        Update: {
          client_id?: string
          cliente_origen_recurso_id?: string | null
          emisor?: string
          emisor_nombre?: string | null
          es_identificacion?: boolean
          fecha_documento?: string | null
          id?: string
          justificacion?: string | null
          mime_type?: string | null
          moneda?: string
          monto_acreditado?: number | null
          nombre_archivo?: string
          operation_id?: string | null
          organization_id?: string
          periodo_cubre_fin?: string | null
          periodo_cubre_inicio?: string | null
          storage_path?: string
          subido_en?: string
          subido_por?: string | null
          tamano_bytes?: number | null
          tipo_documento?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_documento_soporte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_documento_soporte_cliente_origen_recurso_id_fkey"
            columns: ["cliente_origen_recurso_id"]
            isOneToOne: false
            referencedRelation: "cliente_origen_recurso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_documento_soporte_cliente_origen_recurso_id_fkey"
            columns: ["cliente_origen_recurso_id"]
            isOneToOne: false
            referencedRelation: "v_suficiencia_origen_recursos"
            referencedColumns: ["origen_recursos_id"]
          },
          {
            foreignKeyName: "cliente_documento_soporte_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_documento_soporte_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "v_revision_total_auditoria"
            referencedColumns: ["operation_id"]
          },
          {
            foreignKeyName: "cliente_documento_soporte_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_origen_recurso: {
        Row: {
          capturado_en: string
          capturado_por: string | null
          catalogo_origen_recurso_id: string
          client_id: string
          id: string
          justificacion: string | null
          moneda: string
          monto_declarado: number
          oc_revisado: boolean
          operation_id: string | null
          organization_id: string
          version_catalogo: number
        }
        Insert: {
          capturado_en?: string
          capturado_por?: string | null
          catalogo_origen_recurso_id: string
          client_id: string
          id?: string
          justificacion?: string | null
          moneda?: string
          monto_declarado: number
          oc_revisado?: boolean
          operation_id?: string | null
          organization_id: string
          version_catalogo: number
        }
        Update: {
          capturado_en?: string
          capturado_por?: string | null
          catalogo_origen_recurso_id?: string
          client_id?: string
          id?: string
          justificacion?: string | null
          moneda?: string
          monto_declarado?: number
          oc_revisado?: boolean
          operation_id?: string | null
          organization_id?: string
          version_catalogo?: number
        }
        Relationships: [
          {
            foreignKeyName: "cliente_origen_recurso_catalogo_origen_recurso_id_fkey"
            columns: ["catalogo_origen_recurso_id"]
            isOneToOne: false
            referencedRelation: "catalogo_origen_recurso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_origen_recurso_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_origen_recurso_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_origen_recurso_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "v_revision_total_auditoria"
            referencedColumns: ["operation_id"]
          },
          {
            foreignKeyName: "cliente_origen_recurso_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_folio: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          ambito_secuencial: Database["public"]["Enums"]["ambito_secuencial"]
          creada_en: string
          iniciada_en: string | null
          organization_id: string
          plantilla: string
          prefijo_fijo: string | null
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          ambito_secuencial?: Database["public"]["Enums"]["ambito_secuencial"]
          creada_en?: string
          iniciada_en?: string | null
          organization_id: string
          plantilla?: string
          prefijo_fijo?: string | null
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          ambito_secuencial?: Database["public"]["Enums"]["ambito_secuencial"]
          creada_en?: string
          iniciada_en?: string | null
          organization_id?: string
          plantilla?: string
          prefijo_fijo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_folio_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      country_risk_list: {
        Row: {
          fuente: Database["public"]["Enums"]["fuente_lista"]
          id: string
          iso2: string
          nivel: number
          nombre: string
          notas: string | null
          organization_id: string
          plenario: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          fuente: Database["public"]["Enums"]["fuente_lista"]
          id?: string
          iso2: string
          nivel: number
          nombre: string
          notas?: string | null
          organization_id: string
          plenario?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          fuente?: Database["public"]["Enums"]["fuente_lista"]
          id?: string
          iso2?: string
          nivel?: number
          nombre?: string
          notas?: string | null
          organization_id?: string
          plenario?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "country_risk_list_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_risk_list: {
        Row: {
          entidad: string
          fuente: Database["public"]["Enums"]["fuente_lista"]
          id: string
          nivel: number
          notas: string | null
          organization_id: string
        }
        Insert: {
          entidad: string
          fuente: Database["public"]["Enums"]["fuente_lista"]
          id?: string
          nivel: number
          notas?: string | null
          organization_id: string
        }
        Update: {
          entidad?: string
          fuente?: Database["public"]["Enums"]["fuente_lista"]
          id?: string
          nivel?: number
          notas?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_risk_list_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      evento_auditoria: {
        Row: {
          actor_id: string | null
          actor_tipo: string
          cadena_hash: string
          entidad: string
          entidad_id: string | null
          evento_hash: string
          hash_anterior: string
          id: string
          nonce: string
          organization_id: string
          payload: Json | null
          payload_canonico: string
          registrado_en: string
          secuencia: number
          tipo: string
          versiones: Json
        }
        Insert: {
          actor_id?: string | null
          actor_tipo: string
          cadena_hash: string
          entidad: string
          entidad_id?: string | null
          evento_hash: string
          hash_anterior: string
          id?: string
          nonce: string
          organization_id: string
          payload?: Json | null
          payload_canonico: string
          registrado_en?: string
          secuencia: number
          tipo: string
          versiones?: Json
        }
        Update: {
          actor_id?: string | null
          actor_tipo?: string
          cadena_hash?: string
          entidad?: string
          entidad_id?: string | null
          evento_hash?: string
          hash_anterior?: string
          id?: string
          nonce?: string
          organization_id?: string
          payload?: Json | null
          payload_canonico?: string
          registrado_en?: string
          secuencia?: number
          tipo?: string
          versiones?: Json
        }
        Relationships: []
      }
      folio_secuencial: {
        Row: {
          clave: string
          organization_id: string
          valor: number
        }
        Insert: {
          clave: string
          organization_id: string
          valor?: number
        }
        Update: {
          clave?: string
          organization_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "folio_secuencial_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hallazgo: {
        Row: {
          asignado_a: string | null
          aviso_id: string | null
          clasificacion_urgencia: Database["public"]["Enums"]["clasificacion_urgencia"]
          client_id: string | null
          compromiso_fijado_en: string | null
          compromiso_fijado_por: string | null
          creado_en: string
          estado: Database["public"]["Enums"]["estado_hallazgo"]
          fecha_compromiso: string | null
          folio: string | null
          id: string
          operation_id: string | null
          organization_id: string
          plan_trabajo: string | null
          regla_payload: Json
          resolucion: string | null
          resuelto_en: string | null
          resuelto_por: string | null
          severidad: Database["public"]["Enums"]["severidad_tipologia"]
          tipologia_codigo: string
          tipologia_id: string
          tipologia_nombre: string
          tipologia_version: number
        }
        Insert: {
          asignado_a?: string | null
          aviso_id?: string | null
          clasificacion_urgencia: Database["public"]["Enums"]["clasificacion_urgencia"]
          client_id?: string | null
          compromiso_fijado_en?: string | null
          compromiso_fijado_por?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_hallazgo"]
          fecha_compromiso?: string | null
          folio?: string | null
          id?: string
          operation_id?: string | null
          organization_id: string
          plan_trabajo?: string | null
          regla_payload: Json
          resolucion?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          severidad: Database["public"]["Enums"]["severidad_tipologia"]
          tipologia_codigo: string
          tipologia_id: string
          tipologia_nombre: string
          tipologia_version: number
        }
        Update: {
          asignado_a?: string | null
          aviso_id?: string | null
          clasificacion_urgencia?: Database["public"]["Enums"]["clasificacion_urgencia"]
          client_id?: string | null
          compromiso_fijado_en?: string | null
          compromiso_fijado_por?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_hallazgo"]
          fecha_compromiso?: string | null
          folio?: string | null
          id?: string
          operation_id?: string | null
          organization_id?: string
          plan_trabajo?: string | null
          regla_payload?: Json
          resolucion?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          severidad?: Database["public"]["Enums"]["severidad_tipologia"]
          tipologia_codigo?: string
          tipologia_id?: string
          tipologia_nombre?: string
          tipologia_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hallazgo_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "v_revision_total_auditoria"
            referencedColumns: ["operation_id"]
          },
          {
            foreignKeyName: "hallazgo_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_tipologia_id_fkey"
            columns: ["tipologia_id"]
            isOneToOne: false
            referencedRelation: "tipologia_av"
            referencedColumns: ["id"]
          },
        ]
      }
      hallazgo_bitacora: {
        Row: {
          creado_en: string
          descripcion: string
          estado_anterior: Database["public"]["Enums"]["estado_hallazgo"] | null
          estado_nuevo: Database["public"]["Enums"]["estado_hallazgo"] | null
          hallazgo_id: string
          id: string
          organization_id: string
          tipo: Database["public"]["Enums"]["tipo_bitacora_hallazgo"]
          usuario: string | null
        }
        Insert: {
          creado_en?: string
          descripcion: string
          estado_anterior?:
            | Database["public"]["Enums"]["estado_hallazgo"]
            | null
          estado_nuevo?: Database["public"]["Enums"]["estado_hallazgo"] | null
          hallazgo_id: string
          id?: string
          organization_id: string
          tipo: Database["public"]["Enums"]["tipo_bitacora_hallazgo"]
          usuario?: string | null
        }
        Update: {
          creado_en?: string
          descripcion?: string
          estado_anterior?:
            | Database["public"]["Enums"]["estado_hallazgo"]
            | null
          estado_nuevo?: Database["public"]["Enums"]["estado_hallazgo"] | null
          hallazgo_id?: string
          id?: string
          organization_id?: string
          tipo?: Database["public"]["Enums"]["tipo_bitacora_hallazgo"]
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hallazgo_bitacora_hallazgo_id_fkey"
            columns: ["hallazgo_id"]
            isOneToOne: false
            referencedRelation: "hallazgo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_bitacora_hallazgo_id_fkey"
            columns: ["hallazgo_id"]
            isOneToOne: false
            referencedRelation: "v_hallazgos_rezagados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_bitacora_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hallazgo_documento: {
        Row: {
          hallazgo_id: string
          id: string
          mime_type: string | null
          nombre_archivo: string
          organization_id: string
          storage_path: string
          subido_en: string
          subido_por: string | null
          tamano_bytes: number | null
        }
        Insert: {
          hallazgo_id: string
          id?: string
          mime_type?: string | null
          nombre_archivo: string
          organization_id: string
          storage_path: string
          subido_en?: string
          subido_por?: string | null
          tamano_bytes?: number | null
        }
        Update: {
          hallazgo_id?: string
          id?: string
          mime_type?: string | null
          nombre_archivo?: string
          organization_id?: string
          storage_path?: string
          subido_en?: string
          subido_por?: string | null
          tamano_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hallazgo_documento_hallazgo_id_fkey"
            columns: ["hallazgo_id"]
            isOneToOne: false
            referencedRelation: "hallazgo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_documento_hallazgo_id_fkey"
            columns: ["hallazgo_id"]
            isOneToOne: false
            referencedRelation: "v_hallazgos_rezagados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_documento_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jurisdiccion_atencion: {
        Row: {
          derivacion: string
          firmada_por: string | null
          iso2: string
          nombre: string
          revisar_en: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          derivacion: string
          firmada_por?: string | null
          iso2: string
          nombre: string
          revisar_en?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          derivacion?: string
          firmada_por?: string | null
          iso2?: string
          nombre?: string
          revisar_en?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: []
      }
      lista_carga: {
        Row: {
          alcance: Database["public"]["Enums"]["alcance_carga_lista"]
          aprobada_en: string | null
          aprobada_por: string | null
          archivo_hash: string | null
          archivo_nombre: string | null
          archivo_path: string | null
          cargada_en: string
          cargada_por: string | null
          estado: Database["public"]["Enums"]["estado_carga_lista"]
          fecha_publicacion_fuente: string | null
          fuente_id: string
          id: string
          notas: string | null
          num_movimientos: number
          registros_desactivados: number
          tipo: Database["public"]["Enums"]["tipo_carga_lista"]
        }
        Insert: {
          alcance?: Database["public"]["Enums"]["alcance_carga_lista"]
          aprobada_en?: string | null
          aprobada_por?: string | null
          archivo_hash?: string | null
          archivo_nombre?: string | null
          archivo_path?: string | null
          cargada_en?: string
          cargada_por?: string | null
          estado?: Database["public"]["Enums"]["estado_carga_lista"]
          fecha_publicacion_fuente?: string | null
          fuente_id: string
          id?: string
          notas?: string | null
          num_movimientos?: number
          registros_desactivados?: number
          tipo: Database["public"]["Enums"]["tipo_carga_lista"]
        }
        Update: {
          alcance?: Database["public"]["Enums"]["alcance_carga_lista"]
          aprobada_en?: string | null
          aprobada_por?: string | null
          archivo_hash?: string | null
          archivo_nombre?: string | null
          archivo_path?: string | null
          cargada_en?: string
          cargada_por?: string | null
          estado?: Database["public"]["Enums"]["estado_carga_lista"]
          fecha_publicacion_fuente?: string | null
          fuente_id?: string
          id?: string
          notas?: string | null
          num_movimientos?: number
          registros_desactivados?: number
          tipo?: Database["public"]["Enums"]["tipo_carga_lista"]
        }
        Relationships: [
          {
            foreignKeyName: "lista_carga_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "lista_fuente"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_carga_fila: {
        Row: {
          carga_id: string
          curp: string | null
          fila_origen: number | null
          id: string
          identificadores: Json
          nombre: string
          pais: string | null
          rfc: string | null
          situacion: string | null
          tipo_entidad: string
        }
        Insert: {
          carga_id: string
          curp?: string | null
          fila_origen?: number | null
          id?: string
          identificadores?: Json
          nombre: string
          pais?: string | null
          rfc?: string | null
          situacion?: string | null
          tipo_entidad?: string
        }
        Update: {
          carga_id?: string
          curp?: string | null
          fila_origen?: number | null
          id?: string
          identificadores?: Json
          nombre?: string
          pais?: string | null
          rfc?: string | null
          situacion?: string | null
          tipo_entidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "lista_carga_fila_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "lista_carga"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_fuente: {
        Row: {
          activa: boolean
          autoridad: string
          codigo: string
          creado_en: string
          frecuencia_objetivo: string | null
          id: string
          modo_actualizacion: Database["public"]["Enums"]["modo_actualizacion_lista"]
          naturaleza: Database["public"]["Enums"]["naturaleza_lista"]
          nombre: string
          notas: string | null
          obligatoria: boolean
          situaciones: string[] | null
          situaciones_bloqueantes: string[] | null
          url_oficial: string | null
        }
        Insert: {
          activa?: boolean
          autoridad: string
          codigo: string
          creado_en?: string
          frecuencia_objetivo?: string | null
          id?: string
          modo_actualizacion: Database["public"]["Enums"]["modo_actualizacion_lista"]
          naturaleza: Database["public"]["Enums"]["naturaleza_lista"]
          nombre: string
          notas?: string | null
          obligatoria?: boolean
          situaciones?: string[] | null
          situaciones_bloqueantes?: string[] | null
          url_oficial?: string | null
        }
        Update: {
          activa?: boolean
          autoridad?: string
          codigo?: string
          creado_en?: string
          frecuencia_objetivo?: string | null
          id?: string
          modo_actualizacion?: Database["public"]["Enums"]["modo_actualizacion_lista"]
          naturaleza?: Database["public"]["Enums"]["naturaleza_lista"]
          nombre?: string
          notas?: string | null
          obligatoria?: boolean
          situaciones?: string[] | null
          situaciones_bloqueantes?: string[] | null
          url_oficial?: string | null
        }
        Relationships: []
      }
      lista_job_ejecucion: {
        Row: {
          archivo_hash: string | null
          atendido_en: string | null
          atendido_por: string | null
          carga_id: string | null
          detalle: Json
          error_mensaje: string | null
          filas_descartadas: number | null
          fuente_id: string
          id: string
          iniciado_en: string
          registros_leidos: number | null
          resultado: Database["public"]["Enums"]["resultado_job_lista"] | null
          terminado_en: string | null
        }
        Insert: {
          archivo_hash?: string | null
          atendido_en?: string | null
          atendido_por?: string | null
          carga_id?: string | null
          detalle?: Json
          error_mensaje?: string | null
          filas_descartadas?: number | null
          fuente_id: string
          id?: string
          iniciado_en?: string
          registros_leidos?: number | null
          resultado?: Database["public"]["Enums"]["resultado_job_lista"] | null
          terminado_en?: string | null
        }
        Update: {
          archivo_hash?: string | null
          atendido_en?: string | null
          atendido_por?: string | null
          carga_id?: string | null
          detalle?: Json
          error_mensaje?: string | null
          filas_descartadas?: number | null
          fuente_id?: string
          id?: string
          iniciado_en?: string
          registros_leidos?: number | null
          resultado?: Database["public"]["Enums"]["resultado_job_lista"] | null
          terminado_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lista_job_ejecucion_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "lista_carga"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_job_ejecucion_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "lista_fuente"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_movimiento: {
        Row: {
          accion: Database["public"]["Enums"]["accion_movimiento_lista"]
          aplicado_en: string
          carga_id: string
          curp: string | null
          id: string
          identificadores: Json
          motivo: string | null
          nombre: string
          oficio_fecha: string | null
          oficio_numero: string | null
          pais: string | null
          registro_id: string | null
          rfc: string | null
          situacion: string | null
          tipo_entidad: string
        }
        Insert: {
          accion: Database["public"]["Enums"]["accion_movimiento_lista"]
          aplicado_en?: string
          carga_id: string
          curp?: string | null
          id?: string
          identificadores?: Json
          motivo?: string | null
          nombre: string
          oficio_fecha?: string | null
          oficio_numero?: string | null
          pais?: string | null
          registro_id?: string | null
          rfc?: string | null
          situacion?: string | null
          tipo_entidad?: string
        }
        Update: {
          accion?: Database["public"]["Enums"]["accion_movimiento_lista"]
          aplicado_en?: string
          carga_id?: string
          curp?: string | null
          id?: string
          identificadores?: Json
          motivo?: string | null
          nombre?: string
          oficio_fecha?: string | null
          oficio_numero?: string | null
          pais?: string | null
          registro_id?: string | null
          rfc?: string | null
          situacion?: string | null
          tipo_entidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "lista_movimiento_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "lista_carga"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_registro: {
        Row: {
          activo: boolean
          actualizado_en: string
          alta_fecha: string | null
          alta_oficio: string | null
          baja_fecha: string | null
          baja_oficio: string | null
          curp: string | null
          fuente_id: string
          id: string
          identificadores: Json
          nombre: string
          nombre_normalizado: string | null
          nombres_alternos: string[]
          pais: string | null
          raw_payload: Json | null
          rfc: string | null
          situacion: string | null
          tipo_entidad: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          alta_fecha?: string | null
          alta_oficio?: string | null
          baja_fecha?: string | null
          baja_oficio?: string | null
          curp?: string | null
          fuente_id: string
          id?: string
          identificadores?: Json
          nombre: string
          nombre_normalizado?: string | null
          nombres_alternos?: string[]
          pais?: string | null
          raw_payload?: Json | null
          rfc?: string | null
          situacion?: string | null
          tipo_entidad?: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          alta_fecha?: string | null
          alta_oficio?: string | null
          baja_fecha?: string | null
          baja_oficio?: string | null
          curp?: string | null
          fuente_id?: string
          id?: string
          identificadores?: Json
          nombre?: string
          nombre_normalizado?: string | null
          nombres_alternos?: string[]
          pais?: string | null
          raw_payload?: Json | null
          rfc?: string | null
          situacion?: string | null
          tipo_entidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "lista_registro_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "lista_fuente"
            referencedColumns: ["id"]
          },
        ]
      }
      motor_run: {
        Row: {
          duracion_ms: number | null
          hallazgos_creados: number
          id: string
          metadata: Json | null
          operaciones_procesadas: number
          organization_id: string
          trigger_tipo: string
          triggered_by: string | null
          ts: string
        }
        Insert: {
          duracion_ms?: number | null
          hallazgos_creados?: number
          id?: string
          metadata?: Json | null
          operaciones_procesadas?: number
          organization_id: string
          trigger_tipo: string
          triggered_by?: string | null
          ts?: string
        }
        Update: {
          duracion_ms?: number | null
          hallazgos_creados?: number
          id?: string
          metadata?: Json | null
          operaciones_procesadas?: number
          organization_id?: string
          trigger_tipo?: string
          triggered_by?: string | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "motor_run_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation: {
        Row: {
          activo_virtual: string | null
          aprobacion_relacion_id: string | null
          aprobada_en: string | null
          aprobada_por: string | null
          aprobada_rol_activo: Database["public"]["Enums"]["rol_usuario"] | null
          autoaprobacion: boolean
          calidad_aprobacion:
            | Database["public"]["Enums"]["calidad_aprobacion"]
            | null
          capturado_en: string
          capturado_por: string | null
          client_id: string
          contraparte: Json | null
          contraprestacion_mxn: number | null
          cuenta_ordenante: string | null
          datos_acto: Json
          efectivo_mxn: number | null
          entidad_federativa_inmueble: string | null
          evaluada_en: string | null
          fecha: string
          fecha_pago: string | null
          forma_pago: string | null
          id: string
          identificada_en: string | null
          institucion_financiera: string | null
          instrumento_publico: string | null
          moneda_origen: string
          monto_mxn: number
          motor_version_aplicada: number | null
          municipio_inmueble: string | null
          organization_id: string
          pago_de_tercero: boolean | null
          pais_origen_recursos: string | null
          requiere_aviso: boolean
          subdivision_inmueble: string | null
          tipo: Database["public"]["Enums"]["tipo_operacion"]
        }
        Insert: {
          activo_virtual?: string | null
          aprobacion_relacion_id?: string | null
          aprobada_en?: string | null
          aprobada_por?: string | null
          aprobada_rol_activo?:
            | Database["public"]["Enums"]["rol_usuario"]
            | null
          autoaprobacion?: boolean
          calidad_aprobacion?:
            | Database["public"]["Enums"]["calidad_aprobacion"]
            | null
          capturado_en?: string
          capturado_por?: string | null
          client_id: string
          contraparte?: Json | null
          contraprestacion_mxn?: number | null
          cuenta_ordenante?: string | null
          datos_acto?: Json
          efectivo_mxn?: number | null
          entidad_federativa_inmueble?: string | null
          evaluada_en?: string | null
          fecha?: string
          fecha_pago?: string | null
          forma_pago?: string | null
          id?: string
          identificada_en?: string | null
          institucion_financiera?: string | null
          instrumento_publico?: string | null
          moneda_origen?: string
          monto_mxn: number
          motor_version_aplicada?: number | null
          municipio_inmueble?: string | null
          organization_id: string
          pago_de_tercero?: boolean | null
          pais_origen_recursos?: string | null
          requiere_aviso?: boolean
          subdivision_inmueble?: string | null
          tipo: Database["public"]["Enums"]["tipo_operacion"]
        }
        Update: {
          activo_virtual?: string | null
          aprobacion_relacion_id?: string | null
          aprobada_en?: string | null
          aprobada_por?: string | null
          aprobada_rol_activo?:
            | Database["public"]["Enums"]["rol_usuario"]
            | null
          autoaprobacion?: boolean
          calidad_aprobacion?:
            | Database["public"]["Enums"]["calidad_aprobacion"]
            | null
          capturado_en?: string
          capturado_por?: string | null
          client_id?: string
          contraparte?: Json | null
          contraprestacion_mxn?: number | null
          cuenta_ordenante?: string | null
          datos_acto?: Json
          efectivo_mxn?: number | null
          entidad_federativa_inmueble?: string | null
          evaluada_en?: string | null
          fecha?: string
          fecha_pago?: string | null
          forma_pago?: string | null
          id?: string
          identificada_en?: string | null
          institucion_financiera?: string | null
          instrumento_publico?: string | null
          moneda_origen?: string
          monto_mxn?: number
          motor_version_aplicada?: number | null
          municipio_inmueble?: string | null
          organization_id?: string
          pago_de_tercero?: boolean | null
          pais_origen_recursos?: string | null
          requiere_aviso?: boolean
          subdivision_inmueble?: string | null
          tipo?: Database["public"]["Enums"]["tipo_operacion"]
        }
        Relationships: [
          {
            foreignKeyName: "operation_aprobacion_relacion_id_fkey"
            columns: ["aprobacion_relacion_id"]
            isOneToOne: false
            referencedRelation: "cliente_aprobacion_relacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          clave_actividad: string | null
          clave_entidad_colegiada: string | null
          clave_sujeto_obligado: string | null
          creada_en: string
          creada_por: string | null
          domicilio_fiscal: string | null
          es_demostracion: boolean
          es_referencia: boolean
          fecha_alta_sat: string | null
          id: string
          oc_designado_en: string | null
          oc_encargado_user_id: string | null
          oc_es_titular: boolean
          oficio_alta_sat: string | null
          perfil_actividad: string | null
          razon_social: string
          representante_legal: string | null
          rfc: string
          sectores: Database["public"]["Enums"]["sector_av"][]
        }
        Insert: {
          clave_actividad?: string | null
          clave_entidad_colegiada?: string | null
          clave_sujeto_obligado?: string | null
          creada_en?: string
          creada_por?: string | null
          domicilio_fiscal?: string | null
          es_demostracion?: boolean
          es_referencia?: boolean
          fecha_alta_sat?: string | null
          id?: string
          oc_designado_en?: string | null
          oc_encargado_user_id?: string | null
          oc_es_titular?: boolean
          oficio_alta_sat?: string | null
          perfil_actividad?: string | null
          razon_social: string
          representante_legal?: string | null
          rfc: string
          sectores?: Database["public"]["Enums"]["sector_av"][]
        }
        Update: {
          clave_actividad?: string | null
          clave_entidad_colegiada?: string | null
          clave_sujeto_obligado?: string | null
          creada_en?: string
          creada_por?: string | null
          domicilio_fiscal?: string | null
          es_demostracion?: boolean
          es_referencia?: boolean
          fecha_alta_sat?: string | null
          id?: string
          oc_designado_en?: string | null
          oc_encargado_user_id?: string | null
          oc_es_titular?: boolean
          oficio_alta_sat?: string | null
          perfil_actividad?: string | null
          razon_social?: string
          representante_legal?: string | null
          rfc?: string
          sectores?: Database["public"]["Enums"]["sector_av"][]
        }
        Relationships: []
      }
      parametro_regulatorio: {
        Row: {
          codigo: string
          confirmado_en: string | null
          confirmado_por: string | null
          creado_en: string
          creado_por: string | null
          fuente: string
          id: string
          nombre: string
          notas: string | null
          publicacion_dof: string | null
          sector: string
          unidad: string
          url_fuente: string | null
          valor_numerico: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          codigo: string
          confirmado_en?: string | null
          confirmado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          fuente: string
          id?: string
          nombre: string
          notas?: string | null
          publicacion_dof?: string | null
          sector?: string
          unidad: string
          url_fuente?: string | null
          valor_numerico: number
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          codigo?: string
          confirmado_en?: string | null
          confirmado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          fuente?: string
          id?: string
          nombre?: string
          notas?: string | null
          publicacion_dof?: string | null
          sector?: string
          unidad?: string
          url_fuente?: string | null
          valor_numerico?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: []
      }
      pais_exige_subdivision: {
        Row: {
          motivo: string
          pais_iso2: string
        }
        Insert: {
          motivo: string
          pais_iso2: string
        }
        Update: {
          motivo?: string
          pais_iso2?: string
        }
        Relationships: []
      }
      pending_approvals: {
        Row: {
          estado: Database["public"]["Enums"]["estado_aprobacion"]
          id: string
          motivo: string | null
          organization_id: string
          payload: Json
          recurso_id: string | null
          resuelto_en: string | null
          resuelto_por: string | null
          solicitado_en: string
          solicitado_por: string
          tipo_recurso: string
        }
        Insert: {
          estado?: Database["public"]["Enums"]["estado_aprobacion"]
          id?: string
          motivo?: string | null
          organization_id: string
          payload: Json
          recurso_id?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          solicitado_en?: string
          solicitado_por: string
          tipo_recurso: string
        }
        Update: {
          estado?: Database["public"]["Enums"]["estado_aprobacion"]
          id?: string
          motivo?: string | null
          organization_id?: string
          payload?: Json
          recurso_id?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          solicitado_en?: string
          solicitado_por?: string
          tipo_recurso?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admin: {
        Row: {
          nombre: string
          otorgado_en: string
          otorgado_por: string | null
          user_id: string
        }
        Insert: {
          nombre: string
          otorgado_en?: string
          otorgado_por?: string | null
          user_id: string
        }
        Update: {
          nombre?: string
          otorgado_en?: string
          otorgado_por?: string | null
          user_id?: string
        }
        Relationships: []
      }
      prospect_intake: {
        Row: {
          actividad_vulnerable: string[]
          ciudad: string | null
          clientes_activos: number | null
          consentimiento_contacto: boolean
          consentimiento_privacidad: boolean
          contacto_cargo: string | null
          contacto_email: string
          contacto_nombre: string
          contacto_telefono: string | null
          created_at: string | null
          estado_operacion: string | null
          estado_republica: string | null
          extra_fedatario: Json | null
          id: string
          notas: string | null
          origen: string | null
          razon_social: string
          regimen_fiscal: string | null
          registrado_sppld: boolean | null
          rfc: string
          status: string | null
          tiene_manual_pld: boolean | null
          tiene_oc_designado: boolean | null
          updated_at: string
          volumen_ops_mes: number | null
        }
        Insert: {
          actividad_vulnerable: string[]
          ciudad?: string | null
          clientes_activos?: number | null
          consentimiento_contacto: boolean
          consentimiento_privacidad: boolean
          contacto_cargo?: string | null
          contacto_email: string
          contacto_nombre: string
          contacto_telefono?: string | null
          created_at?: string | null
          estado_operacion?: string | null
          estado_republica?: string | null
          extra_fedatario?: Json | null
          id?: string
          notas?: string | null
          origen?: string | null
          razon_social: string
          regimen_fiscal?: string | null
          registrado_sppld?: boolean | null
          rfc: string
          status?: string | null
          tiene_manual_pld?: boolean | null
          tiene_oc_designado?: boolean | null
          updated_at?: string
          volumen_ops_mes?: number | null
        }
        Update: {
          actividad_vulnerable?: string[]
          ciudad?: string | null
          clientes_activos?: number | null
          consentimiento_contacto?: boolean
          consentimiento_privacidad?: boolean
          contacto_cargo?: string | null
          contacto_email?: string
          contacto_nombre?: string
          contacto_telefono?: string | null
          created_at?: string | null
          estado_operacion?: string | null
          estado_republica?: string | null
          extra_fedatario?: Json | null
          id?: string
          notas?: string | null
          origen?: string | null
          razon_social?: string
          regimen_fiscal?: string | null
          registrado_sppld?: boolean | null
          rfc?: string
          status?: string | null
          tiene_manual_pld?: boolean | null
          tiene_oc_designado?: boolean | null
          updated_at?: string
          volumen_ops_mes?: number | null
        }
        Relationships: []
      }
      regimen_pais: {
        Row: {
          derivacion: string | null
          iso2: string
          nivel_territorial: string | null
          nota: string | null
          regimen_id: string
        }
        Insert: {
          derivacion?: string | null
          iso2: string
          nivel_territorial?: string | null
          nota?: string | null
          regimen_id: string
        }
        Update: {
          derivacion?: string | null
          iso2?: string
          nivel_territorial?: string | null
          nota?: string | null
          regimen_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regimen_pais_regimen_id_fkey"
            columns: ["regimen_id"]
            isOneToOne: false
            referencedRelation: "regimen_sancion"
            referencedColumns: ["id"]
          },
        ]
      }
      regimen_sancion: {
        Row: {
          actualizado_fuente: string | null
          autoridad: string
          clase: string
          clave: string
          id: string
          leido_en: string
          nivel_territorial: string | null
          nombre: string
          notas: string | null
          vigente: boolean
        }
        Insert: {
          actualizado_fuente?: string | null
          autoridad: string
          clase: string
          clave: string
          id?: string
          leido_en: string
          nivel_territorial?: string | null
          nombre: string
          notas?: string | null
          vigente?: boolean
        }
        Update: {
          actualizado_fuente?: string | null
          autoridad?: string
          clase?: string
          clave?: string
          id?: string
          leido_en?: string
          nivel_territorial?: string | null
          nombre?: string
          notas?: string | null
          vigente?: boolean
        }
        Relationships: []
      }
      risk_element: {
        Row: {
          codigo: string
          id: string
          impacto_pct: number
          methodology_id: string
          nombre: string
          orden: number
          peso: number
        }
        Insert: {
          codigo: string
          id?: string
          impacto_pct: number
          methodology_id: string
          nombre: string
          orden?: number
          peso: number
        }
        Update: {
          codigo?: string
          id?: string
          impacto_pct?: number
          methodology_id?: string
          nombre?: string
          orden?: number
          peso?: number
        }
        Relationships: [
          {
            foreignKeyName: "risk_element_methodology_id_fkey"
            columns: ["methodology_id"]
            isOneToOne: false
            referencedRelation: "risk_methodology"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_indicator: {
        Row: {
          codigo: string
          element_id: string
          id: string
          indicador: string
          nivel_inherente: number
          orden: number
          peso: number
          variable: string
        }
        Insert: {
          codigo: string
          element_id: string
          id?: string
          indicador: string
          nivel_inherente: number
          orden?: number
          peso: number
          variable: string
        }
        Update: {
          codigo?: string
          element_id?: string
          id?: string
          indicador?: string
          nivel_inherente?: number
          orden?: number
          peso?: number
          variable?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_indicator_element_id_fkey"
            columns: ["element_id"]
            isOneToOne: false
            referencedRelation: "risk_element"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_methodology: {
        Row: {
          activa_desde: string
          activa_hasta: string | null
          apetito_riesgo: Database["public"]["Enums"]["clasificacion_riesgo"]
          creada_en: string
          creada_por: string | null
          frecuencia_revision: string
          id: string
          notas: string | null
          organization_id: string
          sector: Database["public"]["Enums"]["sector_av"]
          version: number
        }
        Insert: {
          activa_desde?: string
          activa_hasta?: string | null
          apetito_riesgo?: Database["public"]["Enums"]["clasificacion_riesgo"]
          creada_en?: string
          creada_por?: string | null
          frecuencia_revision?: string
          id?: string
          notas?: string | null
          organization_id: string
          sector: Database["public"]["Enums"]["sector_av"]
          version?: number
        }
        Update: {
          activa_desde?: string
          activa_hasta?: string | null
          apetito_riesgo?: Database["public"]["Enums"]["clasificacion_riesgo"]
          creada_en?: string
          creada_por?: string | null
          frecuencia_revision?: string
          id?: string
          notas?: string | null
          organization_id?: string
          sector?: Database["public"]["Enums"]["sector_av"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "risk_methodology_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_mitigant: {
        Row: {
          descripcion: string
          factor: number
          id: string
          indicator_id: string
        }
        Insert: {
          descripcion: string
          factor: number
          id?: string
          indicator_id: string
        }
        Update: {
          descripcion?: string
          factor?: number
          id?: string
          indicator_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_mitigant_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "risk_indicator"
            referencedColumns: ["id"]
          },
        ]
      }
      sanctions_list_entry: {
        Row: {
          agregado_en: string
          fuente: Database["public"]["Enums"]["fuente_lista"]
          id: string
          identificador: string
          metadata: Json | null
          organization_id: string
          tipo_entidad: string
        }
        Insert: {
          agregado_en?: string
          fuente: Database["public"]["Enums"]["fuente_lista"]
          id?: string
          identificador: string
          metadata?: Json | null
          organization_id: string
          tipo_entidad: string
        }
        Update: {
          agregado_en?: string
          fuente?: Database["public"]["Enums"]["fuente_lista"]
          id?: string
          identificador?: string
          metadata?: Json | null
          organization_id?: string
          tipo_entidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "sanctions_list_entry_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      socio: {
        Row: {
          acciones: number | null
          capturado_en: string
          capturado_por: string | null
          cargo: string | null
          client_id: string
          id: string
          nombre_razon_social: string
          organization_id: string
          porcentaje_titularidad: number | null
          porcentaje_voto: number | null
          socio_client_id: string | null
          tipo_persona: Database["public"]["Enums"]["tipo_persona"]
        }
        Insert: {
          acciones?: number | null
          capturado_en?: string
          capturado_por?: string | null
          cargo?: string | null
          client_id: string
          id?: string
          nombre_razon_social: string
          organization_id: string
          porcentaje_titularidad?: number | null
          porcentaje_voto?: number | null
          socio_client_id?: string | null
          tipo_persona: Database["public"]["Enums"]["tipo_persona"]
        }
        Update: {
          acciones?: number | null
          capturado_en?: string
          capturado_por?: string | null
          cargo?: string | null
          client_id?: string
          id?: string
          nombre_razon_social?: string
          organization_id?: string
          porcentaje_titularidad?: number | null
          porcentaje_voto?: number | null
          socio_client_id?: string | null
          tipo_persona?: Database["public"]["Enums"]["tipo_persona"]
        }
        Relationships: [
          {
            foreignKeyName: "socio_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "socio_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "socio_socio_client_id_fkey"
            columns: ["socio_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      subdivision_riesgo: {
        Row: {
          clave: string
          derivacion: string
          nivel_territorial: string
          nombre: string
          pais_iso2: string
          pendiente_confirmacion: boolean
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          clave: string
          derivacion: string
          nivel_territorial: string
          nombre: string
          pais_iso2: string
          pendiente_confirmacion?: boolean
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          clave?: string
          derivacion?: string
          nivel_territorial?: string
          nombre?: string
          pais_iso2?: string
          pendiente_confirmacion?: boolean
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: []
      }
      tipo_social: {
        Row: {
          clave: string
          fundamento: string
          nombre: string
          socios_maximo: number | null
          socios_minimo: number
          solo_personas_fisicas: boolean
          vigente: boolean
        }
        Insert: {
          clave: string
          fundamento: string
          nombre: string
          socios_maximo?: number | null
          socios_minimo: number
          solo_personas_fisicas?: boolean
          vigente?: boolean
        }
        Update: {
          clave?: string
          fundamento?: string
          nombre?: string
          socios_maximo?: number | null
          socios_minimo?: number
          solo_personas_fisicas?: boolean
          vigente?: boolean
        }
        Relationships: []
      }
      tipologia_av: {
        Row: {
          activa: boolean
          aprobada_por_oc: string | null
          aprobada_por_oc_en: string | null
          codigo: string
          creada_en: string
          descripcion: string
          fuente: string | null
          genera_aviso: boolean
          id: string
          nombre: string
          organization_id: string
          regla_dsl: Json
          sector: Database["public"]["Enums"]["sector_av"]
          severidad: Database["public"]["Enums"]["severidad_tipologia"]
          version: number
        }
        Insert: {
          activa?: boolean
          aprobada_por_oc?: string | null
          aprobada_por_oc_en?: string | null
          codigo: string
          creada_en?: string
          descripcion: string
          fuente?: string | null
          genera_aviso?: boolean
          id?: string
          nombre: string
          organization_id: string
          regla_dsl: Json
          sector: Database["public"]["Enums"]["sector_av"]
          severidad: Database["public"]["Enums"]["severidad_tipologia"]
          version?: number
        }
        Update: {
          activa?: boolean
          aprobada_por_oc?: string | null
          aprobada_por_oc_en?: string | null
          codigo?: string
          creada_en?: string
          descripcion?: string
          fuente?: string | null
          genera_aviso?: boolean
          id?: string
          nombre?: string
          organization_id?: string
          regla_dsl?: Json
          sector?: Database["public"]["Enums"]["sector_av"]
          severidad?: Database["public"]["Enums"]["severidad_tipologia"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tipologia_av_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile: {
        Row: {
          activo: boolean
          creado_en: string
          email: string
          id: string
          nombre: string
          organization_id: string
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          email: string
          id: string
          nombre: string
          organization_id: string
        }
        Update: {
          activo?: boolean
          creado_en?: string
          email?: string
          id?: string
          nombre?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profile_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          organization_id: string
          otorgado_en: string
          otorgado_por: string | null
          rol: Database["public"]["Enums"]["rol_usuario"]
          user_id: string
        }
        Insert: {
          id?: string
          organization_id: string
          otorgado_en?: string
          otorgado_por?: string | null
          rol: Database["public"]["Enums"]["rol_usuario"]
          user_id: string
        }
        Update: {
          id?: string
          organization_id?: string
          otorgado_en?: string
          otorgado_por?: string | null
          rol?: Database["public"]["Enums"]["rol_usuario"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_roles_simple"
            referencedColumns: ["user_id"]
          },
        ]
      }
      verificacion_identidad: {
        Row: {
          canal: string
          client_id: string
          didit_session_id: string
          didit_workflow_id: string | null
          enviado_a: string | null
          estado: Database["public"]["Enums"]["estado_verificacion"]
          id: string
          organization_id: string
          resuelta_en: string | null
          resumen: Json
          solicitada_en: string
          solicitada_por: string | null
          ultimo_evento_id: string | null
          url: string
        }
        Insert: {
          canal: string
          client_id: string
          didit_session_id: string
          didit_workflow_id?: string | null
          enviado_a?: string | null
          estado?: Database["public"]["Enums"]["estado_verificacion"]
          id?: string
          organization_id: string
          resuelta_en?: string | null
          resumen?: Json
          solicitada_en?: string
          solicitada_por?: string | null
          ultimo_evento_id?: string | null
          url: string
        }
        Update: {
          canal?: string
          client_id?: string
          didit_session_id?: string
          didit_workflow_id?: string | null
          enviado_a?: string | null
          estado?: Database["public"]["Enums"]["estado_verificacion"]
          id?: string
          organization_id?: string
          resuelta_en?: string | null
          resumen?: Json
          solicitada_en?: string
          solicitada_por?: string | null
          ultimo_evento_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "verificacion_identidad_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verificacion_identidad_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      zona_atencion: {
        Row: {
          cargada_en: string
          cargada_por: string | null
          entidad_clave: string
          fuente: string
          id: string
          motivo: string
          municipio: string | null
          nivel: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          cargada_en?: string
          cargada_por?: string | null
          entidad_clave: string
          fuente: string
          id?: string
          motivo: string
          municipio?: string | null
          nivel: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          cargada_en?: string
          cargada_por?: string | null
          entidad_clave?: string
          fuente?: string
          id?: string
          motivo?: string
          municipio?: string | null
          nivel?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_anclaje_estado: {
        Row: {
          anclado_en: string | null
          anclado_hasta: number | null
          bloque_btc: number | null
          estado: string | null
          eventos_sin_anclar: number | null
          fecha_bloque: string | null
          motivo: string | null
          organization_id: string | null
          raiz_merkle: string | null
          ultima_secuencia: number | null
          ultimo_anclaje_id: string | null
        }
        Relationships: []
      }
      v_catalogo_vigente: {
        Row: {
          catalogo: string | null
          catalogo_nombre: string | null
          clave: string | null
          descripcion: string | null
          orden: number | null
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Relationships: []
      }
      v_catalogos_estado: {
        Row: {
          actualizado_en: string | null
          clave_patron: string | null
          codigo: string | null
          etiquetas_layout: string[] | null
          layout: string | null
          nombre: string | null
          notas: string | null
          valores_vigentes: number | null
          version: number | null
        }
        Relationships: []
      }
      v_hallazgos_rezagados: {
        Row: {
          creado_en: string | null
          dias_abierto: number | null
          dias_sin_actividad: number | null
          estado: Database["public"]["Enums"]["estado_hallazgo"] | null
          fecha_compromiso: string | null
          folio: string | null
          id: string | null
          organization_id: string | null
          plan_trabajo: string | null
          severidad: Database["public"]["Enums"]["severidad_tipologia"] | null
          situacion: string | null
          tipologia_codigo: string | null
          tipologia_nombre: string | null
          ultima_actividad: string | null
        }
        Insert: {
          creado_en?: string | null
          dias_abierto?: never
          dias_sin_actividad?: never
          estado?: Database["public"]["Enums"]["estado_hallazgo"] | null
          fecha_compromiso?: string | null
          folio?: string | null
          id?: string | null
          organization_id?: string | null
          plan_trabajo?: string | null
          severidad?: Database["public"]["Enums"]["severidad_tipologia"] | null
          situacion?: never
          tipologia_codigo?: string | null
          tipologia_nombre?: string | null
          ultima_actividad?: never
        }
        Update: {
          creado_en?: string | null
          dias_abierto?: never
          dias_sin_actividad?: never
          estado?: Database["public"]["Enums"]["estado_hallazgo"] | null
          fecha_compromiso?: string | null
          folio?: string | null
          id?: string | null
          organization_id?: string | null
          plan_trabajo?: string | null
          severidad?: Database["public"]["Enums"]["severidad_tipologia"] | null
          situacion?: never
          tipologia_codigo?: string | null
          tipologia_nombre?: string | null
          ultima_actividad?: never
        }
        Relationships: [
          {
            foreignKeyName: "hallazgo_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_jurisdiccion_atencion: {
        Row: {
          derivacion: string | null
          iso2: string | null
          nombre: string | null
          origen: string | null
        }
        Relationships: []
      }
      v_listas_estado: {
        Row: {
          actualizada_al: string | null
          autoridad: string | null
          codigo: string | null
          modo_actualizacion:
            | Database["public"]["Enums"]["modo_actualizacion_lista"]
            | null
          naturaleza: Database["public"]["Enums"]["naturaleza_lista"] | null
          nombre: string | null
          obligatoria: boolean | null
          registros_bloqueantes: number | null
          registros_vigentes: number | null
          situaciones: string[] | null
          situaciones_bloqueantes: string[] | null
          url_oficial: string | null
        }
        Insert: {
          actualizada_al?: never
          autoridad?: string | null
          codigo?: string | null
          modo_actualizacion?:
            | Database["public"]["Enums"]["modo_actualizacion_lista"]
            | null
          naturaleza?: Database["public"]["Enums"]["naturaleza_lista"] | null
          nombre?: string | null
          obligatoria?: boolean | null
          registros_bloqueantes?: never
          registros_vigentes?: never
          situaciones?: string[] | null
          situaciones_bloqueantes?: string[] | null
          url_oficial?: string | null
        }
        Update: {
          actualizada_al?: never
          autoridad?: string | null
          codigo?: string | null
          modo_actualizacion?:
            | Database["public"]["Enums"]["modo_actualizacion_lista"]
            | null
          naturaleza?: Database["public"]["Enums"]["naturaleza_lista"] | null
          nombre?: string | null
          obligatoria?: boolean | null
          registros_bloqueantes?: never
          registros_vigentes?: never
          situaciones?: string[] | null
          situaciones_bloqueantes?: string[] | null
          url_oficial?: string | null
        }
        Relationships: []
      }
      v_listas_vigentes: {
        Row: {
          actualizado_en: string | null
          alta_fecha: string | null
          alta_oficio: string | null
          bloqueante: boolean | null
          curp: string | null
          fuente: string | null
          fuente_nombre: string | null
          identificadores: Json | null
          naturaleza: Database["public"]["Enums"]["naturaleza_lista"] | null
          nombre: string | null
          nombre_normalizado: string | null
          nombres_alternos: string[] | null
          pais: string | null
          registro_id: string | null
          rfc: string | null
          situacion: string | null
          tipo_entidad: string | null
        }
        Relationships: []
      }
      v_parametros_vigentes: {
        Row: {
          codigo: string | null
          confirmado_en: string | null
          confirmado_por: string | null
          fuente: string | null
          nombre: string | null
          notas: string | null
          publicacion_dof: string | null
          sector: string | null
          unidad: string | null
          url_fuente: string | null
          valor_numerico: number | null
          vigente_desde: string | null
        }
        Insert: {
          codigo?: string | null
          confirmado_en?: string | null
          confirmado_por?: string | null
          fuente?: string | null
          nombre?: string | null
          notas?: string | null
          publicacion_dof?: string | null
          sector?: string | null
          unidad?: string | null
          url_fuente?: string | null
          valor_numerico?: number | null
          vigente_desde?: string | null
        }
        Update: {
          codigo?: string | null
          confirmado_en?: string | null
          confirmado_por?: string | null
          fuente?: string | null
          nombre?: string | null
          notas?: string | null
          publicacion_dof?: string | null
          sector?: string | null
          unidad?: string | null
          url_fuente?: string | null
          valor_numerico?: number | null
          vigente_desde?: string | null
        }
        Relationships: []
      }
      v_prospectos_resumen: {
        Row: {
          cuantos: number | null
          mas_reciente: string | null
          status: string | null
        }
        Relationships: []
      }
      v_revision_total_auditoria: {
        Row: {
          aprobacion_relacion_id: string | null
          aprobada_en: string | null
          aprobada_por: string | null
          autoaprobacion: boolean | null
          calidad_aprobacion:
            | Database["public"]["Enums"]["calidad_aprobacion"]
            | null
          client_id: string | null
          nivel_kyc: Database["public"]["Enums"]["nivel_kyc"] | null
          operation_id: string | null
          organization_id: string | null
          relacion_vigencia_hasta: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_aprobacion_relacion_id_fkey"
            columns: ["aprobacion_relacion_id"]
            isOneToOne: false
            referencedRelation: "cliente_aprobacion_relacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_suficiencia_origen_recursos: {
        Row: {
          catalogo_origen_recurso_id: string | null
          client_id: string | null
          monto_a_cubrir: number | null
          monto_acreditado: number | null
          monto_declarado: number | null
          monto_suficiente: boolean | null
          operation_id: string | null
          origen_recursos_id: string | null
          otro_requiere_revision: boolean | null
          tiene_documento: boolean | null
          tiene_documento_tercero: boolean | null
          tiene_identificacion_rechazada: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_origen_recurso_catalogo_origen_recurso_id_fkey"
            columns: ["catalogo_origen_recurso_id"]
            isOneToOne: false
            referencedRelation: "catalogo_origen_recurso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_origen_recurso_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_origen_recurso_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_origen_recurso_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "v_revision_total_auditoria"
            referencedColumns: ["operation_id"]
          },
        ]
      }
      v_user_roles_simple: {
        Row: {
          email: string | null
          nombre: string | null
          organization_id: string | null
          roles: Database["public"]["Enums"]["rol_usuario"][] | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profile_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_verificacion_vigente: {
        Row: {
          canal: string | null
          client_id: string | null
          didit_session_id: string | null
          enviado_a: string | null
          estado: Database["public"]["Enums"]["estado_verificacion"] | null
          organization_id: string | null
          resuelta_en: string | null
          resumen: Json | null
          solicitada_en: string | null
          verificacion_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verificacion_identidad_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verificacion_identidad_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      bajar_nivel_diligencia: {
        Args: {
          p_client: string
          p_hacia: Database["public"]["Enums"]["nivel_kyc"]
          p_motivo: string
        }
        Returns: Database["public"]["Enums"]["nivel_kyc"]
      }
      bc_exento: { Args: { p_client: string }; Returns: boolean }
      calcular_autoaprobacion: {
        Args: {
          p_aprobador: string
          p_autor: string
          p_organization_id: string
        }
        Returns: boolean
      }
      cambiar_formato_folio: {
        Args: {
          p_ambito: Database["public"]["Enums"]["ambito_secuencial"]
          p_justificacion: string
          p_organization_id: string
          p_plantilla: string
          p_prefijo_fijo: string
        }
        Returns: {
          actualizado_en: string
          actualizado_por: string | null
          ambito_secuencial: Database["public"]["Enums"]["ambito_secuencial"]
          creada_en: string
          iniciada_en: string | null
          organization_id: string
          plantilla: string
          prefijo_fijo: string | null
        }
        SetofOptions: {
          from: "*"
          to: "configuracion_folio"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cargar_regimenes_2026_09: {
        Args: never
        Returns: {
          autoridad_leida: string
          jurisdicciones: number
          regimenes: number
        }[]
      }
      cargar_snapshot_gafi_2026_06: { Args: never; Returns: number }
      catalogo_en_fecha: {
        Args: { p_codigo: string; p_fecha?: string }
        Returns: {
          clave: string
          descripcion: string
          orden: number
        }[]
      }
      cerrar_carga_completa: { Args: { p_carga_id: string }; Returns: number }
      clave_valida_en_catalogo: {
        Args: { p_clave: string; p_codigo: string; p_fecha?: string }
        Returns: boolean
      }
      cobertura_de_listas: {
        Args: { p_org: string }
        Returns: {
          filas_vigentes: number
          fuente: string
          tamizada_por: string
        }[]
      }
      configuracion_matriz_valida: { Args: { p_cfg: Json }; Returns: boolean }
      confirmar_parametro: {
        Args: { p_id: string; p_quien: string }
        Returns: undefined
      }
      corregir_parametro: {
        Args: {
          p_fuente: string
          p_id: string
          p_motivo: string
          p_valor: number
        }
        Returns: undefined
      }
      crear_borrador_matriz: {
        Args: {
          p_notas?: string
          p_organization_id: string
          p_sector: Database["public"]["Enums"]["sector_av"]
        }
        Returns: {
          activa: boolean
          configuracion: Json
          creada_en: string
          creada_por: string | null
          estado: Database["public"]["Enums"]["estado_plantilla"]
          id: string
          notas_version: string | null
          organization_id: string
          publicada_en: string | null
          publicada_por: string | null
          sector: Database["public"]["Enums"]["sector_av"]
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "client_risk_template"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_org_id: { Args: never; Returns: string }
      descartar_carga_borrador: {
        Args: { p_carga_id: string; p_motivo: string }
        Returns: undefined
      }
      diagnostico_organizacion: {
        Args: { p_org: string }
        Returns: {
          concepto: string
          cuantos: number
          detalle: string
          listo: boolean
        }[]
      }
      diferencia_carga_borrador: {
        Args: { p_carga_id: string }
        Returns: {
          cantidad: number
          concepto: string
          nota: string
        }[]
      }
      emitir_folio_hallazgo: {
        Args: { p_hallazgo_id: string }
        Returns: string
      }
      es_admin_kawiil: { Args: never; Returns: boolean }
      fecha_compromiso_propuesta: {
        Args: { p_detectado?: string }
        Returns: string
      }
      fijar_parametro: {
        Args: {
          p_codigo: string
          p_fuente: string
          p_nombre: string
          p_notas?: string
          p_publicacion_dof?: string
          p_sector?: string
          p_unidad: string
          p_url_fuente?: string
          p_valor: number
          p_vigente_desde: string
        }
        Returns: string
      }
      has_rol: {
        Args: { target_rol: Database["public"]["Enums"]["rol_usuario"] }
        Returns: boolean
      }
      json_canonico: { Args: { p: Json }; Returns: string }
      limite_efectivo_del_acto: {
        Args: { p_tipo_acto: string }
        Returns: string
      }
      listado_en_fecha: {
        Args: {
          p_fecha: string
          p_fuente: string
          p_nombre?: string
          p_rfc?: string
        }
        Returns: boolean
      }
      marcar_prospecto: {
        Args: { p_id: string; p_notas?: string; p_status: string }
        Returns: undefined
      }
      nivel_diligencia_exigido: {
        Args: { p_client: string }
        Returns: {
          motivo: string
          nivel: Database["public"]["Enums"]["nivel_kyc"]
        }[]
      }
      normalizar_nombre: { Args: { p_texto: string }; Returns: string }
      paises_sancionados_sin_catalogo: {
        Args: { p_lectura?: string }
        Returns: {
          iso2: string
          regimenes: string
        }[]
      }
      parametro_vigente: {
        Args: { p_codigo: string; p_fecha?: string; p_sector?: string }
        Returns: number
      }
      pep_desde_resumen: { Args: { p_resumen: Json }; Returns: Json }
      promover_carga_borrador: {
        Args: { p_carga_id: string }
        Returns: {
          desactivados: number
          promovidos: number
        }[]
      }
      provisionar_organizacion: {
        Args: {
          p_domicilio_fiscal?: string
          p_es_demostracion?: boolean
          p_perfil_actividad: string
          p_razon_social: string
          p_representante_legal?: string
          p_rfc: string
          p_sector: Database["public"]["Enums"]["sector_av"]
        }
        Returns: string
      }
      proyectar_sanciones_a_paises: {
        Args: { p_lectura?: string }
        Returns: {
          cerradas: number
          lista: string
          organizacion: string
          vigentes: number
        }[]
      }
      publicar_matriz: {
        Args: { p_template_id: string }
        Returns: {
          activa: boolean
          configuracion: Json
          creada_en: string
          creada_por: string | null
          estado: Database["public"]["Enums"]["estado_plantilla"]
          id: string
          notas_version: string | null
          organization_id: string
          publicada_en: string | null
          publicada_por: string | null
          sector: Database["public"]["Enums"]["sector_av"]
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "client_risk_template"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      puede_provisionar: { Args: never; Returns: boolean }
      rango_por_anclar: {
        Args: { p_organization_id: string }
        Returns: {
          desde: number
          hasta: number
        }[]
      }
      reemplazar_valores_catalogo: {
        Args: { p_codigo: string; p_motivo?: string; p_valores: Json }
        Returns: number
      }
      regimenes_sin_jurisdiccion: {
        Args: { p_lectura?: string }
        Returns: {
          autoridad: string
          clave: string
          nota: string
        }[]
      }
      registrar_evento: {
        Args: {
          p_actor_id?: string
          p_actor_tipo?: string
          p_entidad: string
          p_entidad_id: string
          p_organization_id: string
          p_payload: Json
          p_tipo: string
          p_versiones?: Json
        }
        Returns: string
      }
      render_folio: {
        Args: {
          p_anio: number
          p_plantilla: string
          p_prefijo: string
          p_secuencial: number
        }
        Returns: string
      }
      reponer_segundo_factor: {
        Args: { p_motivo: string; p_user_id: string }
        Returns: Json
      }
      retirar_datos_de_demostracion: {
        Args: { p_motivo: string; p_organization_id: string }
        Returns: Json
      }
      revertir_carga_lista: {
        Args: { p_carga_id: string; p_motivo?: string }
        Returns: {
          movimientos_borrados: number
          registros_eliminados: number
          registros_recalculados: number
        }[]
      }
      sincronizar_nivel_diligencia: {
        Args: {
          p_clasificacion?: Database["public"]["Enums"]["clasificacion_riesgo"]
          p_client: string
          p_motivo_piso?: string
        }
        Returns: Database["public"]["Enums"]["nivel_kyc"]
      }
      urgencia_de_regla: {
        Args: { regla: Json }
        Returns: Database["public"]["Enums"]["clasificacion_urgencia"]
      }
      usuarios_de_plataforma: {
        Args: never
        Returns: {
          activo: boolean
          creado_en: string
          email: string
          es_kawiil: boolean
          factores_pendientes: number
          factores_verificados: number
          nombre: string
          organizacion: string
          organization_id: string
          roles: string[]
          ultimo_acceso: string
          user_id: string
        }[]
      }
      validar_configuracion_matriz: {
        Args: { p_cfg: Json }
        Returns: undefined
      }
      verificar_cadena: {
        Args: { p_organization_id: string }
        Returns: {
          evento_id: string
          motivo: string
          secuencia: number
        }[]
      }
    }
    Enums: {
      accion_movimiento_lista: "alta" | "baja"
      alcance_carga_lista: "completa" | "parcial"
      ambito_secuencial: "organizacion" | "prefijo" | "prefijo_anio"
      calidad_aprobacion:
        | "notario_titular"
        | "oficial_cumplimiento"
        | "directivo_designado"
      clasificacion_riesgo: "bajo" | "medio" | "alto" | "alto_oficio"
      clasificacion_urgencia: "24_horas" | "por_umbral"
      estado_aprobacion: "pendiente" | "aprobada" | "rechazada"
      estado_aviso: "borrador" | "listo_firma" | "enviado" | "acusado"
      estado_carga_lista: "borrador" | "aplicada" | "revertida"
      estado_consulta_se:
        | "no_aplica"
        | "pendiente"
        | "realizada"
        | "no_disponible"
      estado_cuestionario: "borrador" | "firmado" | "obsoleto"
      estado_declaracion: "si" | "no" | "no_declarado"
      estado_hallazgo:
        | "abierto"
        | "en_revision"
        | "confirmado_inusual"
        | "confirmado_preocupante"
        | "descartado"
        | "falso_positivo"
      estado_paso_bc:
        | "no_practicado"
        | "practicado_sin_resultado"
        | "practicado_con_resultado"
      estado_plantilla: "borrador" | "publicada"
      estado_verificacion:
        | "no_iniciada"
        | "en_progreso"
        | "en_revision"
        | "aprobada"
        | "rechazada"
        | "reenviada"
        | "abandonada"
        | "expirada"
        | "error"
      firma_mecanismo:
        | "efirma_sat"
        | "prestador_certificacion"
        | "conservacion_mensajes_datos"
      fuente_lista:
        | "gafi_negra"
        | "gafi_gris"
        | "ofac_sancionado"
        | "onu"
        | "paraiso_fiscal_mx"
        | "entidad_alta_mx"
        | "entidad_media_mx"
        | "entidad_baja_mx"
        | "pep_nacional"
        | "pep_extranjero"
        | "manual"
      modo_actualizacion_lista: "snapshot" | "movimientos"
      naturaleza_allegado:
        | "conyuge"
        | "concubina_concubinario"
        | "dependiente_economico"
        | "sociedad_vinculo_patrimonial"
        | "otro_justificado"
      naturaleza_lista:
        | "sancion_aml"
        | "fiscal"
        | "jurisdiccion"
        | "pep"
        | "interna"
      nivel_kyc: "N1" | "N2" | "N3"
      resultado_consulta_se: "coincide" | "discrepa" | "sin_informacion"
      resultado_job_lista: "exito" | "sin_cambios" | "error"
      rol_usuario: "operador" | "oc" | "admin"
      sector_av: "IV" | "V" | "VII" | "VIII" | "XV" | "XVI" | "XII"
      severidad_tipologia: "baja" | "media" | "alta" | "critica"
      tipo_aviso: "24h" | "mensual"
      tipo_bitacora_hallazgo:
        | "cambio_estado"
        | "nota"
        | "documento_subido"
        | "cambio_urgencia"
      tipo_carga_lista: "archivo" | "captura_manual" | "api"
      tipo_operacion:
        | "compra_fiat_cripto"
        | "venta_cripto_fiat"
        | "retiro_cripto"
        | "deposito_fiat"
        | "otro"
      tipo_persona: "fisica" | "moral"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      accion_movimiento_lista: ["alta", "baja"],
      alcance_carga_lista: ["completa", "parcial"],
      ambito_secuencial: ["organizacion", "prefijo", "prefijo_anio"],
      calidad_aprobacion: [
        "notario_titular",
        "oficial_cumplimiento",
        "directivo_designado",
      ],
      clasificacion_riesgo: ["bajo", "medio", "alto", "alto_oficio"],
      clasificacion_urgencia: ["24_horas", "por_umbral"],
      estado_aprobacion: ["pendiente", "aprobada", "rechazada"],
      estado_aviso: ["borrador", "listo_firma", "enviado", "acusado"],
      estado_carga_lista: ["borrador", "aplicada", "revertida"],
      estado_consulta_se: [
        "no_aplica",
        "pendiente",
        "realizada",
        "no_disponible",
      ],
      estado_cuestionario: ["borrador", "firmado", "obsoleto"],
      estado_declaracion: ["si", "no", "no_declarado"],
      estado_hallazgo: [
        "abierto",
        "en_revision",
        "confirmado_inusual",
        "confirmado_preocupante",
        "descartado",
        "falso_positivo",
      ],
      estado_paso_bc: [
        "no_practicado",
        "practicado_sin_resultado",
        "practicado_con_resultado",
      ],
      estado_plantilla: ["borrador", "publicada"],
      estado_verificacion: [
        "no_iniciada",
        "en_progreso",
        "en_revision",
        "aprobada",
        "rechazada",
        "reenviada",
        "abandonada",
        "expirada",
        "error",
      ],
      firma_mecanismo: [
        "efirma_sat",
        "prestador_certificacion",
        "conservacion_mensajes_datos",
      ],
      fuente_lista: [
        "gafi_negra",
        "gafi_gris",
        "ofac_sancionado",
        "onu",
        "paraiso_fiscal_mx",
        "entidad_alta_mx",
        "entidad_media_mx",
        "entidad_baja_mx",
        "pep_nacional",
        "pep_extranjero",
        "manual",
      ],
      modo_actualizacion_lista: ["snapshot", "movimientos"],
      naturaleza_allegado: [
        "conyuge",
        "concubina_concubinario",
        "dependiente_economico",
        "sociedad_vinculo_patrimonial",
        "otro_justificado",
      ],
      naturaleza_lista: [
        "sancion_aml",
        "fiscal",
        "jurisdiccion",
        "pep",
        "interna",
      ],
      nivel_kyc: ["N1", "N2", "N3"],
      resultado_consulta_se: ["coincide", "discrepa", "sin_informacion"],
      resultado_job_lista: ["exito", "sin_cambios", "error"],
      rol_usuario: ["operador", "oc", "admin"],
      sector_av: ["IV", "V", "VII", "VIII", "XV", "XVI", "XII"],
      severidad_tipologia: ["baja", "media", "alta", "critica"],
      tipo_aviso: ["24h", "mensual"],
      tipo_bitacora_hallazgo: [
        "cambio_estado",
        "nota",
        "documento_subido",
        "cambio_urgencia",
      ],
      tipo_carga_lista: ["archivo", "captura_manual", "api"],
      tipo_operacion: [
        "compra_fiat_cripto",
        "venta_cripto_fiat",
        "retiro_cripto",
        "deposito_fiat",
        "otro",
      ],
      tipo_persona: ["fisica", "moral"],
    },
  },
} as const
