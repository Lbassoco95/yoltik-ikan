# Trazabilidad, certificación y anclaje — diseño

> Documento de decisión. Bloque propuesto **RCG0.B8**. Nada de esto está
> construido todavía: aquí se decide qué se construye y en qué orden.

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
3. **Cadencia:** queda por definir en B8.2. Propuesta: anclaje diario, más uno
   forzado al cerrar cada periodo de aviso, para que el aviso enviado quede
   anclado sin esperar al día siguiente. **PENDIENTE_CONFIRMAR.**
