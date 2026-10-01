---
cursor:
  subagentId: "bc-3d020562-dd6a-53a4-9f85-188a9db8ebd0"
---

# Revisión PR #25 — Formatos oficiales UIF

**PR:** https://github.com/Lbassoco95/yoltik-ikan/pull/25  
**Rama:** `cursor/formatos-oficiales-uif-ebd0` @ `967bc49`  
**Fecha de revisión:** 2026-10-01  
**Alcance:** criterios de aceptación Bloques 1–3. No se tocó `docs/formatos-uif/`.

Método: ejecución de funciones con `npx tsx`, consultas SQL al remoto `cibpguwwggwzdhhpdomz`, lectura de rutas de código de extremo a extremo. Suite verde no se tomó como evidencia.

---

## Tabla de veredictos

| ID | Criterio | Veredicto |
|---|---|---|
| **1.1** | Vigencia por fecha del acto | **DEFECTO** |
| **1.2** | Contador 24h desde conocimiento | **DEFECTO** |
| **1.3** | Acuse rechazo / aceptación / incumplido | **DEFECTO** |
| 2.1 | Conteo remoto 4008/250/19 | **CONFIRMADO** |
| 2.2 | Catálogo como dato | **CONFIRMADO** |
| 2.3 | Perfil AV | **CONFIRMADO** (parcial UI) |
| 2.4 | Validación previa (RFC/cond/long/patrón/alerta) | **DEFECTO** |
| 2.5 | Catálogos ausentes → no_validado | **CONFIRMADO** |
| 2.6 | Clasificación del hallazgo | **NO VERIFICABLE** |
| 2.7 | Documentos inmutables + huella al descargar | **CONFIRMADO** (código; 0 filas en remoto) |
| 2.8 | Mensual / modificatorio | **CONFIRMADO** (biblioteca + bloqueo Anexo 14) |
| 2.9 | Canal presentación 3 ops | **CONFIRMADO** |
| 2.10 | Trazabilidad + constancia | **CONFIRMADO** |
| 3.1 | Anexo 14 contenido | **CONFIRMADO** (pendiente, no inventado) |
| 3.2 | Catálogos vacíos ≠ sin restricciones | **CONFIRMADO** |
| **3.3** | XML nativo DOF 2026 vs validado | **DEFECTO** (grave) |
| 3.4 | `database.ts` desfasado | **DEFECTO** |

**Línea de merge (críticos) — pre-corrección:** 1.1 / 1.2 / 1.3 **DEFECTO**.  
**Post-corrección (este commit):** pruebas `src/test/revision-pr25-criticos.test.ts` — **10/10 pasan** (1.1, 1.2, 1.3, 3.3). Ver sección «Correcciones aplicadas».

---

## Bloque 1 — detalle

### 1.1 Vigencia por fecha del acto — DEFECTO

**Esperado:** el régimen se resuelve con la fecha del acto; captura en enero-2027 de un acto del 15-nov-2026 → `nov_2026`. Modificatorio el 20-jun-2027 admite formato anterior; el 2-jul-2027 ya no.

**Observado (biblioteca, ejecutado):**

```text
resolverRegimen('2026-11-15').regimen = 'nov_2026'
resolverRegimen('2027-06-20').admiteModificatorioFormatoAnterior = true
resolverRegimen('2027-07-02').admiteModificatorioFormatoAnterior = false
resolverRegimen('2027-07-02').formatosAnterioresRetirados = true
```

Firma de `resolverRegimen` (`src/lib/formatos-uif/vigencia.ts:52`): sólo `fechaActo`; no recibe fecha de captura ni `Date.now()` para el régimen.

**Ocurre en la ruta de producto:**

- `guardarAviso` (`src/lib/api/avisos.ts:198–225`) inserta `layout: 'fep'` y **no** escribe `fecha_acto` ni `regimen_aplicado` (columnas creadas en `0077`).
- `ReportsPage` genera con `layout_version: "fep"` y no llama a `resolverRegimen`.
- No hay prueba ni flujo que demuestre “capturado ene-2027” vs acto nov-2026 en persistencia.

