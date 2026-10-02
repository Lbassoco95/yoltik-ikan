/**
 * ESTELA — el vocabulario visual de Ikán.
 *
 * Ikán como estela digital: cada cifra queda fechada, con fuente y firmada.
 * Estos son los componentes que llevan ese concepto; el resto de la interfaz
 * son primitivas de shadcn con los tokens del sistema.
 *
 * Antes de añadir uno nuevo aquí: la ola tiene dos usos (bajo el H1 de la
 * sección y en el canto del cartucho), el texto va siempre sobre vidrio o
 * sobre la barra navy —nunca directo sobre el fondo fluido— y el color tiene
 * cuatro significados (jade =
 * lo que se puede hacer, verde = lo que está en orden, ámbar = lo que le toca
 * atender, rojo = lo que está roto; el barro es el vencido). Un componente
 * que necesite un quinto significado es señal de que el problema está en otro
 * sitio.
 */
export { Cartucho } from "./Cartucho";
export { CartuchoParametro } from "./CartuchoParametro";
export { SelloVigencia } from "./SelloVigencia";
export { FirmaCelula } from "./FirmaCelula";
export { BitacoraLinea } from "./BitacoraLinea";
export { EncabezadoSeccion } from "./EncabezadoSeccion";
export { EstadoVacio } from "./EstadoVacio";
export { MarcaIkan, IconoIkan } from "./MarcaIkan";
export { EndosoYoltik } from "./EndosoYoltik";
export { PlacaAcceso } from "./PlacaAcceso";
export { FondoFluido } from "./FondoFluido";
