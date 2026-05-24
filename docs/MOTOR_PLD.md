# Motor PLD · Cómo funciona

## Concepto

El Motor PLD procesa cada operación automáticamente y produce **hallazgos** cuando una
**tipología** dispara. El OC consume hallazgos; no revisa la captura del Operador.

```
[Operador captura] → [Motor PLD] → [OC consume bandejas del motor]
```

## Entidades

- **tipologia_av**: catálogo de reglas por sector y organización, con `regla_dsl` declarativa,
  versionadas, aprobadas por OC.
- **hallazgo**: salida del motor. Lleva snapshot inmutable de la tipología al momento del disparo.
- **motor_run**: registro de cada ejecución (cuándo, sobre qué, con qué versión, qué produjo).
- **operation.requiere_aviso**: bandera que el motor actualiza al identificar operaciones.
- **aviso**: borrador del aviso UIF (24h o mensual) que el motor arma.

## Formato de regla_dsl

Cada tipología tiene un `tipo` y parámetros propios. Tipos soportados en Sprint D-3:

### `agregado` — contar / sumar dentro de una ventana

```json
{
  "tipo": "agregado",
  "ventana": "72h",
  "agrupar_por": "client_id",
  "condicion": {
    "count": { "op": ">=", "valor": 3 },
    "suma_monto_uma": { "op": ">=", "valor": 645 }
  }
}
```

Ejemplo: **XVI-01 Structuring** — 3+ operaciones de mismo cliente en 72h que sumen ≥645 UMA.

### `secuencia` — eventos en orden dentro de una ventana

```json
{
  "tipo": "secuencia",
  "ventana": "24h",
  "secuencia": ["deposito_fiat", "retiro_cripto"],
  "condicion": { "razon_retiro_saldo": { "op": ">=", "valor": 0.9 } }
}
```

Ejemplo: **XVI-02 Layering** — depósito fiat seguido de retiro >=90% del saldo en 24h.

### `score` — score externo (ej. blockchain analytics)

```json
{
  "tipo": "score",
  "fuente": "blockchain_analytics_mock",
  "condicion": {
    "exposicion_pct": { "op": ">", "valor": 10 },
    "categorias": ["mixer", "ofac_sdn", "ransomware", "darknet"]
  }
}
```

Ejemplo: **XVI-03 Exposición on-chain**.

### `lookup` — coincidencia con catálogo

```json
{
  "tipo": "lookup",
  "campo": "contraparte.pais_iso2",
  "fuentes": ["gafi_negra", "gafi_gris", "ofac_sancionado", "onu"]
}
```

Ejemplo: **XVI-04 País de alto riesgo**.

### `duplicado` — varias entidades con campo coincidente

```json
{
  "tipo": "duplicado",
  "campos": ["device_id", "ip", "biometric_hash"],
  "umbral_cuentas": 2
}
```

Ejemplo: **XVI-05 Smurfing**.

### `desviacion` — fuera de perfil

```json
{
  "tipo": "desviacion",
  "factor": 3.0,
  "comparar": "promedio_historico_mensual"
}
```

Ejemplo: **XVI-07 Fuera de perfil**.

## Ciclo de configuración

1. Admin propone (alta o cambio de tipología) → inserta en `pending_approvals`.
2. OC revisa, aprueba (firma) o rechaza con motivo.
3. Al aprobar, la tipología nueva entra con `version += 1` y `aprobada_por_oc_en` poblado.
4. Las versiones anteriores quedan; el motor opera con la versión vigente, pero los hallazgos
   ya existentes conservan el snapshot de la versión que aplicaba en su momento.

## Idempotencia

`hallazgo` tiene constraint único sobre `(operation_id, tipologia_id, tipologia_version)`. Si
se vuelve a correr el motor sobre el mismo dataset, no duplica hallazgos.

## Trazabilidad

Cada hallazgo guarda en `regla_payload` los datos exactos que cumplieron la regla. Esto
permite auditar después por qué disparó, con los valores del momento.

## Cómo se invoca

- Post-insert en `operation`: trigger lambda o RPC `invoke_motor_pld(op_id)`.
- Manual: botón en panel del OC "Recorrer motor sobre operaciones del mes".
- Cron: para reglas agregadas que dependen de ventanas grandes.

## Estado en Sprint D-1

`supabase/functions/motor-pld/index.ts` queda como **stub** que solo registra el `motor_run`
sin generar hallazgos. Los evaluadores reales de `regla_dsl` entran en Sprint D-3.
