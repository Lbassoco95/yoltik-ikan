import { ScanLine, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetricCard } from "@/components/shared/MetricCard";
import {
  DataTable,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  verificationResultColors,
  type VerificationResult,
} from "@/lib/status-colors";

const verificationMetrics = [
  { label: "Verificaciones hoy", value: 12 },
  { label: "Tasa de aprobación", value: "87%" },
  { label: "Score promedio face match", value: "91%" },
  { label: "Verificaciones fallidas", value: 2 },
];

const recentVerifications = [
  {
    id: "VER-001",
    client: "María González López",
    date: "2026-03-28 14:20",
    docScore: 92,
    livenessScore: 95,
    faceScore: 91,
    curp: true,
    lists: true,
    result: "Aprobado",
  },
  {
    id: "VER-002",
    client: "Carlos Mendoza Ruiz",
    date: "2026-03-28 11:45",
    docScore: 88,
    livenessScore: 72,
    faceScore: 85,
    curp: true,
    lists: false,
    result: "Revisión manual",
  },
  {
    id: "VER-003",
    client: "Ana Sofía Ramírez Torres",
    date: "2026-03-27 16:30",
    docScore: 95,
    livenessScore: 98,
    faceScore: 94,
    curp: true,
    lists: true,
    result: "Aprobado",
  },
  {
    id: "VER-004",
    client: "Roberto Juárez Pineda",
    date: "2026-03-27 10:15",
    docScore: 45,
    livenessScore: 30,
    faceScore: 52,
    curp: false,
    lists: false,
    result: "Rechazado",
  },
];

const verificationSteps = [
  { step: "Captura documento", score: 92, pass: true },
  { step: "OCR y extracción", score: null, pass: true },
  { step: "Validación documento", score: 88, pass: true },
  { step: "Prueba de vida", score: 95, pass: true },
  { step: "Face match", score: 91, pass: true },
  {
    step: "Validación CURP",
    score: null,
    pass: true,
    label: "RENAPO confirmado",
  },
  {
    step: "Consulta listas",
    score: null,
    pass: true,
    label: "Sin coincidencias",
  },
  { step: "Scoring", score: null, pass: true, label: "Riesgo: Bajo" },
  {
    step: "Resolución",
    score: null,
    pass: true,
    label: "Aprobado automáticamente",
  },
];

export default function VerificationPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="ID No Presencial" />

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {verificationMetrics.map((m) => (
          <MetricCard key={m.label} label={m.label} value={m.value} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Table */}
        <div className="col-span-2">
          <DataTable>
            <table className="w-full">
              <DataTableHeader
                headers={[
                  "ID",
                  "Cliente",
                  "Fecha",
                  "Doc",
                  "Liveness",
                  "Face",
                  "CURP",
                  "Listas",
                  "Resultado",
                ]}
                cellPadding="px-3"
              />
              <tbody>
                {recentVerifications.map((v) => (
                  <DataTableRow key={v.id} className="cursor-pointer">
                    <td className="px-3 py-3 text-xs font-mono">{v.id}</td>
                    <td className="px-3 py-3 text-sm font-medium text-foreground">
                      {v.client}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {v.date}
                    </td>
                    <td className="px-3 py-3 text-xs font-bold">
                      {v.docScore}%
                    </td>
                    <td className="px-3 py-3 text-xs font-bold">
                      {v.livenessScore}%
                    </td>
                    <td className="px-3 py-3 text-xs font-bold">
                      {v.faceScore}%
                    </td>
                    <td className="px-3 py-3">
                      {v.curp ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {v.lists ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-warning" />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge
                        className={cn(
                          "text-[10px]",
                          verificationResultColors[
                            v.result as VerificationResult
                          ],
                        )}
                      >
                        {v.result}
                      </StatusBadge>
                    </td>
                  </DataTableRow>
                ))}
              </tbody>
            </table>
          </DataTable>

          {/* Stepper */}
          <div className="glass-card p-6 mt-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Verificación VER-001 — María González López
            </h3>
            <div className="flex items-start gap-0">
              {verificationSteps.map((s, i) => (
                <div key={i} className="flex-1 relative">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold z-10",
                        s.pass
                          ? "bg-success text-success-foreground"
                          : "bg-destructive text-destructive-foreground",
                      )}
                    >
                      {s.score ? `${s.score}%` : "✓"}
                    </div>
                    <p className="text-[10px] text-center text-muted-foreground mt-2 px-1">
                      {s.step}
                    </p>
                    {s.label && (
                      <p className="text-[9px] text-center text-success font-medium mt-0.5">
                        {s.label}
                      </p>
                    )}
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
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Configuración de umbrales
          </h3>
          <div className="space-y-6">
            {[
              { label: "Score mínimo documento", value: 80 },
              { label: "Score mínimo liveness", value: 90 },
              { label: "Score mínimo face match", value: 85 },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-foreground">{s.label}</span>
                  <span className="text-sm font-bold text-foreground">
                    {s.value}%
                  </span>
                </div>
                <Slider defaultValue={[s.value]} max={100} step={5} />
              </div>
            ))}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground">
                  Intentos máximos
                </span>
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
