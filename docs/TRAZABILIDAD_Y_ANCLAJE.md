# Trazabilidad, certificación y anclaje — diseño

> Documento de decisión y estado. **B8.1 construido** (migration 0021).
> **B8.2 construido, aplicado en producción y comprobado en vivo** el 30 de
> agosto de 2026. B8.3 (NOM-151) y B8.4 (espejo en L2) siguen sin construir.

## Qué se está pidiendo, dicho con precisión

Que cada paso quede **registrado, certificado y verificable por un tercero**, y
que los datos con los que después se hace inteligencia sean **detectablemente no
manipulables**.

Vale la pena separar dos afirmaciones que suenan igual y no lo son:

| Se puede afirmar | No se puede afirmar |
|---|---|
| «Cualquier alteración posterior del registro es **detectable** y **demostrable** ante un tercero, sin que Ikán coopere» | «Los datos no se pueden manipular» |
| «Este dato existía el día D, con esta forma exacta» | «Este dato es verdadero» |

Una cadena de bloques certifica lo que le entregaron. Si el operador capturó un
monto falso, queda un monto falso certificado para siempre — *garbage in,
garbage inmutablemente preservado*. En un producto de cumplimiento, prometer lo
segundo es un pasivo, no un argumento de venta. Lo que sí se promete —detección
y prueba— es exactamente lo que un auditor, la UIF o un perito necesitan.

## La parte difícil ya está hecha

Un ancla sobre datos mal identificados no sirve de nada. Lo que da valor a la
prueba es la **procedencia**: no «el monto es 1,500,000», sino «el monto es
1,500,000, capturado por el usuario X el día D, evaluado por el motor v3 contra
el catálogo v2 y la UMA vigente ese día, confirmado por el OC Y». Eso ya existe
en Ikán y costó los últimos bloques:

- `parametro_regulatorio` — UMA y umbrales con vigencia; un acto de 2025 se juzga
  con la UMA de 2025.
- `catalogo_valor` — claves con vigencia; `catalogo_en_fecha()` reconstruye el
  catálogo de cualquier día.
- `lista_movimiento` — bitácora inmutable de altas y bajas por oficio.
- `operation.motor_version_aplicada`, `hallazgo_bitacora`, `audit_log`.

El anclaje criptográfico es la cereza barata encima de eso, no el plato.

## Las cuatro capas

### Capa 0 · Un solo flujo de eventos

Hoy la evidencia está repartida en `audit_log`, `hallazgo_bitacora` y
`lista_movimiento`, y varias acciones no dejan rastro. Se necesita **un** flujo
canónico que cubra todo lo que importa: alta de compareciente, captura de acto,
corrida del motor, hallazgo creado o cambiado, carga de catálogo o lista,
generación y firma del aviso.

Cada evento carga su procedencia, que es lo que lo vuelve evidencia:

- `origen`: persona | motor | job | proveedor externo
- `versiones`: motor, catálogo, lista, parámetro vigente al momento
- `atestiguado_por`: quién lo firmó (OC, admin)

### Capa 1 · Bitácora encadenada

```
evento_hash  = SHA256( json_canónico(payload) || nonce )
cadena_hash  = SHA256( cadena_hash_anterior || evento_hash || secuencia )
```

Append-only por trigger — UPDATE y DELETE prohibidos, el mismo patrón que ya usa
`lista_movimiento`. A partir de aquí, **borrar o alterar un evento pasado rompe
la cadena y se detecta recalculando**.

Costo: cero. Dependencias externas: ninguna. Aquí está la mayor parte del valor.

Su límite, dicho sin adornos: una cadena dentro de la base que nosotros
administramos prueba consistencia interna, no que *nosotros* no la reescribimos
entera. Eso lo arregla la capa 2.

### Capa 2 · Anclaje externo — «el blockchain»

Cada cierto tiempo se calcula la **raíz Merkle** de los eventos desde el último
anclaje y se publica esa raíz donde ya no la podamos cambiar. Un solo valor de
32 bytes certifica miles de eventos, y **ningún dato personal sale**.

