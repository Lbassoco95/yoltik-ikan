import { AlertTriangle, CheckCircle2, Clock, Info } from "lucide-react";
import { CAMPOS_DEL_CIERRE, type Pendiente } from "@/lib/aviso/completitud";
import { cn } from "@/lib/utils";

const ORIGEN_LABEL: Record<Pendiente["origen"], string> = {
  sujeto_obligado: "Alta ante el SAT",
  compareciente: "Compareciente",
  acto: "Acto",
  aviso: "Aviso",
};

/**
 * Qué le falta al expediente para volverse aviso, dicho el día de la captura.
 *
 * Distingue tres cosas que la gente confunde:
 *   - lo que FRENA el aviso (sin esto el XML no pasa validación),
 *   - lo que sólo lo debilita (el layout lo admite vacío, pero el expediente
 *     queda pobre y el OC lo va a pedir),
 *   - lo que NO se captura ahora porque nace con el aviso, al cierre del mes.
 *
 * El tercero se muestra a propósito: sin él, el usuario no sabe si le falta
 * algo o si el sistema lo va a resolver solo.
 */
export function PendientesAviso({
  pendientes,
  compacto = false,
  className,
}: {
  pendientes: Pendiente[];
  /** Sin la sección de cierre de mes: para el diálogo de alta, donde estorba. */
  compacto?: boolean;
  className?: string;
}) {
  const bloquean = pendientes.filter((p) => p.gravedad === "bloquea_aviso");
  const recomendados = pendientes.filter((p) => p.gravedad === "recomendado");

  return (
    <div className={cn("space-y-4", className)}>
      {bloquean.length === 0 ? (
        <div className="flex items-start gap-2 rounded-lg bg-success/10 p-3">
          <CheckCircle2 className="w-4 h-4 mt-0.5 text-success shrink-0" />
          <p className="text-sm text-foreground">
            No falta nada para que este expediente entre al aviso del mes.
          </p>
        </div>
      ) : (
        <Bloque
          icono={<AlertTriangle className="w-4 h-4 text-warning shrink-0" />}
          titulo={`Frena el aviso · ${bloquean.length}`}
          descripcion="Sin estos datos el XML no pasa la validación del portal."
          items={bloquean}
        />
      )}

      {recomendados.length > 0 && (
        <Bloque
          icono={<Info className="w-4 h-4 text-muted-foreground shrink-0" />}
          titulo={`Recomendado · ${recomendados.length}`}
          descripcion="El layout los admite vacíos, pero el expediente queda incompleto."
          items={recomendados}
        />
      )}

      {!compacto && (
        <Bloque
          icono={<Clock className="w-4 h-4 text-muted-foreground shrink-0" />}
          titulo="Se llena al cierre del mes"
          descripcion="No se captura hoy: nace con el aviso, no con el acto."
          items={CAMPOS_DEL_CIERRE}
          atenuado
        />
      )}
    </div>
  );
}

function Bloque({
  icono,
  titulo,
  descripcion,
  items,
  atenuado = false,
}: {
  icono: React.ReactNode;
  titulo: string;
  descripcion: string;
  items: Pendiente[];
  atenuado?: boolean;
}) {
  return (
    <div className={cn("rounded-lg bg-muted/40 p-3", atenuado && "opacity-80")}>
      <div className="flex items-center gap-2">
        {icono}
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5 ml-6">{descripcion}</p>
      <ul className="mt-2 ml-6 space-y-1.5">
        {items.map((p) => (
          <li key={`${p.origen}-${p.no}-${p.campo}`} className="text-xs text-foreground">
            <span className="text-muted-foreground">{ORIGEN_LABEL[p.origen]} · </span>
            {p.detalle}{" "}
            <span className="text-muted-foreground">
              (campo {p.no} <code>&lt;{p.campo}&gt;</code>)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
