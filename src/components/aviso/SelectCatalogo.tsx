import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCatalogo } from "@/hooks/useCatalogo";
import { cn } from "@/lib/utils";

/**
 * Lista desplegable respaldada por un catálogo de la base, con buscador.
 *
 * Lo que guarda es LA CLAVE con la que se manda el informe; lo que muestra es
 * la descripción. Quien captura no tiene por qué saberse el número de su
 * estado, y el portal rechaza el aviso si la clave no existe.
 *
 * DOS COSAS QUE CAMBIARON, Y LAS DOS SON LA MISMA
 *
 * El catálogo de actividades económicas de la UIF tiene cientos de renglones.
 * Con una lista sin buscador, encontrar «notario» significaba desplazarse por
 * pesca, minería y refinación de petróleo; y en la práctica quien captura se
 * rinde y elige lo primero que se parece, que es peor que dejarlo vacío.
 * Ahora se escribe y se filtra.
 *
 * Y la clave dejó de mostrarse pegada a la descripción. «2130100 MINERIA…» le
 * pide a un notario que lea un número que no significa nada para él y que no
 * puede verificar; el número es de la UIF y del XML, no suyo. Se guarda igual,
 * viaja igual en el aviso, y se sigue viendo en el detalle de cada renglón
 * —en pequeño, al margen— para quien esté depurando un aviso rechazado.
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
  const { valores, cargando, cargado, descripcionDe } = useCatalogo(catalogo);
  const [abierto, setAbierto] = useState(false);

  const elegido = descripcionDe(valor);

  return (
    <div>
      <Label>{etiqueta}</Label>

      {cargado ? (
        <Popover open={abierto} onOpenChange={setAbierto}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={abierto}
              className="w-full justify-between font-normal"
            >
              <span className={cn("truncate", !elegido && "text-muted-foreground")}>
                {elegido ?? (cargando ? "Cargando…" : placeholder)}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command
              // Se busca por descripción Y por clave: quien depura un aviso
              // rechazado llega con el número en la mano, no con el texto.
              filter={(value, search) =>
                value.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0
              }
            >
              <CommandInput placeholder={`Buscar en ${etiqueta.toLowerCase()}…`} />
              <CommandList>
                <CommandEmpty>
                  Nada coincide. Prueba con una palabra suelta: el catálogo es el de la UIF y sus
                  nombres no siempre son los de todos los días.
                </CommandEmpty>
                <CommandGroup>
                  {valores.map((v) => (
                    <CommandItem
                      key={v.clave}
                      value={`${v.descripcion} ${v.clave}`}
                      onSelect={() => {
                        onChange(v.clave === valor ? "" : v.clave);
                        setAbierto(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          v.clave === valor ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex-1">{v.descripcion}</span>
                      {/* Al margen y en pequeño: sirve para depurar un aviso
                          rechazado, no para elegir. */}
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground shrink-0">
                        {v.clave}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        <>
          <Input
            value={valor}
            placeholder={cargando ? "Cargando catálogo…" : "Clave"}
            onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
          />
          {!cargando && (
            <p className="text-[13px] text-warning-ink mt-1">
              DEMO — sin integración real: el catálogo de la UIF todavía no está cargado en Ikán,
              así que la clave se captura a mano. La carga Kawiil desde la consola de plataforma.
            </p>
          )}
        </>
      )}

      {ayuda && <p className="text-[13px] text-muted-foreground mt-1">{ayuda}</p>}
    </div>
  );
}
