# Nota de Cumplimiento — Formatos oficiales UIF (corrida 1–2 oct 2026)

Espejo de `/cursor/stores/self/docs/nota-cumplimiento-formatos-uif.md`.

## Qué quedó

1. **Fuente de verdad** en repo: `docs/formatos-uif/` (19 anexos JSON + Anexo A + `index.json` + `INCONSISTENCIAS.md`).
2. **Catálogo versionado en BD** (`formato_oficial`, `formato_oficial_campo`) con vigencia por régimen (`nov_2026` / `dic_2026` / `jun_2027` / `jul_2027`) y por fecha del acto.
3. **Carga verificada en remoto** (`cibpguwwggwzdhhpdomz`): **19 anexos activos, 3 pendientes (4/10/14), 4008 campos, 250 fracciones Anexo A**.
4. **Perfil de actividad vulnerable** por organización (`organizacion_actividad_vulnerable`). Sin perfil vigente, triggers y API bloquean alta de cliente/operación. Demos Ixim Pay (XVI→16) y notarías (XII→12-A) sembrados.
5. **Máquina de estados de aviso** ampliada; acuse de rechazo → `acuse_rechazo` (no cierra). Documentos inmutables en `aviso_documento` (XML/huella/acuse).
6. **Validación campo a campo** (longitud exacta/min-máx, patrón DOF L/A/M/D/9/X, tipo), reloj 24 h, canal de presentación manual, modificatorio 1×/30 días, mensual sin operaciones bloqueado mientras Anexo 14 esté pendiente.
7. **Constancia de configuración** al cambiar el perfil AV.
8. **Tipos TypeScript** regenerados contra el esquema remoto vigente (`src/types/database.ts`).
9. **Pruebas** en `src/test/formatos-uif.test.ts`, `src/test/revision-pr25-criticos.test.ts`, `src/test/validacion-2-4-formatos-uif.test.ts`.

## Clasificación del hallazgo (criterio 2.6) — honestidad

Mientras Cumplimiento no dicte un criterio operable que mapee hallazgos del Motor PLD a `tipo` / `prioridad` / `tipo_alerta` del formato oficial, **Ikán no asigna esos valores por defecto, plantilla ni heurística**. Los determina el Oficial de Cumplimiento caso a caso al armar el aviso, y el sistema debe registrar **quién**, **con qué fundamento** y **cuándo**. Inventar una clasificación automática sin ese dictamen sería incumplimiento de diseño, no un atajo útil.

## Supuestos

- Los textos del DOF (incluidas erratas) se persisten literales; no se «arreglan».
- Unicidad de campos por `orden` (el DOF reutiliza `numero` dentro del mismo anexo).
- Catálogos de valores UIF del Portal (art. 9) **no** están cargados: mecanismo vacío; campos dependientes = `no_validado`; no se presenta como verificado.
- Patrones correo con notación regex/espacios → `no_validado` (registrados en `INCONSISTENCIAS.md`); no se adivina el regex.
- Canal de presentación: sólo `manual` (banner DEMO). Sin API a la autoridad.
- El generador XML vigente del producto sigue siendo el layout FEP heredado; los formatos DOF 24/09/2026 quedan como catálogo/validación/proceso. El XML nativo «contra anexo 16» queda fuera de este alcance.

## Pendientes

| Ítem | Estado |
|---|---|
| Anexos 4, 10 y **14** (informe sin operaciones) | `pendiente` — no inventados |
| Catálogos de valores UIF (Portal, art. 9) | Mecanismo listo, sin datos |
| Anexos A/B de alta y registro (otra Resolución) | Fuera de alcance |
| Generador XML nativo por anexo DOF 2026 | Fuera de alcance de esta corrida |
| Clasificación automática hallazgo → alerta/prioridad | Bloqueada a dictamen Cumplimiento (véase §2.6) |

## Migraciones

`0076` formatos · `0077` perfil/avisos/documentos · `0078` demos/pendientes · `0079` unicidad por orden · `0080` plazo 24 h inmutable + `incumplido`.

Seed: `24_formatos_oficiales_uif.sql` (generado; verificación dura 4008/250).
