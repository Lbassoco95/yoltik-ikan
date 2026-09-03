import { AlertTriangle, BadgeCheck, CircleDashed, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn, formatMxn } from "@/lib/utils";
import { useParametros } from "@/hooks/useParametros";
import { PARAM, esReferenciaSinConfirmar } from "@/lib/parametros";
import { EncabezadoSeccion } from "@/components/estela/EncabezadoSeccion";
import { CartuchoParametro } from "@/components/estela/CartuchoParametro";
import { EstadoVacio } from "@/components/estela/EstadoVacio";

// Estas dos secciones siguen siendo maqueta del scaffold: el Motor PLD real
// evalúa `tipologia_av.regla_dsl`, no estos interruptores. Conectarlas a las
// tipologías reales es trabajo del bloque de saneamiento; mientras tanto van
// con banner ámbar visible, nunca como si fueran configuración efectiva.
const behaviorRules = [
  { name: "Desviación del perfil transaccional", sensitivity: 70, active: true },
  { name: "Fragmentación para evadir umbrales", sensitivity: 80, active: true },
  { name: "Operaciones con contrapartes de alto riesgo", sensitivity: 60, active: true },
  { name: "Recursos de personas diferentes al titular", sensitivity: 50, active: true },
  { name: "Incremento inusual en frecuencia de operaciones", sensitivity: 65, active: false },
];

const correlationRules = [
  { name: "Red de transferencias entre vinculados", active: true },
  { name: "Patrones de pitufeo", active: true },
  { name: "Análisis de horario atípico", active: false },
  { name: "Concentración geográfica anómala", active: false },
];

/** Umbrales que el producto muestra en pesos. Todos salen de
 *  `parametro_regulatorio`; la página no declara ninguna cifra propia. */
const UMBRALES_MOSTRADOS = [
  // Fe pública. La constitución de personas morales YA NO aparece: desde la
  // reforma DOF 16/07/2025 el Aviso procede siempre y no hay cifra que mostrar.
  { codigo: PARAM.XII_INMUEBLE, sector: "XII" },
  { codigo: PARAM.XII_FIDEICOMISO, sector: "XII" },
  // Activos virtuales. Sustituyen a los 645 y 3,210 UMA, derogados.
  { codigo: PARAM.XVI_OPERACION, sector: "XVI" },
  { codigo: PARAM.XVI_CONTRAPRESTACION, sector: "XVI" },
  // Artículo 32: prohibición de pago en efectivo. NO son umbrales de Aviso.
  { codigo: PARAM.EFECTIVO_INMUEBLE, sector: "XII" },
  { codigo: PARAM.EFECTIVO_ACCIONES, sector: "XII" },
];

