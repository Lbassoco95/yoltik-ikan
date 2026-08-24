-- =====================================================================
-- Seed · Plantilla de matriz de riesgo del cliente (sector XII · notarías)
-- =====================================================================
-- "Un motor, N perfiles": la fe pública tiene su propia matriz, NO reutiliza
-- la de Ixim Pay (XVI). `client_risk_template` ya es por organización + sector,
-- así que no hace falta tocar el schema.
--
-- REQUIERE la migration 0010 aplicada (columna `estado`).
--
-- ⚠ PRIMER BORRADOR, no contenido definitivo. Las variables, los valores de
-- riesgo y las bandas son una propuesta razonable construida sobre lo que ya
-- existe en el repo (catálogo TIPOS_ACTO_NOTARIA y los umbrales 645 / 3,210
-- UMA que ya usan las reglas del motor), NO una metodología validada.
-- Kawiil-Cumplimiento debe revisarla antes de usarla con un cliente real de
-- notaría. Hoy solo aplica a la organización DEMO de la Notaría Demo GDL.
--
-- Todos los pesos quedan en el default (1) a propósito: ponderar unas variables
-- por encima de otras es decisión de metodología, no de implementación.
--
-- Rango de score que produce esta plantilla (con pesos = 1):
--   Persona física  · 8 variables · 8–25
--   Persona moral   · 8 variables · 8–26
-- Bandas calibradas a ese rango: bajo 8–13, medio 14–19, alto 20–26.
-- =====================================================================

insert into client_risk_template (id, organization_id, sector, version, configuracion,
                                  activa, estado, notas_version)
