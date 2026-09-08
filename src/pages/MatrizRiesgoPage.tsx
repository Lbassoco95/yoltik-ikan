import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileClock, Loader2, Plus, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { EncabezadoSeccion } from '@/components/estela/EncabezadoSeccion';
import { SelloVigencia } from '@/components/estela/SelloVigencia';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import {
  contarVariables,
  crearBorradorMatriz,
  listarVersionesMatriz,
  publicarMatriz,
} from '@/lib/api/matriz';
import type { ClientRiskTemplate, MatrizElemento, SectorAV } from '@/types/domain';
import { cn } from '@/lib/utils';

// Configuración de la matriz de riesgo de cliente (migration 0010).
//
// PRIMER AVANCE — pendiente de revisión con el usuario antes de construir el
// editor completo. Hoy: ver la versión vigente, su histórico, y el ciclo
// borrador → publicación. La edición campo por campo entra después.
//
// TODO[Sprint D-3]: editor de elementos/variables/opciones sobre el borrador.

function Banda({ etiqueta, min, max, acciones, tono }: {
  etiqueta: string; min: number; max: number; acciones: string; tono: string;
}) {
  return (
    <div className={cn('rounded-md border p-3', tono)}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold capitalize">{etiqueta}</span>
        <span className="text-xs font-mono">{min}–{max}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{acciones}</p>
    </div>
  );
}

