# Sprint RCG-2026 · Fase 0 — Backlog

> Origen: Acuerdo 115/2026 (RCG que desarrollan la reforma LFPIORPI, DOF 07/ago/2026).
> Ver `Ikan-Nota-Tecnica-Arquitectura-RCG2026-v1.0-2026-08-10.docx` (carpeta de proyectos de
> Polo). Esta fase cubre lo que debe existir antes del **30 de noviembre de 2026**.
>
> Regla operativa: **bloque por bloque con checkpoint**. Cada bloque cierra con
> `npm run typecheck && npm run lint && npm run build` (y `npm run test` cuando aplique) en
> verde, y reporte al usuario antes de seguir. No inventar campos ni valores; mocks visibles
> con banner ámbar "DEMO — sin integración real".

## Estado de bloques

| Bloque | Descripción | Estado |
|--------|-------------|--------|
| RCG0.B0 | Evaluadores reales del Motor PLD (deuda D-3) | ✅ hecho |
| **RCG0.B0.1** | **Ingesta propia de listas abiertas (OFAC + GAFI + 69-B)** | ⏳ **nuevo — intercalar según dependencias** |
| **RCG0.B0b** | **Alta de cliente final por el Operador (Nivel 1)** | 🟡 captura hecha · matriz-score pendiente de fórmula |
| RCG0.B1 | SLA de 24h sobre hallazgos | ⏳ pendiente |
| RCG0.B2 | Ajustes al piloto XVI (jurisdicción + comisión) | ⏳ pendiente |
| RCG0.B3 | Modelo de datos para fideicomisos (solo modelo) | ⏳ pendiente |
| RCG0.B4 | Rol "Representante Encargado de Cumplimiento" | ⏳ pendiente |
| RCG0.B5 | Desarrollo Inmobiliario (V Bis) | ⛔ condicional — sin arrancar |
| RCG0.B6 | Smoke test de Fase RCG-0 | ⏳ pendiente |
| **RCG0.B3f** | **Expediente del acto: la captura alimenta el aviso** | ✅ **hecho** |
| **RCG0.B3g** | **Catálogos del layout: la lista sale de la base** | ✅ **hecho · 25 de 26 cargados** |
| **RCG0.B7** | **Consola de plataforma completa (admin de Ikán)** | ⏳ **nuevo — después de cerrar el demo** |
| **RCG0.B8.1** | **Bitácora encadenada** | ✅ **hecho** |
| **RCG0.B8.2** | **Anclaje en Bitcoin (OpenTimestamps)** | ⏳ **siguiente** |
| **RCG0.B8.3** | **Constancia NOM-151 (requiere PSC)** | ⛔ después del demo |

Decisiones confirmadas con Polo (2026-08-20):
- **B1**: el contador de 24h basta con que sea **visible** en el panel del OC (contador
  regresivo). Sin alerta proactiva push/email en esta fase.
- **B3**: solo el **modelo de datos** de fideicomisos; no se abre el flujo completo de captura
  (no hay prospecto concreto todavía).
- **B5**: se queda **condicional, sin arrancar** (sin prospecto del sector inmobiliario).

Pendiente de housekeeping (no es un bloque): añadir la migration que crea la tabla
`prospect_intake` (hoy solo la usa la Edge Function `on-prospect-intake`, sin migration en
`main`) para que `supabase db reset` no se rompa — se resuelve dentro de RCG0.B6.

---

## RCG0.B0 · Evaluadores reales del Motor PLD — ✅ hecho

Reemplazó el stub de `supabase/functions/motor-pld/index.ts` por evaluadores reales de
`regla_dsl`. Núcleo puro y testeado en `supabase/functions/motor-pld/evaluadores.ts`
(18 tests en `src/test/motor-evaluadores.test.ts`). Tipos soportados: `agregado`, `secuencia`,
`score`, `lookup` (por `fuentes` y por `valores`), `duplicado`, `desviacion`. Semilla DEMO
`07_operaciones_demo.sql` para que el motor genere hallazgos en el walkthrough. Sin cambios de
schema. Ver `docs/MOTOR_PLD.md` (sección "Estado RCG-0").

---

## RCG0.B0b · Alta de cliente final por el Operador (Nivel 1) — NUEVO

