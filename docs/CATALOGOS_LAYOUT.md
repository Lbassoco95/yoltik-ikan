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

## Qué está cargado y qué no

El instructivo del SAT **referencia** los catálogos pero **no incluye sus
valores**: son archivos aparte de la UIF. Por eso esta entrega **registra 25
catálogos y carga uno**.

| | |
|---|---|
| **Cargado** | `prioridad` — el único cuyos valores enumera el propio instructivo (campo 3.3: `1` Normal, `2` 24 hrs. con operaciones) |
| **Registrados, vacíos** | Los otros 24, con su nombre tal como lo cita el instructivo, los campos del layout que los usan y el formato de su clave |

Inventar los valores de `entidad_federativa` o `pais` habría sido más vistoso y
menos honesto: una clave equivocada no falla en la pantalla, falla en el portal
el día 17, con el aviso completo.

**Un catálogo vacío es un estado explícito, no un silencio.** La lista cae a
captura manual de la clave, con banner ámbar que dice por qué. Un select vacío
sin explicación es peor que un campo de texto: parece que la aplicación está rota
y no hay manera de avanzar.

## Los dos primeros que conviene cargar

`entidad_federativa` y `pais` son los que la notaría toca en cada alta. En cuanto
existan los archivos, se cargan desde **Consola de plataforma → Catálogos del
layout** y todas las organizaciones los ven al instante.

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
| `supabase/seed/13_catalogos_fep.sql` | Registro de los 25 catálogos — **generado** |
| `scripts/generar-catalogos-fep.mjs` | Lo genera desde el diccionario del instructivo |
| `supabase/manual/apply_0020_catalogos.sql` | Bundle para el SQL Editor, con 10 verificaciones |
| `supabase/manual/probar_0020_catalogos.sql` | 16 pruebas de comportamiento (Postgres desechable) |
| `src/lib/catalogos.ts` | Parseo del archivo y validación. Módulo puro |
| `src/components/aviso/SelectCatalogo.tsx` | La lista, con su degradación explícita |
| `src/pages/admin/AdminCatalogosPage.tsx` | Carga desde la consola de plataforma |
| `src/test/catalogos.test.ts` | 14 pruebas |
