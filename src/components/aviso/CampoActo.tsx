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
import { validarCampo } from "@/lib/aviso/validacion-acto";
import { cn } from "@/lib/utils";

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
 *
 * Y si el valor no cumple lo que el layout exige, se dice AQUÍ, mientras se
 * escribe. Un RFC de doce caracteres en una persona física no lo detecta nadie
 * hasta el día 17, y para entonces el compareciente ya se fue.
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
  const problema = validarCampo(campo, valor);
  // `title` no aparece en táctil y los lectores de pantalla lo tratan de forma
  // irregular. La leyenda «* obligatorio» va al principio del formulario.
  const marca =
    campo.grado === "siempre" ? (
      <span className="text-destructive ml-1" aria-label="obligatorio">
        *
      </span>
    ) : null;

  // Los dos, no uno u otro: justo cuando el notario se equivoca es cuando más
  // necesita leer la condición del instructivo que explica por qué el campo
  // está ahí. Antes el error la borraba.
  const pie = (
    <>
      {problema && <p className="text-[13px] text-destructive mt-1">{problema}</p>}
      {campo.condicion && (
        <p className="text-[13px] text-muted-foreground mt-1">{campo.condicion}</p>
      )}
    </>
  );

  if (control === "catalogo" && codigoCatalogo) {
    return (
      <div>
        <SelectCatalogo
          catalogo={codigoCatalogo}
          etiqueta={campo.nombre}
          valor={valor}
          onChange={onChange}
        />
        {pie}
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
            <SelectValue placeholder="Seleccione…" />
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
          aria-invalid={!!problema}
          className={cn(problema && "border-destructive focus-visible:ring-destructive")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {pie}
    </div>
  );
}