values (
  '44444444-0012-0000-0000-000000000001',
  '12121212-1212-1212-1212-121212121212',
  'XII', 1,
  '{
    "elementos": [
      {
        "codigo": "E1_ACTO",
        "nombre": "Tipo de acto y operación",
        "variables": [
          {
            "codigo": "XII-ACT-01",
            "pregunta": "Tipo de acto que se instrumenta",
            "criterio": "Catálogo TIPOS_ACTO_NOTARIA (src/lib/perfil-actividad.ts)",
            "opciones": [
              { "valor": 1, "label": "Compraventa de inmueble" },
              { "valor": 2, "label": "Constitución de sociedad" },
              { "valor": 3, "label": "Fideicomiso" },
              { "valor": 4, "label": "Poder irrevocable" }
            ]
          },
          {
            "codigo": "XII-ACT-02",
            "pregunta": "Valor de la operación (en UMA)",
            "criterio": "Umbrales 645 y 3,210 UMA, los mismos que ya usan las reglas del motor",
            "opciones": [
              { "valor": 1, "label": "Menor a 645 UMA" },
              { "valor": 2, "label": "De 645 a 3,210 UMA" },
              { "valor": 3, "label": "Mayor a 3,210 UMA" }
            ]
          },
          {
            "codigo": "XII-ACT-03",
            "pregunta": "Forma de pago",
            "opciones": [
              { "valor": 1, "label": "Bancarizado (transferencia o cheque nominativo)" },
              { "valor": 2, "label": "Mixto (parte en efectivo)" },
              { "valor": 3, "label": "Efectivo" }
            ]
          }
        ]
      },
      {
        "codigo": "E2_COMPARECIENTE_PF",
        "nombre": "Compareciente persona física",
        "aplica_si": "tipo_persona == ''fisica''",
        "variables": [
          {
            "codigo": "XII-PF-01",
            "pregunta": "Residencia del compareciente",
            "opciones": [
              { "valor": 1, "label": "Nacional" },
              { "valor": 2, "label": "Extranjero, jurisdicción sin observaciones GAFI" },
              { "valor": 3, "label": "Extranjero, jurisdicción de riesgo" }
            ]
          },
          {
            "codigo": "XII-PF-02",
            "pregunta": "Condición de PEP",
            "opciones": [
              { "valor": 1, "label": "No es PEP" },
              { "valor": 2, "label": "PEP nacional (estatal o municipal)" },
              { "valor": 3, "label": "PEP federal o PEP extranjero" }
            ]
          },
          {
            "codigo": "XII-PF-03",
            "pregunta": "Actividad o profesión",
            "opciones": [
              { "valor": 1, "label": "Actividad de riesgo bajo" },
              { "valor": 2, "label": "Actividad de riesgo medio" },
              { "valor": 3, "label": "Actividad de riesgo alto (intensiva en efectivo)" }
            ]
          }
        ]
      },
      {
        "codigo": "E3_COMPARECIENTE_PM",
        "nombre": "Compareciente persona moral",
        "aplica_si": "tipo_persona == ''moral''",
        "variables": [
          {
            "codigo": "XII-PM-01",
            "pregunta": "Jurisdicción de constitución",
            "opciones": [
              { "valor": 1, "label": "Nacional" },
              { "valor": 2, "label": "Extranjera, sin observaciones GAFI" },
              { "valor": 3, "label": "Jurisdicción en lista gris GAFI" },
              { "valor": 4, "label": "Jurisdicción en lista negra GAFI" }
            ]
          },
          {
            "codigo": "XII-PM-02",
            "pregunta": "Beneficiario controlador identificado",
            "opciones": [
              { "valor": 1, "label": "Sí, identificado y documentado" },
              { "valor": 2, "label": "Identificado parcialmente" },
              { "valor": 3, "label": "No identificado" }
            ]
          },
          {
            "codigo": "XII-PM-03",
            "pregunta": "Giro de la sociedad",
            "opciones": [
              { "valor": 1, "label": "Giro de riesgo bajo" },
              { "valor": 2, "label": "Giro de riesgo medio" },
              { "valor": 3, "label": "Giro de riesgo alto" }
            ]
          }
        ]
      },
      {
        "codigo": "E4_ORIGEN_RECURSOS",
        "nombre": "Origen de recursos",
        "variables": [
          {
            "codigo": "XII-REC-01",
            "pregunta": "País de origen de los fondos",
            "opciones": [
              { "valor": 1, "label": "México u otra jurisdicción de riesgo bajo" },
              { "valor": 2, "label": "Jurisdicción de riesgo medio" },
              { "valor": 3, "label": "Jurisdicción de riesgo alto (lista gris o negra GAFI)" }
            ]
          },
          {
            "codigo": "XII-REC-02",
            "pregunta": "¿Involucra moneda extranjera o activos virtuales?",
            "opciones": [
              { "valor": 1, "label": "No, solo moneda nacional" },
              { "valor": 2, "label": "Moneda extranjera" },
              { "valor": 3, "label": "Activos virtuales" }
            ]
          }
        ]
      }
    ],
    "escala_cliente": {
      "bajo":  { "min": 8,  "max": 13, "acciones": "Debida Diligencia Simplificada. Identificación estándar del compareciente. Revisión anual." },
      "medio": { "min": 14, "max": 19, "acciones": "Debida Diligencia Estándar. Verificación de origen de recursos. Revisión semestral." },
      "alto":  { "min": 20, "max": 26, "acciones": "Debida Diligencia Reforzada. Aprobación escrita del Oficial de Cumplimiento antes de instrumentar. Revisión cada 6 meses." }
    },
    "triggers_alto_de_oficio": [
      { "codigo": "PODER_IRREVOCABLE", "descripcion": "Otorgamiento de poder irrevocable", "variable_codigo": "XII-ACT-01", "valor_minimo": 4 },
      { "codigo": "FIDEICOMISO", "descripcion": "Constitución de fideicomiso", "variable_codigo": "XII-ACT-01", "valor_minimo": 3 },
      { "codigo": "PEP_EXTRANJERO", "descripcion": "Compareciente PEP federal o extranjero", "variable_codigo": "XII-PF-02", "valor_minimo": 3 },
      { "codigo": "GAFI_NEGRA", "descripcion": "Persona moral constituida en jurisdicción de lista negra GAFI", "variable_codigo": "XII-PM-01", "valor_minimo": 4 }
    ]
  }'::jsonb,
  true, 'publicada',
  'Primer borrador para el piloto de la Notaría Demo GDL. Pendiente de validación con Kawiil-Cumplimiento.'
)
on conflict (organization_id, sector, version) do nothing;