**Dónde:** `src/lib/api/avisos.ts`, `src/pages/ReportsPage.tsx`, ausencia de uso de `regimen_aplicado`.

**Consecuencia cumplimiento:** un aviso puede persistirse sin anclar el régimen a la fecha del acto; la vigencia queda en una función suelta, no en el acto presentado.

---

### 1.2 Contador 24h desde conocimiento — DEFECTO

**Esperado:** reloj desde hora de conocimiento (no `created_at`/`generado_en`); caso conocimiento ayer 18:00 capturado hoy; inmutable tras generado; aviso 24h sin operación celebrada.

**Observado (biblioteca, ejecutado):**

```text
conocimiento = 2026-09-30T18:00:00-06:00 → ISO 2026-10-01T00:00:00.000Z
ahora        = 2026-10-01T10:00:00-06:00
restanteH    = 8
etiqueta     = "Quedan 08:00:00 para presentar (24 h desde el conocimiento)"
puedeAbrirAviso24h({ operacionCelebrada:false }).ok = true
exports reloj-24h = [etiquetaReloj, iniciarReloj24h, puedeAbrirAviso24h]
```

(8 h restantes = correcto: límite 24h desde 18:00 = 18:00 del día siguiente; a las 10:00 del día siguiente quedan 8 h.)

**Ocurre en la ruta de producto:**

- `Contador24h` existe en `src/components/aviso/Contador24h.tsx` y **no tiene ningún import** en páginas (sólo su definición).
- Columnas `fecha_conocimiento` / `plazo_limite_24h` existen en migración `0077` pero **ningún** `src/lib/api/*.ts` ni `ReportsPage` las escribe.
- No hay API de alta de aviso `tipo: '24h'`; `guardarAviso` fija `tipo: 'mensual'`.
- No hay mecanismo de inmutabilidad de `plazo_limite_24h` tras estado `generado` (ni trigger ni guard en app).
- Exports del módulo no incluyen congelar/leer plazo persistido.

**Dónde:** componente huérfano; hueco en `avisos.ts` / UI OC.

**Consecuencia cumplimiento:** el OC no ve contador anclado al conocimiento; el plazo puede recalcularse desde “ahora” si alguien montara el componente sin persistir; no hay flujo 24h operable.

---

### 1.3 Acuse rechazo / aceptación / incumplido — DEFECTO

**Esperado:** rechazo deja aviso abierto + contador original; aceptación cierra con folio; rechazado y vencido = incumplido.

**Observado (biblioteca, ejecutado):**

```text
acuseCierraAviso('rechazo') = false ; estadoTrasAcuse('rechazo') = 'acuse_rechazo'
acuseCierraAviso('aceptado') = true  ; estadoTrasAcuse('aceptado') = 'acuse_aceptado'
transicionPermitida('acuse_rechazo','cerrado') = false
transicionPermitida('acuse_aceptado','cerrado') = true
```

`registrarAcuseManual` pone `estado = acuse_aceptado | acuse_rechazo` y guarda texto libre en documento `acuse` (`src/lib/api/formatos-uif.ts`).

**Fallos respecto al criterio:**

1. **Contador original tras rechazo:** no hay contador cableado ni `plazo_limite_24h` persistido → no se puede conservar.
2. **Aceptación cierra con folio:** pasa a `acuse_aceptado`, **no** a `cerrado`; el “folio” es textarea libre (`acuseTexto`), sin campo `folio` estructurado ni validación de folio de autoridad.
3. **Rechazado vencido = incumplido:** `rg incumplido` en `src/` y migraciones → **0 coincidencias**. No existe estado ni bandera.

**Dónde:** `presentacion.ts`, `formatos-uif.ts` API, `CanalPresentacionManual.tsx`, ausencia de estado `incumplido`.

