# Inconsistencias detectadas en `docs/formatos-uif/`

Fuente: extracción determinista del DOF 24/09/2026. **No se corrigen en código ni
en los JSON.** La corrección corresponde a Cumplimiento.

| Anexo | Campo (`numero`) | Hallazgo | Valor en JSON |
|---|---|---|---|
| 11 | `3.7.1.2.9.6.2.2.4` | Tipografía en obligatoriedad: falta una «o» | `Obligatiorio` |
| 12-A | `3.6.1.3.7.8.3.2.4` | Misma tipografía + condición específica | `Obligatiorio para Fideicomisos de garantía sobre inmuebles` |
| 12-A | `3.6.1.3.8.7.1` | Tipografía en la condición («honeroso» por «oneroso») | `Obligatorio en caso de ser a título honeroso` |
| 11 | `3.7.1.2.2.3.1.1.1` | Valor de obligatoriedad con apariencia de longitud/rango (el campo se llama Nombre(s); `longitud` también dice `1-200`) | `1-200` |
| varios | p. ej. anexo 3 `3.5`, `3.6`, … | El DOF **reutiliza el mismo `numero`** en más de un renglón del mismo anexo (35 colisiones detectadas). La unicidad en BD es por `orden` canónico, no por `numero`. | — |
| **16** | `3.5.1.4.3` | `<correo_electronico>`: patrón tipo regex con **espacios** dentro de la clase (`[0- 9]`, `_- '`). No se deriva ni se «arregla». Campo → `no_validado` por patrón. | `Patrón: ([A-Z][0-9]._-')+@([A-Z][0- 9]._- ')+` |
| 1, 2-A/B, 3, 5-A/B, 6–9, 11–13, 15 | `<correo_electronico>` (varios `numero`) | Mismo tipo de notación regex (algunos con espacios en la clase de caracteres). No se compila a mano. → `no_validado` por patrón. | p. ej. `Patrón: ([A-Z][0-9]._-')+@([A-Z][0-9]._-')+` |
| 11 | `3.7.1.2.10.2.3` | `<fecha_constitucion>`: tras `Patrón: AAAAMMDD` añade prosa de negocio («en otro caso, la clave debe ser congruente…»). El token `AAAAMMDD` sí es derivable; la prosa no se interpreta como regla adicional automática. | ver JSON |

## Notas de tratamiento en Ikán

1. **`Obligatiorio` / `Obligatiorio para…`**: el validador reconoce el prefijo
   `Obligat…` como obligatorio declarado, sin reescribir el texto almacenado. El
   texto original se preserva en `formato_oficial_campo.obligatoriedad`.
2. **`honeroso`**: se conserva literal. La condición permanece como
   «condicional no evaluable automáticamente» hasta que Cumplimiento confirme el
   texto.
3. **`1-200` como obligatoriedad**: se trata como no obligatorio base (no
   empieza por `Obligat`) y se deja `no_validado` si aparece en un flujo que
   exija interpretar la condición. No se mueve el valor a `longitud`.
4. **Variantes ortográficas de tipo** (`Alfabetica` / `Alfabético`,
   `Alfanumerico` / `Alfanumérico`, `Numerico` / `Numérico`): se almacenan tal
   cual; no se normalizan.
5. **Anexos 4, 10 y 14** ausentes en la extracción: registrados como
   `estado = pendiente` en `formato_oficial`. El informe sin operaciones
   (Anexo 14) **no se inventa**; el canal de presentación bloquea ese tipo
   mientras siga pendiente.
6. **Catálogos de valores** (salvo Anexo A): no vienen en el DOF. El mecanismo
   `catalogo_formato` existe vacío (`fuente = portal_uif`, `version = 0`). Un
   campo que dependa de ellos queda `no_validado`; nunca se acepta un valor
   libre como válido ni se presenta el aviso como verificado.
7. **Patrones correo / notación regex**: no se traduce a RegExp a mano ni se
   normaliza el valor del usuario. Quedan `no_validado` (mismo efecto que
   catálogo ausente: el aviso no se presenta como verificado). Corrección =
   nueva extracción o dictamen de Cumplimiento, no parche en JSON.

Fecha de este registro: 2026-10-02 (actualización patrones/correo). Cualquier
corrección debe versionarse de nuevo desde la extracción, no editarse a mano
en los JSON.
