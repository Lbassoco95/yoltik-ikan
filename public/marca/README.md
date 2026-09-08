# Activos de marca

Aquí van los logotipos que la aplicación carga por ruta. Todo lo que esté en
`public/` se sirve tal cual desde la raíz: un archivo en `public/marca/x.png`
se pide como `/marca/x.png`. No hay que registrarlo en ningún sitio ni tocar
código — basta con dejarlo aquí con el nombre exacto y hacer commit.

## Los que ya están

| Archivo | Dónde aparece |
|---|---|
| `ikan-icono.png` | Barra lateral, login, consola, estados vacíos, favicon |
| `ikan-icono-blanco.png` | Reservado: piezas a una tinta (membretes, PDF) |

## Los que faltan

| Archivo | Dónde aparece |
|---|---|
| `yoltik.png` | El endoso «Powered by» sobre papel: pie del login y alta pública |
| `yoltik-blanco.png` | El mismo endoso sobre el navy de la barra lateral |

Mientras no estén, `<EndosoYoltik>` se cae con elegancia al logotipo
tipográfico en Sora —enseña la palabra «Yoltik»— en vez de dejar un hueco o un
icono roto. En cuanto los archivos aparezcan, la imagen entra sola.

### Cómo tienen que venir

- **En horizontal.** El endoso se dibuja en línea, a 20 px de alto, detrás de
  las palabras «Powered by». El logotipo vertical —el símbolo encima de la
  palabra— a esa altura deja la palabra en 8 px y no se lee. Hace falta el
  logotipo apaisado (símbolo a la izquierda, palabra a la derecha) o
  directamente sólo la palabra.
- **PNG con fondo transparente.** Va sobre blanco en un sitio y sobre navy en
  el otro; un fondo blanco incrustado se vería como un recuadro en la barra.
- **Unos 200 px de alto.** Se dibuja a 20, pero en una pantalla retina eso son
  40 px reales y conviene margen. Más de 400 px sobra: es un logotipo de pie de
  página, no una portada.
- **Recortado al contenido.** Sin aire alrededor: el margen lo pone el
  componente, y el que traiga el archivo se suma al suyo y descuadra la línea.
- **La versión blanca, blanca de verdad.** `yoltik-blanco.png` va sobre el navy
  de la barra lateral; si viene en navy no se ve.

## Y el que NO va aquí

Yoli, la mascota, no aparece en la aplicación ni en documentos formales —sólo
en materiales informales—. Si algún día entra, será en onboarding y tutoriales,
nunca en un expediente.