Dos caminos, no excluyentes:

| | OpenTimestamps (Bitcoin) | Transacción en L2 (Polygon / Arbitrum) |
|---|---|---|
| Costo | Cero | Centavos por anclaje |
| Llaves / tesorería | No hace falta ninguna | Hay que custodiar una llave y saldo |
| Prueba | Archivo `.ots` con la ruta Merkle al bloque | Hash en el calldata de una transacción |
| Verificable sin nosotros | Sí, con cualquier nodo de Bitcoin | Sí, en el explorador |
| Se puede enseñar a un cliente | Requiere explicar el `.ots` | Un enlace y se acabó |
| Confirmación | ~2 horas | Segundos |

**Recomendación: OpenTimestamps como ancla real** —gratis, sobre la cadena más
creíble, sin tesorería que custodiar ni token que explicar— **y una transacción
en L2 sólo si se quiere el enlace que se enseña**. Lo que da la garantía es el
`.ots`; el enlace es presentación.

### Capa 3 · NOM-151 — la que tiene peso legal en México

Un ancla en Bitcoin es prueba técnica. Ante el SAT, la UIF o un juez mexicano, lo
que tiene fuerza reconocida es la **Constancia de Conservación de Mensajes de
Datos** de la **NOM-151-SCFI-2016** (DOF 30/03/2017), emitida por un **PSC**
autorizado por la Secretaría de Economía. Es el mecanismo que reconoce el Código
de Comercio para conservar mensajes de datos, y usa SHA-256 y estampado de
tiempo.

Al cerrar un expediente o enviar un aviso se pide la constancia sobre el paquete
canónico y se guarda junto al expediente. Se complementa con la capa 2: la
constancia es lo que se le muestra a la autoridad; el ancla es lo que permite
verificar sin depender de que el PSC siga existiendo dentro de diez años.

Esto **requiere contratar un PSC** — decisión de Polo, no técnica.

### Capa 4 · Verificación que no dependa de nosotros

Una pantalla de verificación y, sobre todo, un **paquete descargable**: JSON
canónico de los eventos, ruta Merkle, referencia del anclaje y archivo `.ots`.
Cualquiera lo recalcula por su cuenta.

Si para verificar hay que preguntarle a la API de Ikán, todo el ejercicio es
teatro: se estaría pidiendo confiar justo en quien se quiere auditar.

## Privacidad: la restricción dura

El expediente trae CURP, RFC, domicilio y —peor— hallazgos de PLD. El deber de
reserva del artículo 38 de la LFPIORPI y la prohibición de alertar hacen que
revelar que alguien fue reportado sea un delito.

Por eso:

- **Nunca sale un dato personal.** Sólo raíces Merkle.
- **Nunca sale el hash de un nombre suelto.** El espacio de nombres es pequeño y
  un hash así se rompe por fuerza bruta. Se hashea el registro completo con un
  `nonce` aleatorio.
- **Nunca sale un identificador de cliente**, ni siquiera opaco: la sola
  frecuencia de anclajes sobre un mismo identificador filtra información.

## Lo que NO hay que hacer

- **Cadena privada o permisionada** (Hyperledger y parientes). Sería correr
  consenso entre nodos que controlamos nosotros: no prueba nada más que una
  cadena de hashes y cuesta cien veces más operarla.
- **Un token, o «cada expediente es un NFT».** No agrega prueba y agrega
  superficie regulatoria — justo en la fracción XVI que ya operamos.
- **Anclar cada evento por separado.** Cuesta más y filtra el volumen de
  operación de cada cliente.
- **Decir «los datos no se pueden manipular».** Se dice «cualquier manipulación
  es detectable y demostrable por un tercero».

## Orden propuesto

| Bloque | Qué | Depende de | Costo |
|---|---|---|---|
| **B8.1** | Flujo de eventos + bitácora encadenada + verificador + pruebas | Nada | Sólo trabajo |
| **B8.2** | Anclaje diario con OpenTimestamps + pantalla y paquete de verificación | B8.1 | Cero |
| **B8.3** | Constancia NOM-151 al cerrar expediente o enviar aviso | Contratar PSC | Por constancia |
| **B8.4** | Ancla espejo en L2 con contrato y enlace público | B8.2 | Centavos |