**Por qué existe:** el demo necesita mostrar el flujo lineal completo
`Operador captura cliente → captura operación → Motor PLD → OC consume`. Hoy el alta de cliente
final **no existe**: `ClientsPage.tsx` sigue con el mock de Lovable (`mockData.ts`) y no hay
`insert` a la tabla `client`. Sin este bloque no se puede decir que el **Nivel 1** esté cerrado.

**Orden (decisión):** va **inmediatamente después de B0 y antes de B1**. Razón: B0 ya se puede
probar contra la semilla DEMO, pero el resto de la narrativa del demo (y B1, que muestra el SLA
sobre hallazgos) gana muchísimo si el Operador puede capturar clientes y operaciones reales que
el motor procese en vivo. No bloquea a B2–B4 (que son schema + metadata), así que puede correr
en paralelo si hiciera falta.

**No inventa nada nuevo:** se apoya en lo que ya existe en el schema:
- Tabla `client` y `client_risk_assessment` (migration `0004`).
- Plantilla de matriz de riesgo XVI ya sembrada (`44444444-0000-0000-0000-000000000001`,
  seed `05`).
- RLS: `client_insert` / `operation_insert` exigen `capturado_por = auth.uid()` y rol
  `operador`/`oc`/`admin`.

**Alcance:**
- `src/lib/api/clientes.ts`: `crearCliente(...)` (insert en `client`) y
  `evaluarRiesgoCliente(...)` (insert en `client_risk_assessment` a partir de la plantilla),
  respetando `organization_id` y `capturado_por`.
- Formulario de alta del Operador (envolver/instrumentar `ClientsPage.tsx` + detalle):
  captura de persona física/moral con los campos de `client` (sin inventar campos nuevos),
  y paso de matriz de riesgo que calcula `score_total` y `clasificacion` con la plantilla XVI.
- Conectar la captura de operación (`OperationsPage.tsx`) al `insert` real en `operation`
  (hoy también mock), para que el Motor PLD tenga datos capturados por el Operador, no solo
  semilla.
- Acuse neutro tras capturar: "Operación registrada" (sin mencionar al OC, por `docs/ROLES.md`).

**Criterio de aceptación:**
- Un Operador autenticado puede dar de alta un cliente persona física y uno moral; el registro
  aparece en `client` con su `capturado_por` y `organization_id` correctos (RLS respetada).
- Al alta se le puede correr la matriz de riesgo XVI y queda un `client_risk_assessment` con
  `score_total` y `clasificacion`.
- El Operador puede registrar una operación para ese cliente; queda en `operation` y el Motor
  PLD la evalúa (produce hallazgo si dispara alguna tipología).
- Lo no integrado (Moffin/KYC externo) va con banner ámbar "DEMO — sin integración real".

**Decisión de Polo (2026-08-20):** la matriz es **acción separada, no forzada** en el alta; y el
alta se construye **sin score** por ahora (respuestas en crudo, score pendiente de fórmula).

**Estado real de lo entregado:**
- ✅ Capa de API: `src/lib/api/{contexto,clientes,operaciones}.ts` (crear/listar clientes y
  operaciones, invocar Motor PLD), resolviendo `organization_id`/`capturado_por` desde la sesión
  para cumplir RLS.
- ✅ `auth-context` ahora carga perfil/organización/roles reales de `user_profile`+`user_roles`
  (con fallback al inferido por email si no hay BD).
