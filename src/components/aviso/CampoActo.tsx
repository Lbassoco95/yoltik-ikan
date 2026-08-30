import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SelectCatalogo } from "@/components/aviso/SelectCatalogo";
import { CATALOGO_DE_CAMPO } from "@/lib/aviso/catalogos-fep.generated";
import type { CampoFep } from "@/lib/aviso/campos-fep.generated";
import { controlDe } from "@/lib/aviso/ramas-acto";

/** Longitud máxima que admite el layout, cuando la declara. */
function maximo(campo: CampoFep): number | undefined {
  const m = campo.longitud.match(/(\d+)\s*(?:-\s*(\d+))?/);
  if (!m) return undefined;
  const max = Number(m[2] ?? m[1]);
  return Number.isFinite(max) && max > 0 ? max : undefined;
}

/**
 * Un campo del subárbol del acto, con el control que le toca según el
 * instructivo.
 *
 * Debajo del campo va, cuando existe, la condición literal del instructivo:
 * "obligatorio si en <motivo_constitucion> se elige la opción 1. Fusión".
 * Quien captura decide si aplica —Ikán no la evalúa, porque mapear esa frase a
 * una clave de catálogo sería inventar— pero la decide leyéndola, no
 * adivinando por qué hay un campo ahí.
 */
export function CampoActo({
  campo,
  valor,
  onChange,
  soloLectura,
}: {
  campo: CampoFep;
  valor: string;
  onChange: (valor: string) => void;
  soloLectura?: boolean;
}) {
  const control = controlDe(campo);
  const codigoCatalogo = CATALOGO_DE_CAMPO[campo.no];
  const marca =
    campo.grado === "siempre" ? (
      <span className="text-destructive ml-1" title="Obligatorio">
        *
      </span>
    ) : null;

  const pie = campo.condicion ? (
    <p className="text-[11px] text-muted-foreground mt-1">{campo.condicion}</p>
  ) : null;

  if (control === "catalogo" && codigoCatalogo) {
    return (
      <div>
        <SelectCatalogo
          catalogo={codigoCatalogo}
          etiqueta={campo.nombre}
          valor={valor}
          onChange={onChange}
          ayuda={campo.condicion ?? undefined}
        />
      </div>
    );
  }

  return (
    <div>
      <Label htmlFor={campo.no}>
        {campo.nombre}
        {marca}
      </Label>

      {control === "si_no" ? (
        <Select value={valor} onValueChange={onChange} disabled={soloLectura}>
          <SelectTrigger id={campo.no}>
            <SelectValue placeholder="Selecciona…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SI">Sí</SelectItem>
            <SelectItem value="NO">No</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={campo.no}
          type={control === "fecha" ? "date" : "text"}
          inputMode={control === "monto" || control === "numero" ? "decimal" : undefined}
          maxLength={control === "fecha" ? undefined : maximo(campo)}
          value={valor}
          disabled={soloLectura}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {pie}
    </div>
  );
}