**Consecuencia cumplimiento:** un rechazo vencido no se distingue de uno dentro de plazo; un aceptado no queda cerrado con folio auditables como acto terminal.

---

## Bloque 2 — detalle

### 2.1 Conteo remoto — CONFIRMADO

SQL en `cibpguwwggwzdhhpdomz` (2026-10-01):

```text
anexos_activos=19  anexos_pendientes=3  campos=4008  fracciones=250
```

### 2.2 Catálogo como dato — CONFIRMADO

Tablas `formato_oficial` / `formato_oficial_campo` / `catalogo_formato` (+ seed generado). Campos no hardcodeados en TS de negocio; JSON en `docs/formatos-uif/` y filas en BD.

### 2.3 Perfil AV — CONFIRMADO (con matiz UI)

- Trigger `trg_bloqueo_sin_perfil_client/operation` en `0077`.
- Remoto: `perfiles_av=2`.
- API `crearCliente`/`crearOperacion` consultan `organizacionTienePerfilAv`.
- UI ClientsPage deshabilita alta si `perfilAv.data === false`.

### 2.4 Validación previa — DEFECTO

Ejecutado contra `validarCampo`:

| Caso | Esperado | Observado |
|---|---|---|
| RFC PF 12 chars, longitud declarada `13` | error | **`ok`** |
| RFC 13 chars | ok (longitud) | `ok` |
| Patrón `LLLLAAMMDDXXX` | validar o marcar no_validado | `patronDeclarado` → **`null`** (no ejecuta) |
| Alerta 10 chars, longitud `15-3000` | error (mín. 15) | **`ok`** (sólo se chequea máximo=3000) |
| Condicional «Obligatorio para caso de inmuebles» vacío | no_validado / no inventar | `no_validado` ✓ |

**Dónde:** `src/lib/formatos-uif/validacion.ts` — `longitudMaxima` ignora mínimo de rangos; longitud exacta no exige igualdad; patrones DOF tipo LLLL no se aplican.

**Consecuencia:** avisos pueden marcarse válidos en longitud/patrón cuando el portal los rechazaría.

### 2.5 Catálogos ausentes — CONFIRMADO

Prueba y ejecución: catálogo vacío → `no_validado`; `verificado=false` si hay no_validados. `decidirPresentacion` advierte y no marca `comoVerificado`.

### 2.6 Clasificación del hallazgo — NO VERIFICABLE

**Insumo faltante:** no hay en el PR un módulo que clasifique hallazgos del Motor PLD contra tipologías/formatos UIF 2026 (prioridad/alerta del aviso). `rg clasific` en `src/lib/formatos-uif` y `components/aviso` no muestra esa capa. Sin especificación operable en el diff, no se simula.

### 2.7 Documentos inmutables + huella — CONFIRMADO (código)

- `aviso_documento`: INSERT OC; `revoke update, delete` authenticated (`0077`).
- `CanalPresentacionManual.descargar` → `registrarDocumentoAviso` con `sha256`.
- Remoto: `docs=0` (aún no ejercido en prod); constancias=4.

### 2.8 Mensual / modificatorio — CONFIRMADO

- `decisionMensualSinOperaciones` + botón Informe en ceros deshabilitado (Anexo 14).
- `puedeCrearModificatorio` 1×/30 días (biblioteca + trigger SQL `validar_modificatorio_ventana`).

### 2.9 Canal presentación 3 ops — CONFIRMADO

UI `CanalPresentacionManual`: (1) generar/descargar XML, (2) confirmar presentación, (3) registrar acuse. Banner DEMO. Montado en `ReportsPage` cuando hay avisos.

### 2.10 Trazabilidad + constancia — CONFIRMADO

- Trigger bitácora en `aviso_documento` y `organizacion_config_constancia`.
- Trigger `constancia_al_configurar_av` al perfil AV.
- Remoto: `constancias=4`.

---

## Bloque 3 — detalle

### 3.1 Anexo 14 contenido — CONFIRMADO