- ✅ UI: `ClientsPage` (lista real + diálogo de alta PF/PM, acuse neutro "Cliente registrado"),
  `OperationsPage` (lista real + diálogo que registra y dispara el motor, acuse "Operación
  registrada"), `ClientDetailPage` (datos + operaciones reales + captura de matriz).
- ✅ Helper puro `src/lib/riesgo/matriz.ts` + 5 tests (qué elementos/variables aplican por tipo
  de persona, captura completa).
- ⏳ **Pendiente — score de matriz:** el cálculo `score_total`/`clasificacion` NO se implementó
  (fórmula de ponderación no está en el repo; seed 06 inconsistente: subtotales 25 vs score 17).
  La matriz captura y muestra respuestas con banner ámbar "DEMO — score pendiente"; no persiste
  el assessment (además `client_risk_assessment` exige score NOT NULL). Se cierra cuando Polo
  confirme la fórmula (Excel Ixim Pay).
- ⏳ **Pendiente — smoke en vivo:** verificado con `typecheck/lint/build` + tests. El insert real
  contra RLS y la invocación del motor requieren correr contra el Supabase remoto (no hay entorno
  local en esta sesión). Queda para el smoke de RCG0.B6.

---

## RCG0.B0.1 · Ingesta propia de listas abiertas (OFAC + GAFI + 69-B) — NUEVO

**Por qué existe:** Polo definió una **arquitectura de dos capas** para las fuentes de
listas/país del Motor PLD, que se complementan (no es "nosotros vs. tercero"):

1. **Capa propia (este bloque):** Kawiil mantiene su propia ingesta de fuentes públicas y
   gratuitas, actualizada de forma continua, para no depender nunca por completo de un tercero.
2. **Capa de terceros (después, fuera de este bloque):** Zenpli u otros proveedores se conectan
   vía API como fuente **adicional**, sobre el mismo contrato de datos — nunca como reemplazo de
   la capa propia.

Este bloque es **solo la Capa 1**. La Capa 2 (conexión real a Zenpli/OpenSanctions) se diseña
cuando Polo cierre esa plática — aquí solo se deja el contrato listo para que sumarla después no
requiera rediseño.

**Alcance confirmado (mínimo viable, no ampliar sin avisar):** OFAC + GAFI + 69-B. ONU y UE
quedan documentadas como próxima fuente a automatizar, **NO** entran a este bloque. El score de
medios adversos (OSINT) tampoco entra — pendiente de proveedor
(ver `Ikan-Fuentes-Abiertas-Listas-y-OSINT-v1.0-2026-08-20.docx`).

**Regla de oro adicional:** la **frecuencia** de cada job (diaria/semanal/…) es propuesta
técnica, NO valor regulatorio → confirmar con Polo/Kawiil-Cumplimiento antes de fijarla en
producción. Igual el estado vigente de la lista GAFI a la fecha de siembra: verificarlo directo
contra fatf-gafi.org, no de fuentes secundarias ni de investigación previa.

### Contrato de datos común (documentar primero, antes de tocar más código)

Todas las fuentes se normalizan al mismo contrato, para que el evaluador `lookup` no dependa del
origen del match y para que sumar Zenpli/OpenSanctions luego sea *agregar una fuente*, no
rediseñar:

- **`lista_sancionada`** (o nombre que respete la convención del schema — evaluar si extiende
  `sanctions_list_entry` de `0003` antes de crear tabla nueva): `id`, `fuente`
  (`ofac_sdn` | `sat_69b`; futuros: `onu`, `ue`, `zenpli`, `opensanctions`), `tipo_entidad`
  (persona/empresa), `nombre`, `identificadores` (RFC/pasaporte/alias, JSON), `pais`,
  `fecha_publicacion_fuente`, `fecha_ingesta`, `raw_payload` (snapshot inmutable del registro
  original — mismo principio que `hallazgo`), `activo` (boolean — no borrar los que salen de una
  lista; desactivar conservando historial).
- **`lista_jurisdiccion_riesgo`** (puede vivir como extensión de `country_risk_list` de `0003`
  si el schema lo permite — evaluar antes de crear tabla): `pais_iso`, `categoria`
  (`negra` | `gris`, GAFI), `fecha_vigencia_desde`, `fuente` (`gafi`), `fecha_actualizacion`.

### Sub-bloques

1. **Ingesta OFAC (automatizada):** job programado que descargue el XML SDN oficial (Sanctions
   List Service, gratuito, sin auth) y lo normalice a `lista_sancionada` con `fuente='ofac_sdn'`.
   Mecanismo sugerido: Edge Function + `pg_cron` (o el scheduler que ya use el proyecto —
   confirmar antes de introducir pieza nueva). Idempotente: cada corrida compara contra el
   snapshot previo y **desactiva** (no borra) lo que ya no aparece, preservando `raw_payload`.
   Frecuencia propuesta: diaria — **PENDIENTE_CONFIRMAR**.
2. **Ingesta SAT 69-B (automatizada):** job que consulte el listado público 69-B (EFOS/EDOS) y
   lo normalice a `lista_sancionada` con `fuente='sat_69b'`. **Etiquetar claramente** que el
   69-B es de naturaleza **fiscal** (operaciones simuladas), no una sanción AML pura, para que
   el OC no lo confunda. Mismo patrón de idempotencia; frecuencia **PENDIENTE_CONFIRMAR**.
3. **Carga de GAFI (manual, por diseño — no automatizar):** pantalla de Admin o script para que
   Kawiil-Cumplimiento actualice `lista_jurisdiccion_riesgo` cuando el GAFI publique (PDF, 3x/año:
   plenarias feb/jun/oct). **No** construir scraper de PDF (frecuencia no lo justifica, riesgo de
   mal-parseo > ahorro). Estado vigente: verificar directo en fatf-gafi.org.
4. **Conectar el evaluador `lookup`:** que XVI-04 consulte `lista_jurisdiccion_riesgo`, y que un
   evaluador (extensión de tipología existente o nueva, según el DSL actual) consulte
   `lista_sancionada` por nombre/identificador del cliente. **Aquí el hallazgo deja de ser mock
   y pasa a ser real**, citando fuente y fecha de la corrida que lo detectó.
5. **Diseño para sumar terceros (documento, no código):** documentar cómo una fuente
   `api_externa` (Zenpli/OpenSanctions) se agrega a la misma tabla/contrato **sin tocar** el
   evaluador del sub-bloque 4 — dejando explícito que es aditivo, no un reemplazo futuro.

**Fuera de alcance de B0.1:** ONU y UE (documentadas como próximas); OSINT/medios adversos
(pendiente de proveedor, no se construye en casa); conexión real a Zenpli/OpenSanctions (solo se
documenta el diseño en el sub-bloque 5).

**Relación con B0:** B0 dejó el evaluador `lookup` funcionando contra el catálogo sembrado
(`country_risk_list`) con marca mock. B0.1 sustituye ese mock por ingesta propia real y conecta
`lista_sancionada` por nombre. Se intercala con B0b/B1 según dependencias, sin orden forzado.

---

## Bloques RCG0.B1–B6

El detalle de B1–B6 vive en la nota de backlog original de esta fase (mensaje de arranque del
Sprint RCG-0) y en `Ikan-Nota-Tecnica-Arquitectura-RCG2026-v1.0-2026-08-10.docx`. Resumen de
cada uno arriba en la tabla de estado. Cada bloque se detalla aquí a medida que se arranca,
para no duplicar la fuente regulatoria.


---

## RCG0.B7 · Consola de plataforma completa — NUEVO

**Decisión de Polo (2026-08-29):** es un **bloque propio**, no un apéndice de las
listas, y se toma **cuando el demo esté cerrado**. Queda anotado aquí para que
no dependa de la memoria de nadie.

Hoy la consola de Kawiil (`/admin`, despliegue aparte) tiene dos secciones:
listas restrictivas y parámetros regulatorios. Para ser lo que Polo describe
—«un sistema para administrar y revisar las aplicaciones de todos los usuarios
y sistemas Ikán en uso»— le falta:

- **Organizaciones.** Alta, estado, qué fracciones opera, perfil de actividad.
  Hoy sólo se crean por SQL.
- **Usuarios por organización.** Alta, roles, desactivación. Hoy es
  `bootstrap_usuario_*.sql` a mano.
- **Prospectos.** Los del formulario público caen en `prospect_intake`, que
  además **no tiene migration** y que nadie mira. Es el embudo roto que se
  documentó en el primer diagnóstico.
- **Uso por organización.** Operaciones, hallazgos, verificaciones consumidas y
  su costo. Es lo que permite cobrar y dimensionar.
- **Salud de la plataforma.** Corridas del job, errores sin atender, últimas
  cargas por fuente, migrations aplicadas por proyecto.

**Regla que ya rige y que este bloque debe respetar:** las organizaciones
cliente **consumen**; sólo Kawiil escribe. La RLS lo impone desde la 0012, y
`platform_admin` (0008) es el privilegio, que cruza organizaciones y no es un
rol de organización.

**Relación con Didit (RCG0.B8, pendiente):** la consola es también donde se
verá el consumo de verificaciones y su costo, así que conviene diseñar las dos
cosas sabiendo que comparten pantalla.

---

## RCG0.B3f · El expediente del acto se arma mientras el notario trabaja — ✅ hecho

**Por qué existe:** el aviso se arma el mes siguiente; el notario captura el día
que firma. El alta de un acto guardaba compareciente, monto, tipo de acto y país;
el layout de fe pública pide además número de instrumento, fecha del acto y la
persona que solicita la formalización con apellidos por separado, fecha de
nacimiento, RFC y CURP. Faltando eso, el día 17 hay que volver al protocolo.

**Qué entró:**
- Migration `0019`: claves del padrón SAT en `organizations`; nombre en partes,
  fechas de nacimiento y constitución, clave de país y clave de actividad
  económica en `client`; `instrumento_publico` y `datos_acto` en `operation`.
  Trigger que recompone el nombre de despliegue desde las partes.
- Diccionario **generado** desde el instructivo del SAT (518 campos) —
  `scripts/generar-campos-fep.mjs`, para no transcribir a mano.
- `src/lib/aviso/completitud.ts`: qué falta, con qué gravedad y en qué momento,
  citando el número de campo del instructivo.
- Panel de pendientes en el alta de compareciente, en el alta de acto y columna
  "Expediente" en la lista de actos.
- Claves del padrón visibles (sólo lectura) en Configuración.

**Detalle y decisiones:** `docs/EXPEDIENTE_DEL_ACTO.md`.

**Lo que deja abierto (siguiente bloque):** captura del subárbol de cada tipo de
acto (grupos repetidos de intervinientes) y carga de los catálogos de la UIF.
Ambos con banner ámbar visible, no en silencio.

---

## RCG0.B3g · Catálogos del layout — ✅ hecho (registro completo, carga pendiente de archivos)

**Por qué existe:** donde el aviso pide una clave de catálogo, la captura era
texto libre. Quien captura no se sabe de memoria el número de su estado, y el
portal rechaza el aviso completo si la clave no existe.

**Qué entró:** `catalogo_sat` + `catalogo_valor` con vigencias (reemplazar cierra,
no borra), `reemplazar_valores_catalogo()` restringida a Kawiil, RLS de sólo
lectura para los clientes, `<SelectCatalogo>` que guarda la clave y degrada a
captura manual con banner ámbar cuando el catálogo no está cargado, y pantalla de
carga en la consola de plataforma con previo y validación de formato.

**Estado real:** 26 catálogos registrados, **25 cargados con 924 claves reales**.
Salieron de la hoja oculta `Combos` de las plantillas de captura que publica el
propio SAT (`Fedatario*.xlsm`), no de fuentes secundarias. Falta sólo el de
códigos postales (32,353 valores), que se carga desde la consola con
`docs/catalogos-uif/codigos_postales.csv`.

**De paso:** apareció `FEP` como clave de actividad vulnerable de una notaría
(`AVI` para un exchange), uno de los tres campos que impedían generar cualquier
aviso. Sembrado en las dos organizaciones demo.

**Detalle:** `docs/CATALOGOS_LAYOUT.md`.

---

## RCG0.B8 · Trazabilidad y anclaje

Diseño completo en `docs/TRAZABILIDAD_Y_ANCLAJE.md`. Decisiones de Polo
(2026-08-29): ancla con **OpenTimestamps**, NOM-151 **después del demo**.

### B8.1 · Bitácora encadenada — ✅ hecho

Un solo flujo de eventos encadenado por hashes, emitido por triggers para que
ninguna ruta se lo salte. Detecta alteración, borrado y truncamiento; se
verifica dos veces (base y navegador) y se exporta para que un tercero
recalcule sin nuestra API. Deja escrito —y probado— su propio límite: la cadena
sola no detecta que se reescriba entera, y para eso es B8.2.

De paso cerró dos funciones `SECURITY DEFINER` que PostgreSQL había dejado
abiertas a `PUBLIC`: `registrar_evento` y `emitir_folio_hallazgo`.

Detalle: `docs/BITACORA_ENCADENADA.md`.

### B8.2 · Anclaje con OpenTimestamps — ⏳ siguiente

Raíz Merkle diaria sobre los eventos nuevos, sellada en Bitcoin. Sin datos
personales: sólo la raíz. Paquete de verificación con el `.ots`.
Cadencia **PENDIENTE_CONFIRMAR**.
