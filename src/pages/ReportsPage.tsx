import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileCode,
  Info,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { EncabezadoSeccion } from "@/components/estela/EncabezadoSeccion";
import { FirmaCelula } from "@/components/estela/FirmaCelula";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cargarPeriodo,
  guardarAviso,
  listarAvisos,
  periodosConActos,
} from "@/lib/api/avisos";
import { anclarPorCierreDePeriodo } from "@/lib/api/bitacora";
import { recorrerMotor } from "@/lib/api/operaciones";
import { evaluarAvisoMensual } from "@/lib/aviso-mensual";
import { generarAvisoXml } from "@/lib/aviso/generador-xml";
import { labelTipoActo } from "@/lib/perfil-actividad";
import { cn, formatMxn } from "@/lib/utils";
import {
  periodoDeApertura,
  periodosOfrecidos,
  situacionDelPeriodo,
} from "@/lib/aviso/periodo";

const nombreMes = (p: string) =>
  new Date(`${p}-01T12:00:00`).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });

export default function ReportsPage() {
  const [periodo, setPeriodo] = useState(() => periodoDeApertura([]));
  // Una sola vez: si el usuario elige otro periodo, no se le mueve debajo.
  const [aperturaHecha, setAperturaHecha] = useState(false);
  const queryClient = useQueryClient();

  const { data: periodos = [] } = useQuery({
    queryKey: ["periodos-con-actos"],
    queryFn: periodosConActos,
  });

  // En cuanto se sabe qué periodos tienen actos, se abre en el más reciente
  // CERRADO que los tenga. Llegar a una pantalla vacía no dice si no hay nada o
  // si algo falló, y abrir en el mes en curso invita a presentar un periodo que
  // todavía no se puede presentar.
  useEffect(() => {
    if (!aperturaHecha && periodos.length) {
      setPeriodo(periodoDeApertura(periodos));
      setAperturaHecha(true);
    }
  }, [periodos, aperturaHecha]);

  const {
    data: datos,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["periodo-aviso", periodo],
    queryFn: () => cargarPeriodo(periodo),
  });

  const { data: avisos = [] } = useQuery({
    queryKey: ["avisos", periodo],
    queryFn: () => listarAvisos(periodo),
  });

  const evaluacion = datos
    ? evaluarAvisoMensual(datos.operaciones, datos.hallazgos)
    : null;

  // En qué situación está el periodo elegido: art. 23 de la LFPIORPI, día 17
  // del mes siguiente. El mes en curso no se presenta —todavía le pueden entrar
  // actos— y por eso el botón se apaga con su explicación, no en silencio.
  const situacion = situacionDelPeriodo(periodo, avisos.length > 0);

  // Recorrer el motor desde aquí. La bandeja del OC tiene el mismo botón, pero
  // el bloqueo aparece en ESTA pantalla y mandar a buscarlo a otra es la forma
  // más fácil de que alguien decida que el mes va en ceros y ya.
  //
  // El motor recorre toda la organización, no sólo el periodo abierto: es lo
  // que hace la Edge Function y decir otra cosa sería mentir sobre su alcance.
  const evaluar = useMutation({
    mutationFn: recorrerMotor,
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["periodo-aviso"] });
      queryClient.invalidateQueries({ queryKey: ["hallazgos"] });
      queryClient.invalidateQueries({
        queryKey: ["hallazgos", "abiertos", "count"],
      });
      toast.success(
        `${r.operaciones_evaluadas ?? r.operaciones_procesadas} operación(es) evaluadas. ` +
          `${r.operaciones_marcadas_aviso ?? 0} requieren aviso, ` +
          `${r.hallazgos_creados} hallazgo(s) nuevo(s).`,
      );
    },
    onError: (e: Error) => toast.error(`No se pudo evaluar: ${e.message}`),
  });

  const generar = useMutation({
    mutationFn: async (enCeros: boolean) => {
      if (!datos) throw new Error("El periodo todavía no carga.");
      const entrada = enCeros
        ? { ...datos.entrada, actos: [], en_ceros: true }
        : datos.entrada;
      const r = generarAvisoXml(entrada);
      if (!r.xml) throw new Error(r.errores.join("\n"));

      const referencia = `IKAN${periodo.replace("-", "")}`.slice(0, 14);
      await guardarAviso({
        periodo,
        xml: r.xml,
        referencia,
        operation_ids: enCeros
          ? []
          : datos.operaciones
              .filter((o) => o.canal === "sppld")
              .map((o) => o.id),
        exento: enCeros,
        layout_version: "fep",
      });
      descargar(r.xml, `aviso-${periodo}.xml`);

      // El aviso es el documento que se defiende ante la autoridad. El anclaje
      // diario lo dejaría sin raíz publicada hasta la madrugada siguiente, que
      // es justo cuando más falta hace poder demostrar que se generó con estos
      // datos y no con otros. No frena nada si falla: el aviso ya está
      // guardado y descargado, y el anclaje diario lo recoge.
      const anclado = await anclarPorCierreDePeriodo();
      return { ...r, anclado };
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["avisos", periodo] });
      queryClient.invalidateQueries({ queryKey: ["anclaje"] });
      for (const a of r.advertencias) toast.warning(a);
      toast.success(
        r.anclado
          ? "Aviso generado y descargado · bitácora anclada"
          : "Aviso generado y descargado",
      );
    },
    onError: (e: Error) => toast.error(e.message, { duration: 12000 }),
  });

  // Vista previa de lo que el generador diría, sin escribir nada.
  const previo = datos ? generarAvisoXml(datos.entrada) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <EncabezadoSeccion
        titulo="Aviso mensual"
        descripcion="Se presenta a más tardar el día 17 del mes siguiente al periodo reportado."
        acciones={
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-52 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodosOfrecidos(periodos).map((p) => (
                <SelectItem key={p} value={p}>
                  {nombreMes(p)}
                  {situacionDelPeriodo(p, false).estado === "en_curso"
                    ? " · en curso"
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* La cuenta atrás al día 17.
          El plazo estaba dicho —en la línea de debajo del título, en pasiva y
          en abstracto— pero no contado: para saber si quedaban tres días o
          quince había que mirar el calendario. `diasParaElLimite` y `limite`
          ya venían calculados en situacionDelPeriodo desde el principio; lo
          que faltaba era enseñarlos.

          El ámbar aparece sólo cuando falta una semana o menos, y el barro
          cuando el plazo ya venció —que es el caso irreversible del sistema:
          un aviso fuera de plazo no se arregla presentándolo—. */}
      {situacion.limite != null && situacion.diasParaElLimite != null && (
        <div
          className={cn(
            "estela-filo flex flex-wrap items-center justify-between gap-4 rounded-md border estela-vidrio p-5",
            situacion.estado === "fuera_de_plazo"
              ? "border-ikan-barro/40 border-t-ikan-barro"
              : situacion.estado === "presentado"
                ? "border-success/40 border-t-success"
                : situacion.diasParaElLimite <= 7
                  ? "border-ikan-ambar/40 border-t-ikan-ambar"
                  : "border-border border-t-accent",
          )}
        >
          <div className="min-w-0">
            <p
              className={cn(
                "estela-antetitulo text-muted-foreground m-0",
                situacion.estado === "fuera_de_plazo"
                  ? "text-ikan-barro"
                  : situacion.estado === "presentado"
                    ? "text-success"
                    : situacion.diasParaElLimite <= 7
                      ? "text-[#7A4F00] dark:text-ikan-ambar"
                      : undefined,
              )}
            >
              {situacion.estado === "presentado"
                ? "Presentado"
                : situacion.estado === "fuera_de_plazo"
                  ? "Fuera de plazo"
                  : "Plazo de presentación"}
            </p>
            <p className="m-0 mt-1 text-lg font-bold text-foreground">
              {situacion.estado === "presentado"
                ? `${nombreMes(periodo)} ya se presentó`
                : situacion.diasParaElLimite < 0
                  ? `Venció hace ${Math.abs(situacion.diasParaElLimite)} ${Math.abs(situacion.diasParaElLimite) === 1 ? "día" : "días"}`
                  : situacion.diasParaElLimite === 0
                    ? "Vence hoy"
                    : `Faltan ${situacion.diasParaElLimite} ${situacion.diasParaElLimite === 1 ? "día" : "días"}`}
            </p>
            <p className="estela-dato m-0 mt-1.5 text-xs text-muted-foreground">
              Fecha límite{" "}
              {situacion.limite.toLocaleDateString("es-MX", { dateStyle: "long" })}
            </p>
          </div>
          <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
            {situacion.leyenda}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="estela-placa flex items-center justify-center gap-2 p-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando el periodo…
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/30 estela-vidrio p-5 text-sm text-destructive">
          No se pudo cargar el periodo: {(error as Error)?.message}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Tarjeta
              titulo="Actos del SPPLD"
              valor={String(evaluacion?.reportables.length ?? 0)}
              nota="Entran en este aviso"
            />
            <Tarjeta
              titulo="Por DeclaraNOT"
              valor={String(evaluacion?.porDeclaraNot.length ?? 0)}
              nota="NO se reportan aquí: otro sistema, otro plazo"
              alerta={(evaluacion?.porDeclaraNot.length ?? 0) > 0}
            />
            <Tarjeta
              titulo="Hallazgos abiertos"
              valor={String(datos?.hallazgos.length ?? 0)}
              nota="No frenan el aviso del periodo"
            />
          </div>

          <Aviso
            tono={
              situacion.estado === "en_curso" ||
              situacion.estado === "fuera_de_plazo"
                ? "bloqueo"
                : "recordatorio"
            }
            titulo={
              situacion.estado === "en_curso"
                ? `${nombreMes(periodo)} todavía no se presenta`
                : situacion.estado === "presentado"
                  ? `${nombreMes(periodo)} ya se presentó`
                  : situacion.estado === "fuera_de_plazo"
                    ? `${nombreMes(periodo)} está fuera de plazo`
                    : `${nombreMes(periodo)} está por presentarse`
            }
            detalle={situacion.leyenda}
          />

          {datos?.faltanClavesPadron && (
            <Aviso
              tono="bloqueo"
              titulo="Faltan las claves del padrón SAT"
              detalle="Sin la clave del sujeto obligado y la de actividad vulnerable, ningún aviso pasa la validación del portal. Se capturan una sola vez; hoy las carga Kawiil."
            />
          )}

          {evaluacion?.bloqueos.map((b) => (
            <Aviso
              key={b.motivo}
              tono="bloqueo"
              titulo={b.motivo}
              detalle={b.detalle}
              // Sólo el de actos sin evaluar tiene salida desde aquí. El del
              // umbral no la tiene ni debe tenerla: se resuelve presentando el
              // aviso con esas operaciones, que es el botón de al lado.
              accion={
                b.clave === "sin_evaluar" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => evaluar.mutate()}
                    disabled={evaluar.isPending}
                    className="gap-2"
                  >
                    {evaluar.isPending && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    Evaluar ahora
                  </Button>
                ) : undefined
              }
            />
          ))}

          {evaluacion?.recordatorios.map((r) => (
            <Aviso
              key={r.motivo}
              tono="recordatorio"
              titulo={r.motivo}
              detalle={r.detalle}
            />
          ))}

          {/* Generación */}
          <div className="estela-placa p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <FileCode className="w-5 h-5 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Generar el archivo XML de {nombreMes(periodo)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
                    {situacion.presentable
                      ? "Se arma contra el formato de fe pública del SPPLD y se descarga listo para subir al portal. Queda guardado tal cual, con su versión de formato, y el hecho de haberlo generado entra en la bitácora encadenada."
                      : situacion.leyenda}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {evaluacion?.puedeEnCeros &&
                  (evaluacion?.reportables.length ?? 0) === 0 && (
                    <Button
                      variant="outline"
                      onClick={() => generar.mutate(true)}
                      disabled={generar.isPending || !situacion.presentable}
                    >
                      Informe en ceros
                    </Button>
                  )}
                <Button
                  className="gap-2"
                  onClick={() => generar.mutate(false)}
                  disabled={
                    generar.isPending ||
                    !situacion.presentable ||
                    (evaluacion?.reportables.length ?? 0) === 0
                  }
                >
                  {generar.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Generar y descargar
                </Button>
              </div>
            </div>

            {previo && previo.errores.length > 0 && (
              <div className="rounded-md bg-destructive/10 p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                  <p className="text-sm font-semibold text-foreground">
                    {previo.errores.length} cosa(s) que el portal rechazaría
                  </p>
                </div>
                <ul className="mt-2 ml-6 space-y-1">
                  {previo.errores.slice(0, 10).map((e, i) => (
                    <li key={i} className="text-xs text-foreground">
                      {e}
                    </li>
                  ))}
                </ul>
                <p className="text-[13px] text-muted-foreground mt-2 ml-6">
                  No se genera el archivo hasta que esto se corrija. Un XML que
                  el portal rechaza el día 17 es peor que no tener ninguno.
                </p>
              </div>
            )}

            {previo &&
              previo.errores.length === 0 &&
              previo.advertencias.length > 0 && (
                <div className="rounded-md bg-warning/10 p-3">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-warning-ink shrink-0" />
                    <p className="text-sm font-semibold text-foreground">
                      El archivo se genera, pero sale incompleto
                    </p>
                  </div>
                  <ul className="mt-2 ml-6 space-y-1">
                    {previo.advertencias.slice(0, 8).map((a, i) => (
                      <li key={i} className="text-xs text-warning-ink">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {previo &&
              previo.errores.length === 0 &&
              previo.advertencias.length === 0 && (
                <div className="rounded-md bg-success/10 p-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  <p className="text-sm text-foreground">
                    El archivo cumple lo que el formato del aviso pide. Listo
                    para subir al portal.
                  </p>
                </div>
              )}
          </div>

          {/* Actos del periodo */}
          <div className="estela-placa overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {[
                    "Fecha",
                    "Tipo de acto",
                    "Valor",
                    "Canal",
                    "Rebasa umbral",
                  ].map((h) => (
                    <th
                      key={h}
                      className="estela-antetitulo text-muted-foreground px-4 py-3 text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(datos?.operaciones ?? []).map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 text-sm">
                      {new Date(o.fecha).toLocaleDateString("es-MX")}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">
                      {labelTipoActo(o.tipo_acto)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {formatMxn(o.monto_mxn)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "status-badge",
                          o.canal === "declaranot"
                            ? "bg-warning/15 text-warning-ink"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {o.canal === "declaranot" ? "DeclaraNOT" : "SPPLD"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {o.rebasa_umbral ? "Sí" : "No"}
                    </td>
                  </tr>
                ))}
                {(datos?.operaciones ?? []).length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground text-sm"
                    >
                      Sin actos registrados en {nombreMes(periodo)}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Avisos ya generados */}
          {avisos.length > 0 && (
            <div className="estela-placa p-5">
              <p className="text-sm font-semibold text-foreground mb-3">
                Avisos generados de {nombreMes(periodo)}
              </p>
              <ul className="space-y-2">
                {avisos.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span>
                      <span className="estela-dato text-xs text-muted-foreground mr-2">
                        {a.referencia ?? a.id.slice(0, 8)}
                      </span>
                      {a.exento
                        ? "Informe en ceros"
                        : `${a.operation_ids.length} acto(s)`}
                      <span className="text-muted-foreground">
                        {" · "}
                        {new Date(a.generado_en).toLocaleString("es-MX")}
                      </span>
                    </span>
                    {a.xml && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={() =>
                          descargar(
                            a.xml!,
                            `aviso-${a.periodo}-${a.referencia}.xml`,
                          )
                        }
                      >
                        <Download className="w-3.5 h-3.5" /> Descargar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Quién firma por esto. El aviso mensual es la pantalla donde el sujeto
          obligado asume una responsabilidad frente al SAT, y es exactamente
          donde tiene que saber a quién llamar si algo no le cuadra. No se
          dibuja mientras no haya una célula configurada de verdad —los
          nombres no se inventan, ver src/lib/celula.ts—. */}
      <FirmaCelula variante="bloque" />
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  nota,
  alerta,
}: {
  titulo: string;
  valor: string;
  nota: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={cn(
        "estela-placa p-4",
        alerta && "border-l-[3px] border-l-ikan-ambar",
      )}
    >
      <p className="estela-antetitulo text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">{valor}</p>
      <p className="text-[13px] text-muted-foreground mt-1">{nota}</p>
    </div>
  );
}

function Aviso({
  tono,
  titulo,
  detalle,
  accion,
}: {
  tono: "bloqueo" | "recordatorio";
  titulo: string;
  detalle: string;
  /** Lo que resuelve el bloqueo, cuando hay algo que la propia pantalla puede
   *  hacer. Un bloqueo sin salida deja al usuario leyendo un muro. */
  accion?: React.ReactNode;
}) {
  const bloqueo = tono === "bloqueo";
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border p-4",
        bloqueo
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-muted/50",
      )}
    >
      {bloqueo ? (
        <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
      ) : (
        <Clock className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
      )}
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{detalle}</p>
      </div>
      {accion && <div className="shrink-0 self-center">{accion}</div>}
    </div>
  );
}

/** El archivo se baja desde el navegador: el XML ya está en memoria y no hay
 *  razón para pedirlo otra vez al servidor. */
function descargar(xml: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
