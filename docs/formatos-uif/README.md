# Formatos oficiales de Avisos e Informes — UIF

Especificación de los formatos oficiales publicados en el **DOF del 24 de septiembre de 2026**
(Resolución que modifica la diversa por la que se expiden los formatos oficiales de los avisos e
informes que deben presentar quienes realicen actividades vulnerables. Unidad de Inteligencia
Financiera, SHCP; firmada el 11 de septiembre de 2026 por el Mtro. Omar Reyes Colmenares).

Esta carpeta es la **única fuente de verdad** de los formatos dentro de Ikán.

---

## Regla inviolable

Está prohibido:

- leer, transcribir o inferir campos desde el PDF del DOF;
- completar un campo faltante por analogía con otro anexo;
- corregir una longitud o un patrón "porque parece un error".

Si se detecta una inconsistencia, se registra en `INCONSISTENCIAS.md` con el anexo y el número de
campo, y se continúa. La corrección la hace Cumplimiento, no el código.

La extracción fue determinista sobre las tablas del DOF, no una transcripción manual ni asistida.
Si hay que regenerarla, se regenera con el mismo método y se vuelve a versionar; no se edita a mano.

---

## Contenido

| Archivo | Ámbito | Campos |
|---|---|---|
| `anexo-1.json` | Art. 17 fr. I — juegos con apuesta, concursos y sorteos | 105 |
| `anexo-2-A.json` | Art. 17 fr. II inciso a) — tarjetas de servicio o crédito | 94 |
| `anexo-2-B.json` | Art. 17 fr. II inciso b) — tarjetas prepagadas | 91 |
| `anexo-2-C.json` | Art. 17 fr. II inciso c) — instrumentos de almacenamiento de valor | 90 |
| `anexo-3.json` | Art. 17 fr. III — cheques de viajero | 201 |
| `anexo-5-A.json` | Art. 17 fr. V — construcción e intermediación inmobiliaria | 139 |
| `anexo-5-B.json` | Art. 17 fr. V Bis — desarrollo inmobiliario | 245 |
| `anexo-6.json` | Art. 17 fr. VI — metales y piedras preciosas, joyería | 90 |
| `anexo-7.json` | Art. 17 fr. VII — obras de arte | 106 |
| `anexo-8.json` | Art. 17 fr. VIII — vehículos | 121 |
| `anexo-9.json` | Art. 17 fr. IX — blindaje | 175 |
| `anexo-11.json` | Art. 17 fr. XI — servicios profesionales independientes | 498 |
| `anexo-12-A.json` | Art. 17 fr. XII apartados A y B — fe pública | 775 |
| `anexo-12-B.json` | Art. 17 fr. XII apartado C — fe pública | 587 |
| `anexo-12-C.json` | Art. 17 fr. XII apartado D — facilitadores (nuevo) | 110 |
| `anexo-13.json` | Art. 17 fr. XIII — donativos | 108 |
| `anexo-14-A.json` | Art. 17 fr. XIV — comercio exterior, avisos de 24 horas (nuevo) | 110 |
| `anexo-15.json` | Art. 17 fr. XV — arrendamiento de inmuebles | 119 |
| `anexo-16.json` | Art. 17 fr. XVI — activos virtuales | 244 |
| `catalogo-anexo-A-fracciones-arancelarias.json` | Mercancías cuyo despacho es Actividad Vulnerable (fr. XIV) | 250 valores |
| `index.json` | Índice, vigencias y faltantes | — |

**Total: 4,008 campos y 250 fracciones arancelarias.**

### Estructura de cada campo

```json
{
  "orden": 14,
  "numero": "3.5.1.1.5",
  "padre": "3.5.1.1",
  "nombre": "Registro Federal de Contribuyentes (RFC)",
  "etiqueta_xml": "<rfc>",
  "obligatoriedad": "Obligatorio",
  "tipo_dato": "Alfanumérico",
  "longitud": "13",
  "formato": "Patrón: LLLLAAMMDDXXX; en donde, L=(A-Z) letra o caracteres & o Ñ, AA=año, MM=mes, DD=día, X= alfanumérico.",
  "pagina_dof": 7
}
```

`padre` se deriva del número jerárquico y permite reconstruir el árbol del XML sin interpretar.
`orden` es el orden canónico de la publicación.

---

## Vigencias

Los formatos **no entran en vigor en una sola fecha**. Un aviso se valida contra la versión
vigente **a la fecha del acto u operación**, no contra la última cargada.

| Fecha | Qué ocurre |
|---|---|
| **1-dic-2026** | Entran en vigor para los Avisos de los artículos 26 Bis, 26 Bis 1, 26 Bis 2 y 27 de las Reglas (quinto transitorio) |
| **1-jun-2027** | Entran en vigor para todos los Avisos e Informes, incluso respecto de actos realizados antes de esa fecha |
| **30-jun-2027** | Último día para presentar Avisos modificatorios con los formatos anteriores |
| **1-jul-2027** | Los formatos anteriores dejan de estar disponibles |

---

## Lo que NO está en esta carpeta

**1. Catálogos de valores.** El DOF publica la estructura (etiqueta, obligatoriedad, tipo,
longitud, patrón) pero **no las claves válidas** de los campos con catálogo: tipo de operación,
tipo de alerta, moneda, actividad económica, clave de actividad vulnerable, instrumento monetario,
activo virtual operado, tipo de inmueble y los demás. El artículo 9 de la Resolución establece que
la UIF los publica en el Portal en Internet, y el sexto transitorio le dio cinco días hábiles desde
la publicación para hacerlo.

Mientras no estén cargados, los campos que dependen de ellos se marcan como **no validados**.
Nunca se acepta un valor libre como válido.

La única excepción es el catálogo del Anexo A (fracciones arancelarias), que sí viene en el DOF y
sí está aquí.

**2. Los anexos 4, 10 y 14.** La Resolución reforma los anexos 1 al 16, pero la publicación de la
que se extrajo esta especificación no los contiene:

- Anexo 4 — art. 17 fr. IV (préstamos o créditos)
- Anexo 10 — art. 17 fr. X (traslado y custodia de valores)
- **Anexo 14 — informe sin operaciones** (art. 3 Bis de la Resolución y art. 25 de las Reglas)

El anexo 14 es el que se usa cuando no hubo actos u operaciones objeto de Aviso en el mes. El
sistema debe poder operar sin ellos y señalarlos como pendientes de carga; no se inventan.

**3. El formato de alta y registro.** Los Anexos "A" y "B" de la otra Resolución del mismo día
(alta y registro como Actividad Vulnerable, y designación del Representante Encargado de
Cumplimiento) entran en vigor el 1 de febrero de 2027 —el 1 de junio de 2027 para facilitadores—
y se trabajan por separado.
