import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CampoActo } from "@/components/aviso/CampoActo";
import { ramaDelActo, type NodoRama } from "@/lib/aviso/ramas-acto";
import { clavePendiente, pendientesDelSubarbol } from "@/lib/aviso/completitud";
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
 *
 * Lo que el layout exige se dice aquí, no el día del aviso: el encabezado lleva
 * la cuenta viva de lo que falta y cada campo marca su propio problema en el
 * momento en que se escribe. El notario tiene el expediente abierto ahora; el
 * 17 ya no.
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
        Este acto no tiene rama propia en el formato de fe pública. Si se presenta por DeclaraNOT,
        el detalle se captura allá.
      </p>
    );

  const faltan = pendientesDelSubarbol(tipoActo, datos);

  return (
    <div className="space-y-4">
      {faltan.length === 0 ? (
        <div className="flex items-start gap-2 rounded-md bg-success/10 p-3">
          <CheckCircle2 className="h-4 w-4 mt-0.5 text-success shrink-0" />
          <p className="text-sm text-foreground">
            La rama del acto está completa para el formato del aviso.
          </p>
        </div>
      ) : (
        <div className="rounded-md bg-warning/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-warning-ink shrink-0" />
            <p className="text-sm text-foreground">
              Faltan {faltan.length} dato{faltan.length === 1 ? "" : "s"} que el formato del aviso exige. Sin
              ellos el portal rechaza el aviso.
            </p>
          </div>
          <ul className="mt-2 ml-6 space-y-1">
            {faltan.slice(0, 6).map((p) => (
              <li key={clavePendiente(p)} className="text-xs text-foreground">
                {p.contexto && <span className="text-muted-foreground">{p.contexto} · </span>}
                {p.detalle}
              </li>
            ))}
          </ul>
          {faltan.length > 6 && (
            <p className="text-[13px] text-muted-foreground mt-1 ml-6">
              y {faltan.length - 6} más, marcados abajo.
            </p>
          )}
        </div>
      )}

      {/* La leyenda va aquí y no en un `title` de cada asterisco: `title` no
          aparece en táctil y los lectores de pantalla lo tratan de forma
          irregular. */}
      <p className="text-xs text-muted-foreground">
        <span className="text-destructive">*</span> obligatorio para el aviso
      </p>

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
            Agregar {sustantivo(nodo)}
          </Button>
        )}
      </div>

      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {nodo.nombre} {i + 1} de {total}
            </span>
            {/* Sólo a partir de dos: `quitarRepeticion` nunca baja de una
                —un poder sin ningún apoderado no es un poder— así que el botón
                sobre la única sería un adorno que no hace nada. Un grupo
                opcional que se deja vacío simplemente no se emite. */}
            {!soloLectura && total > 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChange(quitarRepeticion(datos, nodo.no, ruta, i))}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Quitar {sustantivo(nodo)}
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

/** ¿Hay algo capturado en la variante elegida? Decide si vale la pena
 *  preguntar antes de borrarla. */
function hayDatosEnVariante(
  nodo: NodoRama,
  variante: string,
  datos: DatosActo,
  ruta: number[],
): boolean {
  const hijo = nodo.hijos.find((h) => h.etiqueta === variante);
  if (!hijo) return false;
  const conValor = (n: NodoRama): boolean =>
    n.campos.some((c) => leerValor(datos, c.no, ruta).trim() !== "") || n.hijos.some(conValor);
  return conValor(hijo);
}

/** «Datos de los Apoderados» → «apoderado». Con poderdantes y apoderados en
 *  la misma pantalla, un botón que sólo dice «Agregar» no dice cuál. */
function sustantivo(nodo: NodoRama): string {
  const limpio = nodo.nombre
    .replace(/^datos de (los|las|el|la)\s+/i, "")
    .replace(/^datos del?\s+/i, "")
    // «accionistas o socios» → «accionistas»: con la disyuntiva completa el
    // botón decía «Agregar accionistas o socio».
    .split(/\s+[oy]\s+/i)[0]
    .trim()
    .toLowerCase();
  return limpio.replace(/e?s$/, "") || "elemento";
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
          onValueChange={(v) => {
            // Cambiar de variante borra lo capturado en la anterior —tiene que
            // hacerlo, si no el XML llevaría una persona a medias escondida
            // bajo otra— pero hasta ahora lo hacía en silencio: quien capturó
            // ocho campos y tocó el selector por error perdía el trabajo sin
            // enterarse. Sólo se pregunta si de verdad hay algo que perder.
            if (
              elegida &&
              v !== elegida &&
              hayDatosEnVariante(nodo, elegida, datos, ruta) &&
              !window.confirm(
                "Cambiar el tipo de persona borra los datos capturados de la anterior. ¿Continuar?",
              )
            )
              return;
            onChange(escribirVariante(datos, nodo, ruta, v));
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccione…" />
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
          Elija el tipo de persona para ver los datos que pide el formato del aviso.
        </p>
      )}
    </div>
  );
}