function Elemento({ el }: { el: MatrizElemento }) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono font-bold">{el.codigo}</span>
        <span className="text-sm font-semibold">{el.nombre}</span>
        <span className="status-badge bg-muted text-muted-foreground text-xs">
          {el.variables.length} variable{el.variables.length === 1 ? '' : 's'}
        </span>
        {el.aplica_si && (
          <span className="status-badge bg-accent/10 text-accent text-xs" title="Predicado de aplicabilidad">
            {el.aplica_si}
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-1.5">
        {el.variables.map((v) => (
          <li key={v.codigo} className="text-xs text-muted-foreground flex gap-2">
            <span className="font-mono shrink-0">{v.codigo}</span>
            <span className="text-foreground">{v.pregunta}</span>
            <span className="ml-auto shrink-0">{v.opciones.length} opc.</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MatrizRiesgoPage() {
  const { profile, activeRole } = useAuth();
  const queryClient = useQueryClient();
  const esOc = activeRole === 'oc';

  // El sector sale de la ORGANIZACIÓN, no de una constante. Antes estaba
  // clavado a 'XVI', así que una notaría pedía la matriz de un exchange: no
  // encontraba la suya y, si alguien creaba un borrador, lo creaba en el
  // sector equivocado. Si la organización opera más de uno, se elige.
  const sectoresOrg = useMemo<SectorAV[]>(
    () => profile?.organization_sectores ?? [],
    [profile?.organization_sectores],
  );
  const [sectorElegido, setSectorElegido] = useState<SectorAV | null>(null);
  const sector: SectorAV | null = sectorElegido ?? sectoresOrg[0] ?? null;

  const { data: versiones = [], isLoading, isError, error } = useQuery({
    queryKey: ['matriz', sector],
    queryFn: () => listarVersionesMatriz(sector as SectorAV),
    enabled: sector != null,
  });

  const activa = useMemo(() => versiones.find((v) => v.activa), [versiones]);
  const borrador = useMemo(() => versiones.find((v) => v.estado === 'borrador'), [versiones]);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['matriz', sector] });

  const crear = useMutation({
    mutationFn: () => crearBorradorMatriz(profile!.organization_id, sector as SectorAV),
    onSuccess: (t) => {
      invalidar();
      toast.success(`Borrador v${t.version} creado a partir de la versión vigente.`);
    },
    onError: (e: Error) => toast.error(`No se pudo crear el borrador: ${e.message}`),
  });

  const publicar = useMutation({
    mutationFn: (id: string) => publicarMatriz(id),
    onSuccess: (t) => {
      invalidar();
      toast.success(`Versión v${t.version} publicada y vigente.`);
    },
    onError: (e: Error) => toast.error(`No se pudo publicar: ${e.message}`),
  });

  const mostrada: ClientRiskTemplate | undefined = borrador ?? activa;

  return (
    <div className="space-y-6 animate-fade-in">
      <EncabezadoSeccion
        titulo="Matriz de riesgo de cliente"
        descripcion="Metodología vigente y su histórico de versiones. Una versión publicada es inmutable: los cambios se hacen en un borrador y se publican como versión nueva."
        acciones={
          <>
            {esOc && !borrador && (
              <Button className="gap-2" onClick={() => crear.mutate()} disabled={crear.isPending}>
                {crear.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Nueva versión
              </Button>
            )}
            {/* El sello va aquí y no en Motor de reglas porque aquí la versión
                existe de verdad: `client_risk_template` versiona, publica y
                archiva. «Inmutable» tampoco es una frase de diseño —una
                versión publicada no se edita, se sucede—, así que el sello
                dice lo que el modelo ya garantiza. */}
            {activa && (
              <SelloVigencia version={activa.version} size={78} />
            )}
          </>
        }
      />

      {/* La ponderación NO está validada, pero el cálculo sí existe: la matriz
          evalúa y persiste el assessment desde 864ec92. El aviso anterior decía
          que no calculaba, y era falso. */}
      <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ikan-ambar" aria-hidden />
        <span>
          <strong>Ponderación sin validar.</strong> El puntaje sí se calcula y se guarda
          al evaluar a un cliente, pero los pesos y las bandas de esta plantilla son una
          propuesta pendiente de validación con Kawiil-Cumplimiento.
        </span>
      </div>

      {sectoresOrg.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Fracción:</span>
          <div className="flex gap-2">
            {sectoresOrg.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === sector ? 'default' : 'outline'}
                onClick={() => setSectorElegido(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
      )}

      {sector == null && !isLoading && (
        <div className="estela-placa p-5 text-sm text-muted-foreground">
          Tu organización no tiene ninguna fracción de actividad vulnerable
          registrada, así que no se puede saber qué matriz corresponde.
          La da de alta Kawiil: escríbeles para que la registren.
        </div>
      )}

      {isLoading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando matriz…
        </div>
      ) : isError ? (
        <div className="p-8 text-center text-destructive text-sm">
          No se pudo cargar la matriz: {(error as Error)?.message}
        </div>
      ) : !mostrada ? (
        <div className="estela-placa p-8 text-center text-sm text-muted-foreground">
          Esta organización todavía no tiene una matriz configurada para el sector {sector}.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="estela-placa p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Versión {mostrada.version}</span>
                  <span
                    className={cn(
                      'status-badge text-xs',
                      mostrada.estado === 'borrador'
                        ? 'bg-warning/15 text-warning-ink'
                        : 'bg-success/10 text-success',
                    )}
                  >
                    {mostrada.estado === 'borrador' ? 'Borrador' : 'Publicada'}
                  </span>
                  {mostrada.activa && (
                    <span className="status-badge bg-accent/10 text-accent text-xs">Vigente</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {`${mostrada.configuracion.elementos.length} elementos · ${contarVariables(mostrada.configuracion)} variables`}
                </span>
              </div>
              {mostrada.notas_version && (
                <p className="text-xs text-muted-foreground mt-2 italic">{mostrada.notas_version}</p>
              )}
              {mostrada.estado === 'borrador' && esOc && (
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Al publicar, esta versión pasa a ser la vigente y la anterior se archiva.
                  </p>
                  <Button
                    size="sm"
                    className="gap-2 shrink-0"
                    onClick={() => publicar.mutate(mostrada.id)}
                    disabled={publicar.isPending}
                  >
                    {publicar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Publicar versión
                  </Button>
                </div>
              )}
            </div>

            {mostrada.configuracion.elementos.map((el) => (
              <Elemento key={el.codigo} el={el} />
            ))}
          </div>

          <div className="space-y-4">
            <div className="estela-placa p-4">
              <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <ShieldCheck className="w-4 h-4" /> Bandas de clasificación
              </h2>
              <div className="space-y-2">
                <Banda etiqueta="bajo" tono="border-success/40 bg-success/5" {...mostrada.configuracion.escala_cliente.bajo} />
                <Banda etiqueta="medio" tono="border-warning/40 bg-warning/5" {...mostrada.configuracion.escala_cliente.medio} />
                <Banda etiqueta="alto" tono="border-destructive/40 bg-destructive/5" {...mostrada.configuracion.escala_cliente.alto} />
              </div>
            </div>

            {mostrada.configuracion.triggers_alto_de_oficio?.length > 0 && (
              <div className="estela-placa p-4">
                <h2 className="text-sm font-semibold mb-3">Alto de oficio</h2>
                <ul className="space-y-1.5">
                  {mostrada.configuracion.triggers_alto_de_oficio.map((t) => (
                    <li key={t.codigo} className="text-xs flex gap-2">
                      <span className="font-mono shrink-0 text-destructive">{t.codigo}</span>
                      <span className="text-muted-foreground">{t.descripcion}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="estela-placa p-4">
              <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <FileClock className="w-4 h-4" /> Histórico
              </h2>
              <ul className="space-y-2">
                {versiones.map((v) => (
                  <li key={v.id} className="text-xs flex items-center gap-2">
                    <span className="font-mono">v{v.version}</span>
                    <span className="text-muted-foreground">
                      {v.estado === 'borrador' ? 'borrador' : new Date(v.publicada_en ?? v.creada_en).toLocaleDateString('es-MX')}
                    </span>
                    {v.activa && <span className="ml-auto text-primary">vigente</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