B8.1 y B8.2 no dependen de ninguna decisión comercial y entregan lo esencial:
detección de cualquier alteración y prueba verificable por terceros. B8.3 es la
que da peso ante la autoridad mexicana y necesita proveedor. B8.4 es presentación.

## Decisiones tomadas (2026-08-29, Polo)

1. **Ancla: OpenTimestamps.** Gratis, sobre Bitcoin, sin llave ni saldo que
   custodiar. Sin espejo en L2 por ahora; si más adelante hace falta el enlace de
   explorador para una demo, se suma como B8.4 sin rediseñar nada.
2. **NOM-151: después del demo.** B8.1 y B8.2 no dependen de ningún proveedor y
   ya entregan detección y verificación por terceros. La constancia se suma
   cuando haya cliente firmado.
3. **Cadencia: diaria, más un anclaje forzado al cerrar cada periodo de aviso.**
   El diario acota a 24 horas la ventana en que una manipulación no tendría
   ancla que la contradiga. El forzado existe porque el aviso es el documento
   que se defiende ante la autoridad: dejarlo sin anclar hasta el día siguiente
   sería justo el momento en que más falta hace.

### Nota de entorno (2026-08-29)

La sesión de Claude Code corre detrás de un proxy que **bloquea los calendarios
de OpenTimestamps** igual que bloquea Supabase. No es un problema: el anclaje no
debe correr desde una sesión de desarrollo, sino desde una Edge Function
programada, que tiene su propia salida a internet. B8.2 se construye con la
llamada de red aislada tras una interfaz, para poder probar toda la lógica
—construcción del árbol, selección de eventos, guardado del `.ots`— sin
depender de que el calendario responda, y se prueba en vivo al desplegarla.

---

## Estado de B8.2 · anclaje con OpenTimestamps (30/ago/2026)

### Lo construido

| Pieza | Qué hace |
|---|---|
| `supabase/migrations/0026_anclaje_bitacora.sql` | Tabla `anclaje`, vista `v_anclaje_estado`, función `rango_por_anclar` |
| `supabase/functions/_shared/merkle.ts` | Árbol Merkle. Compartido entre la Edge Function y el verificador del navegador |
| `supabase/functions/_shared/opentimestamps.ts` | Cliente de los calendarios y armado del `.ots`, con la red tras una interfaz |
| `supabase/functions/anclar-bitacora/anclaje.ts` | La lógica: qué tramo, en qué orden, qué se hace si un calendario no contesta |
| `supabase/functions/anclar-bitacora/index.ts` | La función: recorre organizaciones, ancla, guarda |
| `src/lib/bitacora/verificador.ts` | Ahora recalcula la raíz de cada anclaje y la contrasta |
| `src/components/bitacora/IntegridadBitacora.tsx` | El estado del ancla, sin exagerarlo |

### Decisiones que se tomaron construyendo

- **El nodo impar sube tal cual, no se duplica.** Duplicarlo es la falla
  CVE-2012-2459 de Bitcoin: permite dos conjuntos de hojas distintos con la
  misma raíz, y aquí eso significaría poder cambiar qué se certificó.
- **Se hashean los bytes, no el texto hexadecimal.** Es lo que hacen Bitcoin y
  OpenTimestamps; hashear el texto daría una raíz que ninguna herramienta de
  fuera podría reproducir.
- **Un hueco en la secuencia frena el anclaje.** Anclar un tramo incompleto
  certificaría una historia que no es la que ocurrió, y el rango no se puede
  corregir después.
- **Que fallen todos los calendarios es un resultado, no una excepción.** El
  anclaje queda `fallido` con el motivo escrito y la pantalla lo enseña. Un
  fallo silencioso dejaría la ventana abierta sin que nadie se entere.
- **Un anclaje no se corrige ni se borra.** Sólo madura de `pendiente` a
  `confirmado`. Poder reescribir el tramo sería poder elegir qué se certificó.