export default function RulesEnginePage() {
  const { parametros, parametro, valor, isLoading, isError, error } = useParametros();

  const uma = parametro(PARAM.UMA_DIARIA);
  const umaMxn = valor(PARAM.UMA_DIARIA);

  const filas = UMBRALES_MOSTRADOS.map((u) => ({
    ...u,
    param: parametro(u.codigo, u.sector),
  })).filter((f) => f.param != null);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ESTELA pide aquí un <SelloVigencia> con el número de versión del
          juego de umbrales. No lo lleva: `parametro_regulatorio` versiona cada
          parámetro por su vigencia, uno a uno, y no hay una versión del
          conjunto que estampar. Poner un «VERSIÓN 4» inventado en la pantalla
          que precisamente sirve para comprobar cifras sería la peor de las
          licencias. El sello sí va en Matriz de riesgo, que sí versiona.
          TODO[Sprint D-2]: si Dirección quiere versionar el juego completo,
          nace en la base y el sello aparece solo. */}
      <EncabezadoSeccion
        titulo="Motor de reglas"
        descripcion="Los umbrales con los que el motor decide, cada uno con la fuente que lo sostiene."
      />

      {/* La UMA. Ya salía con su fuente, pero desperdigada en una línea de
          etiquetas sueltas; el cartucho es la forma que ESTELA le da a esto
          mismo. */}
      {isLoading ? (
        <div className="estela-placa flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando parámetros regulatorios…
        </div>
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-card p-4 text-sm text-destructive">
          No se pudieron leer los parámetros regulatorios: {(error as Error)?.message}
        </p>
      ) : uma ? (
        <div className="flex flex-wrap items-start gap-3">
          <CartuchoParametro parametro={uma} titulo="UMA vigente" className="min-w-[280px] flex-1" />
          {esReferenciaSinConfirmar(uma) && (
            <Badge variant="warning" className="mt-1">
              Pendiente de validación de Cumplimiento
            </Badge>
          )}
        </div>
      ) : (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-4 text-sm text-warning-ink">
          No hay una UMA vigente registrada. Cárgala en parámetros regulatorios antes de
          operar: sin ella el motor no puede calcular umbrales.
        </p>
      )}

      {/* Los umbrales. Antes eran una tabla de cinco columnas donde la fuente
          era la última y quedaba recortada: la columna que justifica la cifra
          era la primera en desaparecer al estrechar la ventana. En ESTELA cada
          umbral es una fila con su cartucho, y la fuente va debajo de la cifra
          —donde se lee— en vez de a su derecha. */}
      <section className="estela-placa p-5">
        <h2 className="m-0 text-base font-bold text-foreground">Umbrales vigentes</h2>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">
          Valores versionados con su fuente. Los edita un administrador de Kawiil; ninguna
          organización puede cambiarlos desde su propia consola.
        </p>

        {filas.length === 0 && !isLoading ? (
          <EstadoVacio
            titulo="No hay umbrales registrados"
            descripcion="Sin umbrales el motor no puede clasificar ninguna operación. Se cargan desde la consola de plataforma."
          />
        ) : (
          <div className="space-y-2.5">
            {filas.map(({ param }) => {
              const sinConfirmar = esReferenciaSinConfirmar(param);
              return (
                <div
                  key={`${param!.codigo}-${param!.sector}`}
                  className="estela-tallada grid gap-4 rounded-md border border-border p-4 sm:grid-cols-[1.1fr_1.5fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-semibold text-foreground">{param!.nombre}</p>
                    <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                      {param!.sector === "*"
                        ? "Todas las actividades"
                        : `Fracción ${param!.sector}`}
                    </p>
                  </div>

                  <CartuchoParametro
                    parametro={param!}
                    titulo="Umbral"
                    compacto
                    equivalencia={
                      umaMxn != null && param!.unidad === "uma"
                        ? formatMxn(param!.valor_numerico * umaMxn)
                        : undefined
                    }
                  />

                  {/* El estado va en texto, no sólo en color: es la regla de la
                      marca y aquí importa el doble, porque «sin confirmar»
                      significa que esa cifra todavía no la coteja nadie. */}
                  {sinConfirmar ? (
                    <Badge variant="warning" className="h-fit gap-1 justify-self-start sm:justify-self-end">
                      <CircleDashed className="h-3 w-3" aria-hidden /> Sin confirmar
                    </Badge>
                  ) : (
                    <Badge variant="success" className="h-fit gap-1 justify-self-start sm:justify-self-end">
                      <BadgeCheck className="h-3 w-3" aria-hidden /> Validado
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {parametros.some(esReferenciaSinConfirmar) && (
          <p className="mt-3 text-[13px] text-warning-ink">
            Los umbrales marcados «Sin confirmar» provienen de fuentes secundarias y todavía no
            los valida Kawiil-Cumplimiento contra el texto legal vigente.
          </p>
        )}
      </section>

      <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ikan-ambar" />
        <span className="text-foreground">
          <strong>DEMO — sin configuración real.</strong> Las dos secciones siguientes son maqueta:
          el Motor PLD evalúa las reglas de <code className="estela-dato text-[12px]">tipologia_av</code>, y estos interruptores no las
          modifican. Conectarlas es trabajo pendiente.
        </span>
      </div>

      {/* Behavior Rules — maqueta */}
      <div className="estela-placa p-5 opacity-80">
        <h2 className="mb-4 text-base font-bold text-foreground">Reglas de comportamiento</h2>
        <div className="space-y-3">
          {behaviorRules.map((rule) => (
            <div key={rule.name} className="flex items-center gap-4 rounded-md bg-muted/40 p-4">
              <Switch checked={rule.active} disabled />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{rule.name}</p>
                <div className="mt-2 flex items-center gap-4">
                  <span className="w-24 text-xs text-muted-foreground">Sensibilidad</span>
                  <Slider defaultValue={[rule.sensitivity]} max={100} step={5} disabled className="max-w-xs flex-1" />
                  <span className="estela-dato w-10 text-xs text-muted-foreground">{rule.sensitivity}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Correlation Rules — maqueta */}
      <div className="estela-placa p-5 opacity-80">
        <h2 className="mb-4 text-base font-bold text-foreground">Reglas de correlación</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {correlationRules.map((rule) => (
            <div key={rule.name} className="flex items-center gap-3 rounded-md bg-muted/40 p-4">
              <Switch checked={rule.active} disabled />
              <span className={cn("text-sm font-medium", rule.active ? "text-foreground" : "text-muted-foreground")}>
                {rule.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
