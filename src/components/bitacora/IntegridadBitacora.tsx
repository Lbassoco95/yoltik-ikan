import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Anchor, CheckCircle2, Clock, Download, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  estadoAnclaje,
  estadoCadena,
  exportarPaquete,
  verificarEnBase,
  type EstadoAnclaje,
} from "@/lib/api/bitacora";
import {
  advertenciaDeAlcance,
  verificarPaquete,
  type ResultadoVerificacion,
} from "@/lib/bitacora/verificador";

/**
 * Estado e integridad de la bitácora encadenada.
 *
 * Verifica DOS veces a propósito: una la base con su propia función, y otra
 * este navegador recalculando desde el paquete exportado. Si sólo verificara la
 * base, se estaría pidiendo confiar justo en quien se quiere auditar. Que las
 * dos coincidan es parte del resultado.
 */
export function IntegridadBitacora({
  organizationId,
  titulo = "Integridad de la bitácora",
}: {
  organizationId?: string;
  titulo?: string;
}) {
  const [resultado, setResultado] = useState<ResultadoVerificacion | null>(null);
  const [roturasBase, setRoturasBase] = useState<{ secuencia: number; motivo: string }[] | null>(
    null,
  );
  const [verificando, setVerificando] = useState(false);

  const { data: cabeza, isLoading, isError, error } = useQuery({
    queryKey: ["cadena", organizationId ?? "propia"],
    queryFn: () => estadoCadena(organizationId),
  });

  const { data: ancla } = useQuery({
    queryKey: ["anclaje", organizationId ?? "propia"],
    queryFn: () => estadoAnclaje(organizationId),
  });

  async function verificar() {
    setVerificando(true);
    setResultado(null);
    setRoturasBase(null);
    try {
      const [roturas, paquete] = await Promise.all([
        verificarEnBase(organizationId),
        exportarPaquete(organizationId),
      ]);
      setRoturasBase(roturas);
      setResultado(await verificarPaquete(paquete));
    } catch (e) {
      toast.error(`No se pudo verificar: ${(e as Error).message}`);
    } finally {
      setVerificando(false);
    }
  }

  async function descargar() {
    try {
      const paquete = await exportarPaquete(organizationId);
      const blob = new Blob([JSON.stringify(paquete, null, 1)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bitacora-${paquete.organization_id}-${paquete.generado_en.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(`No se pudo exportar: ${(e as Error).message}`);
    }
  }

  const coinciden =
    resultado != null && roturasBase != null && resultado.integra === (roturasBase.length === 0);
  const integra = resultado?.integra === true && roturasBase?.length === 0;

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 mt-0.5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">{titulo}</p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
              Cada alta, cada acto y cada movimiento del motor queda encadenado por hashes.
              Alterar o borrar un registro pasado rompe la cadena y se detecta al recalcularla.
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-2" onClick={descargar}>
            <Download className="w-3.5 h-3.5" /> Exportar
          </Button>
          <Button size="sm" className="gap-2" onClick={verificar} disabled={verificando}>
            {verificando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Verificar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Leyendo la cabeza de la cadena…</p>
      ) : isError ? (
        <p className="text-xs text-destructive">
          No se pudo leer la bitácora: {(error as Error)?.message}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Dato etiqueta="Eventos registrados" valor={cabeza!.ultima_secuencia.toLocaleString("es-MX")} />
          <Dato
            etiqueta="Último movimiento"
            valor={
              cabeza!.actualizado_en
                ? new Date(cabeza!.actualizado_en).toLocaleString("es-MX")
                : "Sin actividad"
            }
          />
          <Dato etiqueta="Hash de la cadena" valor={cabeza!.ultimo_hash.slice(0, 16) + "…"} mono />
        </div>
      )}

      <EstadoDelAncla ancla={ancla ?? null} />

      {resultado && (
        <div
          className={`rounded-lg p-3 ${integra ? "bg-success/10" : "bg-destructive/10"}`}
        >
          <div className="flex items-center gap-2">
            {integra ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            )}
            <p className="text-sm font-semibold text-foreground">
              {integra
                ? `Íntegra · ${resultado.eventosVerificados.toLocaleString("es-MX")} eventos recalculados`
                : `Cadena rota · ${resultado.roturas.length} hallazgo(s)`}
            </p>
          </div>

          {!coinciden && (
            <p className="text-xs text-destructive mt-2 ml-6">
              La base y este navegador no llegaron al mismo resultado. Eso, por sí solo, ya es
              motivo de revisión: significa que uno de los dos no está calculando lo que dice.
            </p>
          )}

          {resultado.roturas.length > 0 && (
            <ul className="mt-2 ml-6 space-y-1">
              {resultado.roturas.slice(0, 8).map((r, i) => (
                <li key={`${r.secuencia}-${i}`} className="text-xs text-foreground">
                  Evento {r.secuencia}: {r.motivo}
                </li>
              ))}
            </ul>
          )}

          {integra && (
            <>
              <p
                className={cn(
                  "text-[11px] mt-2 ml-6",
                  resultado.cubiertoHasta >= resultado.eventosVerificados
                    ? "text-success"
                    : "text-warning",
                )}
              >
                {advertenciaDeAlcance(resultado)}
              </p>

              {/* Un anclaje cuya raíz no cuadra es la señal más grave del
                  verificador: la cadena puede estar bien encadenada y aun así
                  no ser la que se publicó. */}
              {resultado.anclajes
                .filter((a) => !a.coincide)
                .map((a) => (
                  <p key={a.id} className="text-[11px] text-destructive mt-1 ml-6">
                    Anclaje {a.desde_secuencia}–{a.hasta_secuencia}: {a.motivo}
                  </p>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * El ancla externa, dicha sin exagerar.
 *
 * Tres estados distintos y ninguno se puede confundir con otro:
 *   - confirmado: hay una raíz en un bloque de Bitcoin. Es la afirmación
 *     fuerte, y es la única que se pinta en verde.
 *   - pendiente: el calendario aceptó la raíz pero Bitcoin todavía no la
 *     confirma. Tarda unas horas y es normal; no es una certificación aún.
 *   - sin ancla: sólo la cadena interna. Se dice, no se calla.
 *
 * `eventos_sin_anclar` sale siempre, incluso con el ancla al día: es la
 * ventana en la que una manipulación no tendría nada que la contradiga, y
 * ocultarla sería vender más de lo que hay.
 */
function EstadoDelAncla({ ancla }: { ancla: EstadoAnclaje | null }) {
  if (!ancla) return null;

  const confirmado = ancla.estado === "confirmado";
  const pendiente = ancla.estado === "pendiente";
  const sinAncla = ancla.anclado_hasta == null;

  return (
    <div
      className={cn(
        "rounded-lg p-3",
        confirmado ? "bg-success/10" : pendiente ? "bg-primary/5" : "bg-warning/10",
      )}
    >
      <div className="flex items-start gap-2">
        {confirmado ? (
          <Anchor className="w-4 h-4 mt-0.5 text-success shrink-0" />
        ) : pendiente ? (
          <Clock className="w-4 h-4 mt-0.5 text-primary shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 mt-0.5 text-warning shrink-0" />
        )}
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {confirmado
              ? `Anclado en Bitcoin · bloque ${ancla.bloque_btc?.toLocaleString("es-MX")}`
              : pendiente
                ? "Anclaje enviado · esperando confirmación de Bitcoin"
                : sinAncla
                  ? "Sin anclaje externo todavía"
                  : "El último anclaje no llegó a publicarse"}
          </p>

          <p className="text-[11px] text-muted-foreground">
            {confirmado ? (
              <>
                Los eventos 1 a {ancla.anclado_hasta?.toLocaleString("es-MX")} están respaldados
                por una raíz publicada en Bitcoin
                {ancla.fecha_bloque
                  ? ` el ${new Date(ancla.fecha_bloque).toLocaleDateString("es-MX")}`
                  : ""}
                . Cualquiera puede comprobarlo con un nodo de Bitcoin, sin pedirnos nada.
              </>
            ) : pendiente ? (
              <>
                El calendario de OpenTimestamps ya recibió la raíz; Bitcoin tarda unas horas en
                confirmarla. Hasta entonces esto todavía no es una certificación.
              </>
            ) : (
              <>
                Por ahora la integridad se comprueba sólo dentro de la base. Eso detecta que se
                alterara un evento suelto, no que se reescribiera la cadena entera.
              </>
            )}
          </p>

          {ancla.eventos_sin_anclar > 0 && (
            <p className="text-[11px] text-warning">
              {ancla.eventos_sin_anclar.toLocaleString("es-MX")} evento
              {ancla.eventos_sin_anclar === 1 ? "" : "s"} sin cobertura externa: son los
              posteriores al último anclaje. El anclaje corre a diario y se fuerza al cerrar cada
              periodo de aviso.
            </p>
          )}

          {ancla.raiz_merkle && (
            <p className="text-[11px] font-mono text-muted-foreground break-all">
              raíz {ancla.raiz_merkle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor, mono }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{etiqueta}</p>
      <p className={`text-sm font-semibold text-foreground mt-0.5 ${mono ? "font-mono" : ""}`}>
        {valor}
      </p>
    </div>
  );
}