- **La tabla `anclaje` no tiene política de escritura, a propósito.** La crea la
  Edge Function con `service_role`. Si alguien "arregla" eso con un
  `using (true)`, cualquier usuario podría fabricar un ancla y el ejercicio
  entero deja de probar nada.
- **`pendiente` no se pinta como certificado.** El calendario recibió la raíz;
  Bitcoin tarda unas horas. Hasta el bloque, no hay certificación, y la
  pantalla lo dice con esas palabras.

### Comprobado en vivo · 30/ago/2026

El archivo `.ots` se armó aquí sin poder probarlo contra un calendario real —el
proxy de esta sesión bloquea `*.opentimestamps.org`— y sin la librería de
referencia, que arrastra `web3`, `bitcore-lib` y `fs` y no corre en una Edge
Function. La comprobación se hizo en producción y **el armado resultó
correcto**:

```
$ ots info anclaje.ots
File sha256 hash: 61ab5aec00735d8719fb655417a3c8c8e234effd08fb927736aea77367cbf110
Timestamp:
 -> append 062762a4946c2fd0 … verify PendingAttestation('https://bob.btc.calendar.opentimestamps.org')
 -> append 9fedb9307beba7ff… verify PendingAttestation('https://finney.calendar.eternitywall.com')
 -> append b83100176a4a1d21… verify PendingAttestation('https://finney.calendar.eternitywall.com')
 -> append e17da83005f7942a… verify PendingAttestation('https://alice.btc.calendar.opentimestamps.org')
```

La herramienta oficial lo lee, el digest del archivo es exactamente la
`raiz_merkle` de la tabla, y trae las cuatro atestiguaciones. Los nombres
difieren de los que se piden porque `a.pool`/`b.pool` son alias que resuelven a
`alice`, `bob` y `finney`.

Primer anclaje real: cadena de plataforma, eventos 1 a 32 354 (la carga de
códigos postales), raíz `61ab5aec…`, estado `pendiente`.

**La reserva queda levantada.** El serializador de `opentimestamps.ts` ya no es
"según la especificación": es "validado contra la herramienta oficial".

### El fallo silencioso que apareció al programar el cron

El cron se programó mandando `motivo: 'cron'`, que la tabla no admite —los tres
valores son `diario`, `cierre_periodo` y `manual`—. El insert habría fallado,
el error lo habría atrapado el `try`, y la función habría devuelto **HTTP 200
con cero anclajes, todas las noches**, sin que nadie se enterara hasta mirar la
tabla semanas después.

Corregido en la función, no en el cron: `motivoValido()` normaliza cualquier
motivo desconocido a `diario` —que es lo que en la práctica es una corrida
automática— y escribe en `detalle` lo que mandó quien llamó, para que sea
visible y no silencioso. **Anclar importa más que la etiqueta**, y esta clase
de error no debe poder impedir el anclaje.

Requiere volver a desplegar la función. Mientras no se despliegue, el cron
corre sin anclar nada.

### Lo que falta construir### Lo que falta construir

- **El `upgrade`**: pedirle al calendario la prueba completa cuando Bitcoin
  confirme, y pasar el anclaje de `pendiente` a `confirmado` con su número de
  bloque. Hoy la tabla y la UI ya lo contemplan; falta la corrida que lo haga.
  Sin esto ningún anclaje llega nunca a `confirmado`, y la pantalla se queda
  para siempre en «esperando confirmación de Bitcoin».
- **La llamada forzada al cerrar el periodo de aviso** (`motivo: 'cierre_periodo'`).
- **Descargar el `.ots`** desde la pantalla de integridad, junto al paquete.
- **El plazo de `pg_net` en el cron.** Su valor por omisión son 5 s y el primer
  anclaje real tardó 4.5 s con una sola organización. Que expire no cancela la
  Edge Function —la petición ya salió y la función termina igual, así que el
  anclaje ocurre— pero deja el registro del cron marcado como fallo y ya no se
  puede distinguir una corrida buena de una mala mirando `net`. Conviene
  subirlo a 30 s.
