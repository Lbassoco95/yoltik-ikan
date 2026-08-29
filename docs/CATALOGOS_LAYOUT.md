# Catálogos del layout — la lista sale de la base, con la clave del informe

> Bloque RCG0.B3g. Migration `0020_catalogos_layout.sql`, seed `13_catalogos_fep.sql`.

## El problema

Donde el aviso pide una **clave de catálogo** —entidad federativa, país, tipo de
poder, giro mercantil— la captura era un campo de texto libre. Quien captura no
tiene por qué saberse de memoria el número de su estado, y el portal rechaza el
aviso completo si la clave no existe en el catálogo de la UIF.

## Cómo queda

- Cada opción vive en la base con **la clave que va en el informe** y la
  descripción que ve la persona.
- La pantalla ofrece una lista; **lo que se guarda es la clave**.
- Los mantiene **Kawiil**, desde la consola de plataforma. Un sujeto obligado los
  **lee, nunca los escribe** — misma frontera que las listas restrictivas
  (migration 0012). Que un cliente pudiera editarlos significaría que puede
  fabricar la clave con la que reporta.

## Qué está cargado

El instructivo referencia los catálogos pero no incluye sus valores. **Estaban
en otro lado**: el SAT publica sus plantillas de captura de fe pública
(`Fedatario*.xlsm`) con una hoja **oculta** llamada `Combos` que contiene, tal
cual, las listas contra las que valida el portal. De ahí salen.

| | |
|---|---|
| **Cargados** | 25 catálogos, 924 claves — de `Fedatario*.xlsm` y `0InformeEnCeros.xlsm` |
| **Aparte** | `codigos_postales_de_sepomex`, 32,353 claves — se carga desde la consola con `docs/catalogos-uif/codigos_postales.csv` |

Ninguna clave es inventada. `docs/catalogos-uif/catalogos_fep.json` guarda, para
cada catálogo, **de qué archivo y de qué columna salió**; sin esa procedencia,
dentro de un año nadie podría decir si una clave es del SAT o de nuestra
cosecha. `src/test/catalogos-uif.test.ts` fija cuentas, patrones y los valores
que la notaría ve a diario, para que una edición a mano del JSON no pase
inadvertida.

Dos hallazgos que valen por sí solos:

- **`FEP` es la clave de actividad vulnerable de una notaría** (`AVI` la de un
  exchange). Era uno de los tres campos que impedían generar cualquier aviso, y
  no había que adivinarlo: está en el catálogo de `0InformeEnCeros.xlsm`. Ya
  quedó sembrado en las dos organizaciones demo.
- **La columna de códigos postales de la plantilla del SAT perdió los ceros a la
  izquierda** al abrirse en Excel: trae `1000` donde debe decir `01000`, en 907
  casos. Por eso el catálogo de CP se toma del archivo SEPOMEX, que los conserva
  como texto. El archivo SEPOMEX es de 2015 y le faltan 223 CP que la plantilla
  sí trae; no se mezclan las fuentes, porque para esos 223 habría que inventar la
  descripción.

### Lo que sí sigue faltando

- `clave_sujeto_obligado` y `clave_entidad_colegiada` de cada organización: el
  SAT las asigna al inscribirse en el padrón. No se derivan de nada y ponerles un
  valor plausible sería fabricar la identidad con la que se reporta. La pantalla
  de pendientes las reclama.
- Los códigos postales, hasta que se cargue el CSV desde la consola.

## Reglas de la carga

- **Formato de dos columnas**: clave y descripción. Acepta encabezado
  (`clave,descripcion` y sinónimos), coma, punto y coma o tabulador, comillas y
  CRLF.
- **Se conserva el orden del archivo.** El catálogo oficial viene en el orden en
  que la UIF lo publica; alfabetizarlo por nuestra cuenta cambiaría lo que ve
  quien captura.
- **Previo antes de escribir**: cuántos valores, cuáles se descartaron y por qué,
  y qué claves no cumplen el formato. Una carga con una clave mal formada se
  rechaza **entera**: una carga a medias deja el catálogo en un estado que nadie
  pidió.
- **Rendimiento medido.** El catálogo de códigos postales —32,353 valores— se
  carga en unos 3 s. El costo está en el índice de la restricción de no
  traslape, no en la validación (unos 50 ms). Se deja así: la restricción es lo
  que garantiza que una clave no pueda estar vigente dos veces.
- **Reemplazar no borra.** Cierra la vigencia de los valores anteriores con la
  fecha de hoy y abre la de los nuevos. Un aviso presentado el año pasado se armó
  con el catálogo de entonces, y auditarlo exige poder reconstruirlo:
  `catalogo_en_fecha(codigo, fecha)`.
- **Excepción conocida:** dos cargas el mismo día dejan la primera con vigencia
  vacía — nunca estuvo vigente un día completo. Es a propósito (una corrección
  del mismo día no es historia) y la fila se conserva para la auditoría. Hay una
  prueba que lo fija para que no se "arregle" por accidente.
- **Un catálogo sin cargar no valida ninguna clave.** `clave_valida_en_catalogo`
  devuelve `false`: no se puede afirmar que una clave es válida contra un
  catálogo que no se tiene.

## Dónde quedó la clave en el modelo

Se guarda **junto a** la etiqueta legible, no en su lugar. Reinterpretar la
columna de texto existente como clave habría convertido `"Jalisco"` en una clave
inválida de la noche a la mañana.

| Etiqueta legible | Clave del catálogo |
|---|---|
| `client.nacionalidad` | `client.pais_nacionalidad_clave` (0019) |
| `client.entidad_federativa` | `client.entidad_federativa_clave` (0020) |
| — | `client.actividad_economica_clave` (0019) |

## Piezas

| Archivo | Qué es |
|---|---|
| `supabase/migrations/0020_catalogos_layout.sql` | `catalogo_sat`, `catalogo_valor`, vistas, `reemplazar_valores_catalogo()`, RLS |
| `supabase/seed/13_catalogos_fep.sql` | Registro de los 26 catálogos — **generado** |
| `supabase/seed/14_catalogos_uif.sql` | Los 924 valores — **generado** |
| `supabase/seed/15_clave_actividad_demos.sql` | `FEP` y `AVI` para las organizaciones demo |
| `docs/catalogos-uif/catalogos_fep.json` | Los datos y su procedencia |
| `docs/catalogos-uif/codigos_postales.csv` | Los 32,353 CP, para cargar desde la consola |
| `scripts/generar-catalogos-fep.mjs` | Genera el registro desde el diccionario del instructivo |
| `scripts/generar-seed-catalogos-uif.mjs` | Genera el seed de valores desde el JSON, validando patrones |
| `supabase/manual/apply_0020_catalogos.sql` | Bundle para el SQL Editor, con 10 verificaciones |
| `supabase/manual/probar_0020_catalogos.sql` | 16 pruebas de comportamiento (Postgres desechable) |
| `src/lib/catalogos.ts` | Parseo del archivo y validación. Módulo puro |
| `src/components/aviso/SelectCatalogo.tsx` | La lista, con su degradación explícita |
| `src/pages/admin/AdminCatalogosPage.tsx` | Carga desde la consola de plataforma |
| `src/test/catalogos.test.ts` | 14 pruebas del parser |
| `src/test/catalogos-uif.test.ts` | 8 pruebas de integridad de los datos extraídos |
