-- =====================================================================
-- Seed · Plantilla de matriz de riesgo del cliente (sector XVI)
-- =====================================================================
-- Replica las preguntas de "Matriz de Riesgos Clientes - FIATCOIN RAMPLE.xlsx",
-- hoja Evaluación Cliente. Escala fija 15–39 (Bajo / Medio / Alto).
-- =====================================================================

insert into client_risk_template (id, organization_id, sector, version, configuracion, activa)
values (
  '44444444-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'XVI', 1,
  '{
    "elementos": [
      {
        "codigo": "E1_PRODUCTOS",
        "nombre": "Productos y Servicios",
        "variables": [
          {
            "codigo": "PROD-01",
            "pregunta": "Producto: Compra/venta fiat ⇄ cripto (on/off ramp)",
            "criterio": "Intercambio de activos virtuales",
            "peso": 1,
            "opciones": [
              { "valor": 1, "label": "Bajo: Compra únicamente" },
              { "valor": 2, "label": "Medio: Compra y venta" },
              { "valor": 3, "label": "Alto: Compra, venta y retiro on-chain a wallet externa" }
            ]
          }
        ]
      },
      {
        "codigo": "E2_CLIENTE_PF",
        "nombre": "Persona Física",
        "aplica_si": "tipo_persona == ''fisica''",
        "variables": [
          {
            "codigo": "CLI-PF-01",
            "pregunta": "Listas de bloqueados / PEP",
            "opciones": [
              { "valor": 1, "label": "Sin coincidencia" },
              { "valor": 2, "label": "PEP estatal/municipal" },
              { "valor": 3, "label": "PEP federal o PEP extranjero / OFAC (ALTO DE OFICIO)" }
            ]
          },
          {
            "codigo": "CLI-PF-02",
            "pregunta": "Edad",
            "opciones": [
              { "valor": 1, "label": "51+ años" },
              { "valor": 2, "label": "36–50 años" },
              { "valor": 3, "label": "18–35 años" }
            ]
          },
          {
            "codigo": "CLI-PF-03",
            "pregunta": "Nacionalidad",
            "opciones": [
              { "valor": 1, "label": "Mexicana" },
              { "valor": 2, "label": "Extranjera (país no GAFI)" },
              { "valor": 3, "label": "Extranjera (país GAFI gris/negra)" }
            ]
          },
          {
            "codigo": "CLI-PF-04",
            "pregunta": "Ocupación / Actividad económica",
            "opciones": [
              { "valor": 1, "label": "Empleado formal / asalariado" },
              { "valor": 2, "label": "Profesional independiente" },
              { "valor": 3, "label": "Actividad Vulnerable (Art. 17) o giro en efectivo" }
            ]
          },
          {
            "codigo": "CLI-PF-05",
            "pregunta": "Origen de recursos",
            "opciones": [
              { "valor": 1, "label": "Nómina/salario comprobable" },
              { "valor": 2, "label": "Honorarios/negocio comprobable" },
              { "valor": 3, "label": "Inversiones/herencia sin comprobante sólido" }
            ]
          }
        ]
      },
      {
        "codigo": "E2_CLIENTE_PM",
        "nombre": "Persona Moral",
        "aplica_si": "tipo_persona == ''moral''",
        "variables": [
          {
            "codigo": "CLI-PM-01",
            "pregunta": "Listas bloqueados / PEP (integrantes / BC)",
            "opciones": [
              { "valor": 1, "label": "Sin coincidencia" },
              { "valor": 2, "label": "Integrante con PEP estatal/municipal" },
              { "valor": 3, "label": "Integrante PEP federal / extranjero / OFAC (ALTO DE OFICIO)" }
            ]
          },
          {
            "codigo": "CLI-PM-02",
            "pregunta": "Antigüedad de constitución",
            "opciones": [
              { "valor": 1, "label": "Más de 5 años" },
              { "valor": 2, "label": "Entre 2 y 5 años" },
              { "valor": 3, "label": "Menos de 2 años" }
            ]
          },
          {
            "codigo": "CLI-PM-03",
            "pregunta": "Nacionalidad de la sociedad",
            "opciones": [
              { "valor": 1, "label": "México" },
              { "valor": 2, "label": "Extranjera no GAFI" },
              { "valor": 3, "label": "Extranjera lista gris/negra GAFI o paraíso fiscal" }
            ]
          },
          {
            "codigo": "CLI-PM-04",
            "pregunta": "Actividad económica / giro",
            "opciones": [
              { "valor": 1, "label": "Giro de bajo riesgo" },
              { "valor": 2, "label": "Comercio / servicios con efectivo moderado" },
              { "valor": 3, "label": "Realiza AV (Art. 17) o giro intensivo en efectivo" }
            ]
          },
          {
            "codigo": "CLI-PM-05",
            "pregunta": "Tipo de sociedad o entidad",
            "opciones": [
              { "valor": 1, "label": "Afores / Seguros / Fianzas / Asesores Inv." },
              { "valor": 2, "label": "Casa de cambio / Banca desarrollo / SOCAP / SOFOM" },
              { "valor": 3, "label": "Banca Múltiple / Centros Cambiarios / SOFOMER" }
            ]
          },
          {
            "codigo": "CLI-PM-06",
            "pregunta": "Estructura accionaria (BC)",
            "opciones": [
              { "valor": 1, "label": "BC identificado y único" },
              { "valor": 2, "label": "Estructura 2–5 niveles, todos identificados" },
              { "valor": 3, "label": "Múltiples niveles / fideicomisos / acciones al portador" }
            ]
          }
        ]
      },
      {
        "codigo": "E3_PAISES",
        "nombre": "Países y Áreas Geográficas",
        "variables": [
          {
            "codigo": "PAIS-01",
            "pregunta": "País de residencia fiscal del cliente",
            "opciones": [
              { "valor": 1, "label": "México" },
              { "valor": 2, "label": "Extranjero (no GAFI)" },
              { "valor": 3, "label": "GAFI gris/negra, OFAC/ONU o paraíso fiscal" }
            ]
          },
          {
            "codigo": "PAIS-02",
            "pregunta": "Entidad federativa de domicilio (MX)",
            "opciones": [
              { "valor": 1, "label": "Baja (Querétaro, Hidalgo, BCS, etc.)" },
              { "valor": 2, "label": "Media (CDMX, Colima, Puebla, etc.)" },
              { "valor": 3, "label": "Alta (BC, Chih, Gto, Gro, Jal, Mich, NL, Son, Tamps, Zac, Mor)" }
            ]
          },
          {
            "codigo": "PAIS-03",
            "pregunta": "País contraparte (origen o destino de fondos)",
            "opciones": [
              { "valor": 1, "label": "México" },
              { "valor": 2, "label": "Extranjero (no GAFI)" },
              { "valor": 3, "label": "GAFI, OFAC, paraíso fiscal" }
            ]
          }
        ]
      },
      {
        "codigo": "E4_CANALES",
        "nombre": "Canales de Contratación, Fondeo y Retiro",
        "variables": [
          {
            "codigo": "CAN-01",
            "pregunta": "Canal de alta (KYC)",
            "opciones": [
              { "valor": 1, "label": "Presencial con oficial" },
              { "valor": 2, "label": "No presencial con liveness + biometría + INE/RENAPO" },
              { "valor": 3, "label": "No presencial sin biometría reforzada" }
            ]
          },
          {
            "codigo": "CAN-02",
            "pregunta": "Canal de fondeo en fiat (MXN)",
            "opciones": [
              { "valor": 1, "label": "SPEI desde cuenta a nombre del mismo cliente" },
              { "valor": 2, "label": "SPEI de tercero autorizado (familia/patrón)" },
              { "valor": 3, "label": "Depósito en efectivo / fuentes no rastreables" }
            ]
          },
          {
            "codigo": "CAN-03",
            "pregunta": "Canal de retiro",
            "opciones": [
              { "valor": 1, "label": "SPEI a cuenta del mismo cliente" },
              { "valor": 2, "label": "Retiro cripto a wallet propia declarada" },
              { "valor": 3, "label": "Retiro cripto a wallet externa no declarada" }
            ]
          }
        ]
      },
      {
        "codigo": "E5_TRANSACCIONES",
        "nombre": "Características de las Transacciones",
        "variables": [
          {
            "codigo": "TRX-01",
            "pregunta": "Monto promedio por operación",
            "opciones": [
              { "valor": 1, "label": "< $20,000 MXN (≤ p50)" },
              { "valor": 2, "label": "$20,000 – $75,000 MXN (umbral 645 UMA)" },
              { "valor": 3, "label": "> $75,000 MXN (≥ umbral identificación)" }
            ]
          },
          {
            "codigo": "TRX-02",
            "pregunta": "Volumen mensual acumulado",
            "opciones": [
              { "valor": 1, "label": "< $75,000 MXN" },
              { "valor": 2, "label": "$75,000 – $300,000 MXN" },
              { "valor": 3, "label": "> $300,000 MXN (≥ 4x umbral)" }
            ]
          },
          {
            "codigo": "TRX-03",
            "pregunta": "Frecuencia transaccional",
            "opciones": [
              { "valor": 1, "label": "≤ 5 ops/mes" },
              { "valor": 2, "label": "6–15 ops/mes" },
              { "valor": 3, "label": "> 15 ops/mes" }
            ]
          },
          {
            "codigo": "TRX-04",
            "pregunta": "Origen de las transacciones (fiat in)",
            "opciones": [
              { "valor": 1, "label": "Desde México / cuenta propia" },
              { "valor": 2, "label": "Desde país extranjero no GAFI" },
              { "valor": 3, "label": "Desde país GAFI gris/negra, OFAC o paraíso fiscal" }
            ]
          },
          {
            "codigo": "TRX-05",
            "pregunta": "Destino de retiros (cripto out)",
            "opciones": [
              { "valor": 1, "label": "Wallet del mismo cliente en exchange regulado" },
              { "valor": 2, "label": "Wallet externa propia declarada" },
              { "valor": 3, "label": "Wallet en país sancionado / mixer" }
            ]
          },
          {
            "codigo": "TRX-06",
            "pregunta": "Exposición on-chain (análisis blockchain)",
            "opciones": [
              { "valor": 1, "label": "Sin exposición a wallets de alto riesgo" },
              { "valor": 2, "label": "Exposición indirecta < 10%" },
              { "valor": 3, "label": "Exposición directa a mixers/OFAC" }
            ]
          },
          {
            "codigo": "TRX-07",
            "pregunta": "Tipo de activo virtual operado",
            "opciones": [
              { "valor": 1, "label": "Stablecoin auditada (USDC/USDT) o BTC/ETH" },
              { "valor": 2, "label": "Otros tokens en cadena transparente" },
              { "valor": 3, "label": "Privacy coins (Monero, Zcash shielded, Dash PrivateSend)" }
            ]
          }
        ]
      }
    ],
    "escala_cliente": {
      "bajo":  { "min": 15, "max": 22, "acciones": "Debida Diligencia Simplificada. Monitoreo estándar. Revisión anual." },
      "medio": { "min": 23, "max": 30, "acciones": "Debida Diligencia Estándar. Monitoreo mensual. Revisión semestral." },
      "alto":  { "min": 31, "max": 39, "acciones": "Debida Diligencia Reforzada (DDR). Aprobación escrita OC. Monitoreo continuo. Revisión cada 6 meses." }
    },
    "triggers_alto_de_oficio": [
      { "codigo": "OFAC_SDN", "descripcion": "Coincidencia en lista OFAC SDN" },
      { "codigo": "ONU_CONSOLIDADA", "descripcion": "Coincidencia en lista ONU consolidada" },
      { "codigo": "PEP_FED_MX", "descripcion": "PEP federal mexicano" },
      { "codigo": "PEP_EXTRANJERO", "descripcion": "PEP extranjero" },
      { "codigo": "WALLET_SANCIONADA", "descripcion": "Wallet sancionada (OFAC SDN o ransomware)" },
      { "codigo": "GAFI_NEGRA", "descripcion": "País de residencia o contraparte en lista negra GAFI" }
    ]
  }'::jsonb,
  true
)
on conflict (organization_id, sector, version) do nothing;
