import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { estadoCadena, exportarPaquete, verificarEnBase } from "@/lib/api/bitacora";
import {
  ADVERTENCIA_SIN_ANCLA,
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
            <p className="text-[11px] text-warning mt-2 ml-6">{ADVERTENCIA_SIN_ANCLA}</p>
          )}
        </div>
      )}
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