`formato_oficial` estado `pendiente` para código `14`; UI y `decisionMensualSinOperaciones` bloquean informe sin operaciones. No hay campos inventados del Anexo 14.

### 3.2 Catálogos vacíos ≠ sin restricciones — CONFIRMADO

Campos con catálogo ausente → `no_validado`; no se acepta valor libre como válido; presentación no verificada.

### 3.3 XML nativo DOF 2026 vs validado — DEFECTO (grave)

**Esperado:** si se valida contra formatos DOF 24/09/2026, el XML emitido debe ser esa estructura (o no presentarse como validado contra ella).

**Ocurre:**

- Generación: `generarAvisoXml` documentado como layout **fe pública SPPLD** (`src/lib/aviso/generador-xml.ts:1–20`).
- Persistencia: `layout: 'fep'`, `layout_version: "fep"` (`avisos.ts` / `ReportsPage.tsx:146`).
- En la misma pantalla se monta `CanalPresentacionManual` con mensaje de catálogos UIF DOF y `validacion.ok: true` hardcodeado en `ReportsPage` (aprox. líneas 570–590), sin validar el XML contra `formato_oficial_campo`.

**Consecuencia cumplimiento:** riesgo de presentar un XML de régimen anterior creyendo (o mostrando) cobertura del formato nuevo.

### 3.4 `database.ts` desfasado — DEFECTO

Observado en `src/types/database.ts`:

```text
estado_aviso: "borrador" | "listo_firma" | "enviado" | "acusado"
tipo_aviso: "24h" | "mensual"
```

No aparecen `formato_oficial`, `aviso_documento`, `organizacion_actividad_vulnerable`, ni estados `validado|generado|presentado|acuse_rechazo|…`. API nueva usa `supabase as any`.

---

## Correcciones aplicadas (sólo 1.1, 1.2, 1.3, 3.3)

Pruebas en `src/test/revision-pr25-criticos.test.ts`: **9 fallos → 10 pases** tras el fix.

| ID | Cambio | Prueba |
|---|---|---|
| 1.1 | `regimenDelActo(fechaActo, fechaCaptura?)` ignora captura; `guardarAviso` persiste `fecha_acto` + `regimen_aplicado` | acto nov + captura ene; mod 20-jun / 2-jul |
| 1.2 | `abrirPlazo24h` / `relojDesdePlazoPersistido` / `puedeMutarPlazo24h`; `abrirAviso24h` API; trigger `0080` inmutabilidad; `Contador24h` usa plazo persistido | 18:00→10:00 = 8 h; mutación prohibida tras generado; sin operación |
| 1.3 | `estadoTrasAcuseConFolio` (aceptado→`cerrado`+folio; rechazo conserva plazos; vencido→`incumplido`); enum `incumplido` | rechazo abierto; folio obligatorio; incumplido |
| 3.3 | `xmlCompatibleConFormatoOficial` + gate en `decidirPresentacion`; ReportsPage no declara `ok/verificado` contra DOF si layout=fep | fep+dof bloqueado |

Migración nueva: `0080_plazo_24h_inmutable_e_incumplido.sql` (aplicada también en remoto).

## Sin corregir (Bloque 2 y resto de 3) — propuesta

| ID | Propuesta |
|---|---|
| 2.4 | Enforzar longitud mínima de rangos y longitud exacta; compilar o marcar `no_validado` patrones LLLL no ejecutables. |
| 2.6 | Definir con Cumplimiento el mapa hallazgo→alerta/prioridad del formato; implementar clasificador. |
| 3.1 | Cargar Anexo 14 cuando exista extracción (sin inventar). |
| 3.4 | `npm run supabase:gen:types` tras migraciones y quitar cast `any`. |

## NO VERIFICABLE — insumos

| ID | Insumo faltante |
|---|---|
| 2.6 | Especificación/criterio de “clasificación del hallazgo” operable en código del PR (no hay módulo ni brief embebido). |
