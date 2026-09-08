import { AlertTriangle, CheckCircle2, Clock, Info, ShieldAlert } from "lucide-react";
import { CAMPOS_DEL_CIERRE, clavePendiente, type Pendiente } from "@/lib/aviso/completitud";
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
  mostrarReferencias = false,
  canal,
  className,
}: {
  pendientes: Pendiente[];
  /** Sin la sección de cierre de mes: para el diálogo de alta, donde estorba. */
  compacto?: boolean;
  /**
   * Enseña el número de campo del instructivo y su etiqueta XML —«campo 3.5.1
   * <nombre>»— junto a cada pendiente.
   *
   * Apagado por omisión. Esa referencia es trazabilidad de verdad y sirve
   * cuando el portal rechaza un aviso y hay que saber qué campo del layout
   * falló, pero a quien está dando de alta a un compareciente no le dice nada:
   * lee como una fuga de las tripas del sistema, o directamente como un error.
   *
   * No se borra, se guarda: sigue disponible en el `title` de cada renglón para
   * quien la busque, y esta bandera la saca a la vista en las pantallas donde
   * se depura un aviso.
   */
  mostrarReferencias?: boolean;
  /**
   * Por dónde se presenta el acto. Sólo se pasa cuando ya hay un tipo de acto
   * elegido.
   *
   * Existe porque el mensaje de "no falta nada" era falso dos veces sobre una
   * transmisión de inmueble: ese acto va por DeclaraNOT, no por el SPPLD, y su
   * plazo son 15 días naturales tras la firma, no el día 17 del mes siguiente.
   * Decirle a un notario que su expediente ya entra al aviso del mes es
   * decirle que algo está reportado cuando no lo está.
   */
  canal?: "sppld" | "declaranot";
  className?: string;
}) {
  const bloquean = pendientes.filter((p) => p.gravedad === "bloquea_aviso");
  // Su propio bloque, y NO mezclado con los de arriba: decir que el portal
  // rechaza algo que el portal acepta le quita crédito a la lista entera.
  const expediente = pendientes.filter((p) => p.gravedad === "bloquea_expediente");
  const recomendados = pendientes.filter((p) => p.gravedad === "recomendado");

  return (
    <div className={cn("space-y-4", className)}>
      {/* El mensaje de "no falta nada" mira las dos listas; el bloque de
          "frena el aviso" sólo la suya. Con un ternario que las juntara, un
          expediente al que sólo le falta identificar al compareciente sacaba un
          «Frena el aviso · 0» vacío con el texto de que el portal lo rechaza:
          justo la afirmación falsa que la gravedad nueva vino a evitar. */}
      {bloquean.length === 0 && expediente.length === 0 && (
        canal === "declaranot" ? (
          <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-warning-ink shrink-0" />
            <p className="text-sm text-foreground">
              El expediente está completo, pero este acto{" "}
              <strong>no entra al aviso mensual del SPPLD</strong>: se presenta por DeclaraNOT,
              dentro de los 15 días naturales siguientes a la firma. Generar el aviso del mes
              NO lo reporta.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md bg-success/10 p-3">
            <CheckCircle2 className="w-4 h-4 mt-0.5 text-success shrink-0" />
            <p className="text-sm text-foreground">
              No falta nada para que este expediente entre al aviso del mes.
            </p>
          </div>
        )
      )}

      {bloquean.length > 0 && (
        <Bloque
          icono={<AlertTriangle className="w-4 h-4 text-warning-ink shrink-0" />}
          titulo={`Frena el aviso · ${bloquean.length}`}
          descripcion="Sin estos datos el aviso no pasa la validación del portal del SAT."
          items={bloquean}
          mostrarReferencias={mostrarReferencias}
        />
      )}

      {expediente.length > 0 && (
        <Bloque
          icono={<ShieldAlert className="w-4 h-4 text-warning-ink shrink-0" />}
          titulo={`Frena el expediente · ${expediente.length}`}
          descripcion="El aviso sale igual, pero el expediente no cumple. Esto no lo pide el layout: lo pide la ley."
          items={expediente}
          mostrarReferencias={mostrarReferencias}
        />
      )}

      {recomendados.length > 0 && (
        <Bloque
          icono={<Info className="w-4 h-4 text-muted-foreground shrink-0" />}
          titulo={`Recomendado · ${recomendados.length}`}
          descripcion="El formato del aviso los admite vacíos, pero el expediente queda incompleto."
          items={recomendados}
          mostrarReferencias={mostrarReferencias}
        />
      )}

      {!compacto && (
        <Bloque
          icono={<Clock className="w-4 h-4 text-muted-foreground shrink-0" />}
          titulo="Se llena al cierre del mes"
          descripcion="No se captura hoy: nace con el aviso, no con el acto."
          items={CAMPOS_DEL_CIERRE}
          mostrarReferencias={mostrarReferencias}
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
  mostrarReferencias = false,
}: {
  icono: React.ReactNode;
  titulo: string;
  descripcion: string;
  items: Pendiente[];
  atenuado?: boolean;
  mostrarReferencias?: boolean;
}) {
  return (
    <div className={cn("rounded-md bg-muted/40 p-3", atenuado && "opacity-80")}>
      <div className="flex items-center gap-2">
        {icono}
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
      </div>
      <p className="text-[13px] text-muted-foreground mt-0.5 ml-6">{descripcion}</p>
      <ul className="mt-2 ml-6 space-y-1.5">
        {items.map((p) => (
          // La clave incluye la repetición: el RFC del primer apoderado y el
          // del segundo son el mismo campo del instructivo.
          // El `title` lleva la referencia del instructivo siempre, se enseñe
          // o no: quien la necesita la encuentra sin que le estorbe a quien no.
          <li
            key={clavePendiente(p)}
            className="text-xs text-foreground"
            title={`Instructivo del layout · campo ${p.no} <${p.campo}>`}
          >
            <span className="text-muted-foreground">
              {p.contexto ?? ORIGEN_LABEL[p.origen]} ·{" "}
            </span>
            {p.detalle}
            {mostrarReferencias && (
              <span className="text-muted-foreground">
                {" "}
                (campo {p.no} <code>&lt;{p.campo}&gt;</code>)
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
