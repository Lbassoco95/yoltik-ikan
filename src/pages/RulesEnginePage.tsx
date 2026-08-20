import { UMA_VALUE } from "@/data/mockData";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn, formatMxnWithUnit } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { Banner } from "@/components/shared/Banner";

const thresholdRules = [
  { name: "Operación individual ≥ umbral identificación", threshold: 645, active: true },
  { name: "Operación individual > umbral restricción", threshold: 3210, active: true },
  { name: "Acumulación 6 meses mismo cliente", threshold: 645, active: true },
  { name: "Operación en efectivo > umbral", threshold: 645, active: false },
];

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

export default function RulesEnginePage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Motor de Reglas" />

      <Banner variant="accent" layout="block" className="text-sm">
        <strong>UMA vigente 2026:</strong> ${UMA_VALUE} MXN — Actualización automática INEGI
      </Banner>

      {/* Threshold Rules */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Reglas de Umbral</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Regla", "Umbral UMA", "Equivalente MXN", "Estado"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {thresholdRules.map(rule => (
              <tr key={rule.name} className="border-b border-border last:border-0">
                <td className="px-4 py-4 text-sm font-medium text-foreground">{rule.name}</td>
                <td className="px-4 py-4 text-sm font-mono">{rule.threshold.toLocaleString()} UMA</td>
                <td className="px-4 py-4 text-sm font-semibold">{formatMxnWithUnit(rule.threshold * UMA_VALUE)}</td>
                <td className="px-4 py-4"><Switch checked={rule.active} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Behavior Rules */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Reglas de Comportamiento</h2>
        <div className="space-y-4">
          {behaviorRules.map(rule => (
            <div key={rule.name} className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
              <Switch checked={rule.active} />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{rule.name}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-xs text-muted-foreground w-24">Sensibilidad</span>
                  <Slider defaultValue={[rule.sensitivity]} max={100} step={5} className="flex-1 max-w-xs" />
                  <span className="text-xs font-mono text-muted-foreground w-10">{rule.sensitivity}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Correlation Rules */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Reglas de Correlación</h2>
        <div className="grid grid-cols-2 gap-4">
          {correlationRules.map(rule => (
            <div key={rule.name} className="flex items-center gap-3 p-4 rounded-lg bg-muted/30">
              <Switch checked={rule.active} />
              <span className={cn("text-sm font-medium", rule.active ? "text-foreground" : "text-muted-foreground")}>{rule.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
