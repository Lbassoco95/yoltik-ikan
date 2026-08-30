import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCatalogo } from "@/hooks/useCatalogo";

/**
 * Lista desplegable respaldada por un catálogo de la base.
 *
 * Lo que guarda es LA CLAVE con la que se manda el informe; lo que muestra es
 * la descripción. Quien captura no tiene por qué saberse el número de su
 * estado, y el portal rechaza el aviso si la clave no existe.
 *
 * Cuando el catálogo todavía no está cargado NO se queda como una lista vacía:
 * cae a captura manual y dice por qué, con banner ámbar. Un select vacío sin
 * explicación es peor que un campo de texto: parece que la aplicación está rota
 * y no hay manera de avanzar.
 */
export function SelectCatalogo({
  catalogo,
  etiqueta,
  valor,
  onChange,
  placeholder = "Seleccione…",
  ayuda,
}: {
  /** Código del catálogo en `catalogo_sat` (ej. "entidad_federativa"). */
  catalogo: string;
  etiqueta: string;
  valor: string;
  onChange: (clave: string) => void;
  placeholder?: string;
  ayuda?: string;
}) {
  const { valores, cargando, cargado } = useCatalogo(catalogo);

  return (
    <div>
      <Label>{etiqueta}</Label>

      {cargado ? (
        <Select value={valor} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={cargando ? "Cargando…" : placeholder} />
          </SelectTrigger>
          <SelectContent>
            {valores.map((v) => (
              <SelectItem key={v.clave} value={v.clave}>
                <span className="font-mono text-xs mr-2 text-muted-foreground">{v.clave}</span>
                {v.descripcion}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <>
          <Input
            value={valor}
            placeholder={cargando ? "Cargando catálogo…" : "Clave"}
            onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
          />
          {!cargando && (
            <p className="text-[11px] text-warning mt-1">
              DEMO — sin integración real: el catálogo de la UIF todavía no está cargado en Ikán,
              así que la clave se captura a mano. La carga Kawiil desde la consola de plataforma.
            </p>
          )}
        </>
      )}

      {ayuda && <p className="text-[11px] text-muted-foreground mt-1">{ayuda}</p>}
    </div>
  );
}
