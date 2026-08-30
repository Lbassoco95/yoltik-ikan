import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CampoActo } from "@/components/aviso/CampoActo";
import { ramaDelActo, type NodoRama } from "@/lib/aviso/ramas-acto";
import {
  agregarRepeticion,
  escribirValor,
  escribirVariante,
  leerValor,
  leerVariante,
  numeroRepeticiones,
  quitarRepeticion,
  type DatosActo,
} from "@/lib/aviso/valores-acto";

/**
 * Captura del subárbol propio del tipo de acto.
 *
 * La pantalla se arma desde el diccionario del instructivo, no a mano: un poder
 * pide poderdantes y apoderados, una constitución pide socios y capital, y son
 * diez ramas distintas. Cuando el SAT publique otra versión del layout se
 * regenera el diccionario y esto cambia solo.
 *
 * Tres reglas de la captura:
 *
 *   - Los grupos repetibles son listas: "agregar apoderado", no un formulario
 *     fijo de uno. El layout admite varios y el notario suele tener varios.
 *   - `<tipo_persona>` es un selector de tres, no tres formularios abiertos.
 *     Cambiar de opción borra lo capturado en la anterior, porque si no el XML
 *     llevaría una persona a medias escondida bajo otra.
 *   - Las fechas se guardan en ISO. La conversión a AAAAMMDD la hace el
 *     generador del XML, en un solo lugar.
 */
export function CapturaActo({
  tipoActo,
  datos,
  onChange,
  soloLectura,
}: {
  tipoActo: string;
  datos: DatosActo;
  onChange: (datos: DatosActo) => void;
  soloLectura?: boolean;
}) {
  const rama = ramaDelActo(tipoActo);

  if (!rama)
    return (
      <p className="text-sm text-muted-foreground">
        Este acto no tiene rama propia en el layout de fe pública. Si se presenta por DeclaraNOT,
        el detalle se captura allá.
      </p>
    );

  return (
    <div className="space-y-4">
      <Nodo
        nodo={rama}
        ruta={[]}
        datos={datos}
        onChange={onChange}
        soloLectura={soloLectura}
        nivel={0}
      />
    </div>
  );
}

interface PropsNodo {
  nodo: NodoRama;
  ruta: number[];
  datos: DatosActo;
  onChange: (datos: DatosActo) => void;
  soloLectura?: boolean;
  nivel: number;
}

/** Un nodo: se abre en tantas repeticiones como tenga, y cada una se pinta con
 *  `Contenido`. La raíz del acto nunca es repetible. */
function Nodo({ nodo, ruta, datos, onChange, soloLectura, nivel }: PropsNodo) {
  if (!nodo.repetible)
    return (
      <Contenido
        nodo={nodo}
        ruta={ruta}
        datos={datos}
        onChange={onChange}
        soloLectura={soloLectura}
        nivel={nivel}
      />
    );

  const total = numeroRepeticiones(datos, nodo.no, ruta);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{nodo.nombre}</h4>
        {!soloLectura && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange(agregarRepeticion(datos, nodo.no, ruta))}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Agregar
          </Button>
        )}
      </div>

      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {nodo.nombre} {i + 1} de {total}
            </span>
            {!soloLectura && total > 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChange(quitarRepeticion(datos, nodo.no, ruta, i))}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Quitar
              </Button>
            )}
          </div>
          <Contenido
            nodo={nodo}
            ruta={[...ruta, i]}
            datos={datos}
            onChange={onChange}
            soloLectura={soloLectura}
            nivel={nivel + 1}
          />
        </div>
      ))}
    </section>
  );
}

/** Los campos y los hijos de una repetición concreta del nodo. */
function Contenido({ nodo, ruta, datos, onChange, soloLectura, nivel }: PropsNodo) {
  if (nodo.esTipoPersona)
    return (
      <TipoPersona
        nodo={nodo}
        ruta={ruta}
        datos={datos}
        onChange={onChange}
        soloLectura={soloLectura}
        nivel={nivel}
      />
    );

  return (
    <div className="space-y-3">
      {nodo.campos.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {nodo.campos.map((campo) => (
            <CampoActo
              key={campo.no}
              campo={campo}
              valor={leerValor(datos, campo.no, ruta)}
              soloLectura={soloLectura}
              onChange={(v) => onChange(escribirValor(datos, campo.no, ruta, v))}
            />
          ))}
        </div>
      )}

      {nodo.hijos.map((hijo) => (
        <div
          key={hijo.no}
          className={nivel > 0 && !hijo.repetible ? "border-l-2 pl-3 space-y-3" : "space-y-3"}
        >
          {!hijo.repetible && !hijo.esTipoPersona && (
            <h5 className="text-xs font-medium text-muted-foreground">{hijo.nombre}</h5>
          )}
          <Nodo
            nodo={hijo}
            ruta={ruta}
            datos={datos}
            onChange={onChange}
            soloLectura={soloLectura}
            nivel={nivel + 1}
          />
        </div>
      ))}
    </div>
  );
}

const NOMBRE_VARIANTE: Record<string, string> = {
  persona_fisica: "Persona física",
  persona_moral: "Persona moral",
  fideicomiso: "Fideicomiso",
};

/** Selector de las tres variantes. Sólo se pinta la elegida. */
function TipoPersona({ nodo, ruta, datos, onChange, soloLectura, nivel }: PropsNodo) {
  const elegida = leerVariante(datos, nodo.no, ruta);
  const variante = nodo.hijos.find((h) => h.etiqueta === elegida);

  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <Label>Tipo de persona</Label>
        <Select
          value={elegida ?? ""}
          disabled={soloLectura}
          onValueChange={(v) => onChange(escribirVariante(datos, nodo, ruta, v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecciona…" />
          </SelectTrigger>
          <SelectContent>
            {nodo.hijos.map((h) => (
              <SelectItem key={h.etiqueta} value={h.etiqueta}>
                {NOMBRE_VARIANTE[h.etiqueta] ?? h.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Campos sueltos del propio <tipo_persona>, si la rama trae alguno. */}
      {nodo.campos.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {nodo.campos.map((campo) => (
            <CampoActo
              key={campo.no}
              campo={campo}
              valor={leerValor(datos, campo.no, ruta)}
              soloLectura={soloLectura}
              onChange={(v) => onChange(escribirValor(datos, campo.no, ruta, v))}
            />
          ))}
        </div>
      )}

      {variante ? (
        // Por `Nodo` y no por `Contenido`: en el avalúo la propia
        // <persona_fisica> es repetible, y ahí la lista es la variante.
        <Nodo
          nodo={variante}
          ruta={ruta}
          datos={datos}
          onChange={onChange}
          soloLectura={soloLectura}
          nivel={nivel + 1}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Elige el tipo de persona para ver los datos que pide el layout.
        </p>
      )}
    </div>
  );
}
