import { ScanLine, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const verificationMetrics = [
  { label: "Verificaciones hoy", value: 12 },
  { label: "Tasa de aprobación", value: "87%" },
  { label: "Score promedio face match", value: "91%" },
  { label: "Verificaciones fallidas", value: 2 },
];

const recentVerifications = [
  { id: "VER-001", client: "María González López", date: "2026-03-28 14:20", docScore: 92, livenessScore: 95, faceScore: 91, curp: true, lists: true, result: "Aprobado" },
  { id: "VER-002", client: "Carlos Mendoza Ruiz", date: "2026-03-28 11:45", docScore: 88, livenessScore: 72, faceScore: 85, curp: true, lists: false, result: "Revisión manual" },
  { id: "VER-003", client: "Ana Sofía Ramírez Torres", date: "2026-03-27 16:30", docScore: 95, livenessScore: 98, faceScore: 94, curp: true, lists: true, result: "Aprobado" },
  { id: "VER-004", client: "Roberto Juárez Pineda", date: "2026-03-27 10:15", docScore: 45, livenessScore: 30, faceScore: 52, curp: false, lists: false, result: "Rechazado" },
];

const verificationSteps = [
  { step: "Captura documento", score: 92, pass: true },
  { step: "OCR y extracción", score: null, pass: true },
  { step: "Validación documento", score: 88, pass: true },
  { step: "Prueba de vida", score: 95, pass: true },
  { step: "Face match", score: 91, pass: true },
  { step: "Validación CURP", score: null, pass: true, label: "RENAPO confirmado" },
  { step: "Consulta listas", score: null, pass: true, label: "Sin coincidencias" },
  { step: "Scoring", score: null, pass: true, label: "Riesgo: Bajo" },
  { step: "Resolución", score: null, pass: true, label: "Aprobado automáticamente" },
];

const resultColors = {
  Aprobado: "bg-success/10 text-success",
  Rechazado: "bg-destructive/10 text-destructive",
  "Revisión manual": "bg-warning/10 text-warning",
};

export default function VerificationPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">ID No Presencial</h1>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {verificationMetrics.map(m => (
          <div key={m.label} className="metric-card">
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-accent" />
            <p className="text-xs font-medium text-muted-foreground uppercase">{m.label}</p>
            <p className="text-3xl font-bold text-foreground mt-1">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Table */}
        <div className="col-span-2">
          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["ID", "Cliente", "Fecha", "Doc", "Liveness", "Face", "CURP", "Listas", "Resultado"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase px-3 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentVerifications.map(v => (
                  <tr key={v.id} className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-xs font-mono">{v.id}</td>
                    <td className="px-3 py-3 text-sm font-medium text-foreground">{v.client}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{v.date}</td>
                    <td className="px-3 py-3 text-xs font-bold">{v.docScore}%</td>
                    <td className="px-3 py-3 text-xs font-bold">{v.livenessScore}%</td>
                    <td className="px-3 py-3 text-xs font-bold">{v.faceScore}%</td>
                    <td className="px-3 py-3">{v.curp ? <CheckCircle className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-destructive" />}</td>
                    <td className="px-3 py-3">{v.lists ? <CheckCircle className="w-4 h-4 text-success" /> : <AlertTriangle className="w-4 h-4 text-warning" />}</td>
                    <td className="px-3 py-3"><span className={cn("status-badge text-[10px]", resultColors[v.result as keyof typeof resultColors])}>{v.result}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stepper */}
          <div className="glass-card p-6 mt-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Verificación VER-001 — María González López</h3>
            <div className="flex items-start gap-0">
              {verificationSteps.map((s, i) => (
                <div key={i} className="flex-1 relative">
                  <div className="flex flex-col items-center">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold z-10",
                      s.pass ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"
                    )}>
                      {s.score ? `${s.score}%` : "✓"}
                    </div>
                    <p className="text-[10px] text-center text-muted-foreground mt-2 px-1">{s.step}</p>
                    {s.label && <p className="text-[9px] text-center text-success font-medium mt-0.5">{s.label}</p>}
                  </div>
                  {i < verificationSteps.length - 1 && (
                    <div className="absolute top-4 left-1/2 w-full h-0.5 bg-success/30" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Config panel */}
        <div className="glass-card p-6 h-fit">
          <h3 className="text-sm font-semibold text-foreground mb-4">Configuración de umbrales</h3>
          <div className="space-y-6">
            {[
              { label: "Score mínimo documento", value: 80 },
              { label: "Score mínimo liveness", value: 90 },
              { label: "Score mínimo face match", value: 85 },
            ].map(s => (
              <div key={s.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-foreground">{s.label}</span>
                  <span className="text-sm font-bold text-foreground">{s.value}%</span>
                </div>
                <Slider defaultValue={[s.value]} max={100} step={5} />
              </div>
            ))}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground">Intentos máximos</span>
                <span className="text-sm font-bold text-foreground">3</span>
              </div>
              <Slider defaultValue={[3]} min={1} max={5} step={1} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
