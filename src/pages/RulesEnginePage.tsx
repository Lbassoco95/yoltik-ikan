import { AlertTriangle, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn, formatMxn } from "@/lib/utils";
import { useParametros } from "@/hooks/useParametros";
import { PARAM, esReferenciaSinConfirmar } from "@/lib/parametros";

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
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Motor de Reglas</h1>

      {/* UMA vigente — dato real con su fuente */}
      <div className="glass-card p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando parámetros regulatorios…
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">
            No se pudieron leer los parámetros regulatorios: {(error as Error)?.message}
          </p>
        ) : uma ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-foreground">UMA vigente:</span>
            <span className="text-sm font-mono font-semibold text-accent">
              {formatMxn(uma.valor_numerico, true)}
            </span>
            <span className="text-xs text-muted-foreground">
              desde el {new Date(uma.vigente_desde).toLocaleDateString("es-MX")} · {uma.fuente}
              {uma.publicacion_dof ? ` · ${uma.publicacion_dof}` : ""}
            </span>
            {esReferenciaSinConfirmar(uma) && (
              <span className="status-badge bg-warning/10 text-warning text-xs">
                Pendiente de validación de Cumplimiento
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-warning">
            No hay una UMA vigente registrada. Cárgala en parámetros regulatorios antes de
            operar: sin ella el motor no puede calcular umbrales.
          </p>
        )}
      </div>

      {/* Umbrales — reales, desde parametro_regulatorio */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-1">Umbrales vigentes</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Valores versionados con su fuente. Los edita un administrador de Kawiil; ninguna
          organización puede cambiarlos desde su propia consola.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Umbral", "Alcance", "En UMA", "Equivalente MXN", "Fuente"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map(({ param }) => (
                <tr key={`${param!.codigo}-${param!.sector}`} className="border-b border-border last:border-0">
                  <td className="px-4 py-4 text-sm font-medium text-foreground">
                    {param!.nombre}
                    {esReferenciaSinConfirmar(param) && (
                      <span className="ml-2 status-badge bg-warning/10 text-warning text-xs">
                        Sin confirmar
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm text-muted-foreground">
                    {param!.sector === "*" ? "Todas las actividades" : `Fracción ${param!.sector}`}
                  </td>
                  <td className="px-4 py-4 text-sm font-mono">
                    {param!.valor_numerico.toLocaleString("es-MX")} UMA
                  </td>
                  <td className="px-4 py-4 text-sm font-semibold">
                    {umaMxn != null ? formatMxn(param!.valor_numerico * umaMxn) : "—"}
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">{param!.fuente}</td>
                </tr>
              ))}
              {filas.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No hay umbrales registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {parametros.some(esReferenciaSinConfirmar) && (
          <p className="mt-3 text-[13px] text-warning">
            Los umbrales marcados «Sin confirmar» provienen de fuentes secundarias y todavía no
            los valida Kawiil-Cumplimiento contra el texto legal vigente.
          </p>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
        <span>
          <strong>DEMO — sin configuración real.</strong> Las dos secciones siguientes son maqueta:
          el Motor PLD evalúa las reglas de <code>tipologia_av</code>, y estos interruptores no las
          modifican. Conectarlas es trabajo pendiente.
        </span>
      </div>

      {/* Behavior Rules — maqueta */}
      <div className="glass-card p-6 opacity-80">
        <h2 className="text-lg font-semibold text-foreground mb-4">Reglas de Comportamiento</h2>
        <div className="space-y-4">
          {behaviorRules.map((rule) => (
            <div key={rule.name} className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
              <Switch checked={rule.active} disabled />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{rule.name}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-xs text-muted-foreground w-24">Sensibilidad</span>
                  <Slider defaultValue={[rule.sensitivity]} max={100} step={5} disabled className="flex-1 max-w-xs" />
                  <span className="text-xs font-mono text-muted-foreground w-10">{rule.sensitivity}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Correlation Rules — maqueta */}
      <div className="glass-card p-6 opacity-80">
        <h2 className="text-lg font-semibold text-foreground mb-4">Reglas de Correlación</h2>
        <div className="grid grid-cols-2 gap-4">
          {correlationRules.map((rule) => (
            <div key={rule.name} className="flex items-center gap-3 p-4 rounded-lg bg-muted/30">
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
