import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth-context';
import {
  agregarNotaHallazgo,
  cambiarEstadoHallazgo,
  cambiarUrgenciaHallazgo,
  listarBitacoraHallazgo,
  listarDocumentosHallazgo,
  MIME_DOCUMENTOS_PERMITIDOS,
  subirDocumentoHallazgo,
  TAMANO_MAX_DOCUMENTO_BYTES,
  urlFirmadaDocumento,
} from '@/lib/api/hallazgos';
import {
  CLASIFICACIONES_URGENCIA,
  ESTADO_CLASS,
  ESTADO_LABEL,
  ESTADOS_HALLAZGO,
  SEVERIDAD_CLASS,
  TIPO_BITACORA_LABEL,
  URGENCIA_CLASS,
  URGENCIA_DESCRIPCION,
  URGENCIA_LABEL,
  URGENCIA_NOTA,
  urgenciaValida,
} from '@/lib/hallazgos-labels';
import { labelTipoActo } from '@/lib/perfil-actividad';
import { cn, formatMxn } from '@/lib/utils';
import type {
  ClasificacionUrgencia,
  EstadoHallazgo,
  Hallazgo,
  TipoBitacoraHallazgo,
} from '@/types/domain';

interface Props {
  hallazgo: Hallazgo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Folio del expediente. Lo emite la BD al crear el hallazgo con el formato
 *  configurado por la organización (migration 0008). Los hallazgos previos al
 *  backfill pueden no tenerlo; en ese caso no se inventa uno. */
function folio(h: Hallazgo): string {
  return h.folio ?? 'Sin folio';
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pesoLegible(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ICONO_BITACORA: Record<TipoBitacoraHallazgo, typeof FileText> = {
  cambio_estado: ArrowRight,
  cambio_urgencia: AlertTriangle,
  documento_subido: FileText,
  nota: MessageSquare,
};

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium text-foreground mt-0.5">{children}</div>
    </div>
  );
}

export default function ExpedienteHallazgoDialog({ hallazgo, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { session, profile, roles } = useAuth();
  const [tab, setTab] = useState('detalle');
  const [nota, setNota] = useState('');
  const inputArchivo = useRef<HTMLInputElement>(null);

  const hallazgoId = hallazgo?.id ?? null;
  const usuarioId = session?.user?.id ?? null;
  const organizationId = profile?.organization_id ?? null;
  // Escribir en el expediente es facultad del OC (política RLS de la
  // migration 0007). El Admin lo ve en solo lectura.
  const puedeEscribir = roles.includes('oc') && !!usuarioId && !!organizationId;

  // Al abrir otro hallazgo se vuelve a la primera pestaña y se limpia la nota.
  useEffect(() => {
    if (open) {
      setTab('detalle');
      setNota('');
    }
  }, [open, hallazgoId]);

  const documentos = useQuery({
    queryKey: ['hallazgo', hallazgoId, 'documentos'],
    queryFn: () => listarDocumentosHallazgo(hallazgoId as string),
    enabled: open && !!hallazgoId,
  });

  const bitacora = useQuery({
    queryKey: ['hallazgo', hallazgoId, 'bitacora'],
    queryFn: () => listarBitacoraHallazgo(hallazgoId as string),
    enabled: open && !!hallazgoId,
  });

  /** Tras cualquier escritura: la bandeja y la bitácora quedan desfasadas. */
  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ['hallazgos'] });
    queryClient.invalidateQueries({ queryKey: ['hallazgos', 'abiertos', 'count'] });
    queryClient.invalidateQueries({ queryKey: ['hallazgo', hallazgoId, 'bitacora'] });
  }

  const mutEstado = useMutation({
    mutationFn: (estado: EstadoHallazgo) =>
      cambiarEstadoHallazgo(hallazgoId as string, estado),
    onSuccess: (_d, estado) => {
      refrescar();
      toast.success(`Estado actualizado a "${ESTADO_LABEL[estado]}". Quedó en la bitácora.`);
    },
    onError: (e: Error) => toast.error(`No se pudo cambiar el estado: ${e.message}`),
  });

  const mutUrgencia = useMutation({
    mutationFn: (clasificacion: ClasificacionUrgencia) =>
      cambiarUrgenciaHallazgo(hallazgoId as string, clasificacion),
    onSuccess: (_d, clasificacion) => {
      refrescar();
      toast.success(
        `Clasificación actualizada a "${URGENCIA_LABEL[clasificacion]}". Quedó en la bitácora.`,
      );
    },
    onError: (e: Error) => toast.error(`No se pudo cambiar la clasificación: ${e.message}`),
  });

  const mutSubir = useMutation({
    mutationFn: (archivo: File) =>
      subirDocumentoHallazgo({
        hallazgoId: hallazgoId as string,
        organizationId: organizationId as string,
        usuarioId: usuarioId as string,
        archivo,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hallazgo', hallazgoId, 'documentos'] });
      queryClient.invalidateQueries({ queryKey: ['hallazgo', hallazgoId, 'bitacora'] });
      if (inputArchivo.current) inputArchivo.current.value = '';
      toast.success('Documento cargado al expediente.');
    },
    onError: (e: Error) => toast.error(`No se pudo cargar el documento: ${e.message}`),
  });

  const mutNota = useMutation({
    mutationFn: (texto: string) =>
      agregarNotaHallazgo({
        hallazgoId: hallazgoId as string,
        organizationId: organizationId as string,
        usuarioId: usuarioId as string,
        texto,
      }),
    onSuccess: () => {
      setNota('');
      queryClient.invalidateQueries({ queryKey: ['hallazgo', hallazgoId, 'bitacora'] });
      toast.success('Nota agregada a la bitácora.');
    },
    onError: (e: Error) => toast.error(`No se pudo agregar la nota: ${e.message}`),
  });

  async function abrirDocumento(storagePath: string) {
    try {
      const url = await urlFirmadaDocumento(storagePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error(`No se pudo abrir el documento: ${(e as Error).message}`);
    }
  }

  const notaReferencia = useMemo(() => {
    const v = hallazgo?.regla_payload?.nota_referencia;
    return typeof v === 'string' ? v : null;
  }, [hallazgo]);

  const esMock = hallazgo?.regla_payload?.fuente_mock === true;

  /** La trayectoria del cliente al momento de evaluar, que el motor guarda
   *  dentro del hallazgo. Es lo que distingue «cambió su patrón» de «es su
   *  primera operación», y sin ella el OC no puede juzgar el hallazgo. */
  const contexto = hallazgo?.regla_payload?.contexto_cliente as
    | {
        operaciones_previas?: number;
        dias_de_historial?: number;
        meses_con_actividad?: number;
        perfil_declarado?: boolean;
        matriz_evaluada?: boolean;
        sin_linea_base?: boolean;
      }
    | undefined;
  const urgencia = urgenciaValida(hallazgo?.clasificacion_urgencia);
  const tipoActo = hallazgo?.operation?.contraparte?.tipo_acto;

  if (!hallazgo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>Expediente del hallazgo</span>
            <span className="estela-dato text-xs text-muted-foreground">
              {folio(hallazgo)}
            </span>
            <span className={cn('status-badge text-xs', ESTADO_CLASS[hallazgo.estado])}>
              {ESTADO_LABEL[hallazgo.estado]}
            </span>
            {urgencia && (
              <span className={cn('status-badge text-xs', URGENCIA_CLASS[urgencia])}>
                {URGENCIA_LABEL[urgencia]}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {hallazgo.tipologia_codigo} · {hallazgo.tipologia_nombre}
          </DialogDescription>
        </DialogHeader>

        {!puedeEscribir && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Expediente en solo lectura. Cargar documentos, capturar notas y cambiar el estado
              son facultades del Oficial de Cumplimiento.
            </span>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="detalle">Detalle</TabsTrigger>
            <TabsTrigger value="documentos">
              Documentos{documentos.data?.length ? ` (${documentos.data.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="bitacora">Bitácora</TabsTrigger>
          </TabsList>

          {/* ---------------------------- Detalle ---------------------------- */}
          <TabsContent value="detalle" className="space-y-4 pt-4">
            {contexto && (
              <div
                className={cn(
                  'rounded-md border px-4 py-3 text-sm',
                  contexto.sin_linea_base
                    ? 'border-warning/40 bg-warning/10'
                    : 'border-border bg-muted/30',
                )}
              >
                <p className="estela-antetitulo text-muted-foreground mb-2">
                  Trayectoria del cliente al detectarse
                </p>

                {contexto.sin_linea_base ? (
                  <p className="mb-2">
                    <strong>Es de sus primeras operaciones.</strong> No hay historial contra el
                    cual comparar su comportamiento, así que este hallazgo viene de una regla de
                    umbral, no de un patrón que haya cambiado.
                  </p>
                ) : (
                  <p className="mb-2 text-muted-foreground">
                    {contexto.operaciones_previas} operaciones previas ·{' '}
                    {contexto.meses_con_actividad} meses con actividad ·{' '}
                    {contexto.dias_de_historial} días como cliente
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <span
                    className={cn(
                      'status-badge text-xs',
                      contexto.matriz_evaluada
                        ? 'bg-success/10 text-success'
                        : 'bg-warning/10 text-warning-ink',
                    )}
                  >
                    {contexto.matriz_evaluada
                      ? 'Matriz de riesgo evaluada'
                      : 'Sin matriz de riesgo evaluada'}
                  </span>
                  <span
                    className={cn(
                      'status-badge text-xs',
                      contexto.perfil_declarado
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-warning/10 text-warning-ink',
                    )}
                  >
                    {contexto.perfil_declarado
                      ? 'Perfil transaccional declarado'
                      : 'Sin perfil transaccional declarado'}
                  </span>
                </div>

                {!contexto.matriz_evaluada && (
                  <p className="text-xs text-warning-ink mt-2">
                    La debida diligencia está incompleta: evalúa su matriz antes de resolver.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Campo label="Folio">
                <span className="estela-dato">{folio(hallazgo)}</span>
              </Campo>
              <Campo label="Tipología">
                <span className="estela-dato">{hallazgo.tipologia_codigo}</span> ·{' '}
                {hallazgo.tipologia_nombre}
              </Campo>
              <Campo label="Compareciente">
                {hallazgo.client?.nombre_razon_social ?? '—'}
              </Campo>
              <Campo label="Tipo de acto">
                {tipoActo ? labelTipoActo(tipoActo) : (hallazgo.operation?.tipo ?? '—')}
              </Campo>
              <Campo label="Monto">
                {hallazgo.operation ? formatMxn(hallazgo.operation.monto_mxn) : '—'}
                {hallazgo.operation?.activo_virtual
                  ? ` · ${hallazgo.operation.activo_virtual}`
                  : ''}
              </Campo>
              <Campo label="Fecha del acto">
                {hallazgo.operation?.fecha
                  ? new Date(hallazgo.operation.fecha).toLocaleDateString('es-MX')
                  : '—'}
              </Campo>
              <Campo label="Severidad">
                <span
                  className={cn('status-badge text-xs', SEVERIDAD_CLASS[hallazgo.severidad])}
                >
                  {hallazgo.severidad}
                </span>
              </Campo>
              <Campo label="Detectado el">{fechaHora(hallazgo.creado_en)}</Campo>
            </div>

            {notaReferencia && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                <strong>Nota de la regla:</strong> {notaReferencia}
              </div>
            )}

            {esMock && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warning-ink" />
                <span>
                  <strong>DEMO — sin integración real.</strong> Este hallazgo usa datos simulados
                  (listas de riesgo o analítica on-chain como snapshot en BD).
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground" htmlFor="estado-hallazgo">
                  Estado
                </label>
                <Select
                  value={hallazgo.estado}
                  onValueChange={(v) => mutEstado.mutate(v as EstadoHallazgo)}
                  disabled={!puedeEscribir || mutEstado.isPending}
                >
                  <SelectTrigger id="estado-hallazgo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADOS_HALLAZGO.map((e) => (
                      <SelectItem key={e} value={e}>
                        {ESTADO_LABEL[e]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[13px] text-muted-foreground">
                  Cada cambio queda registrado en la bitácora.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground" htmlFor="urgencia-hallazgo">
                  Clasificación de urgencia
                </label>
                <Select
                  value={urgencia ?? undefined}
                  onValueChange={(v) => mutUrgencia.mutate(v as ClasificacionUrgencia)}
                  disabled={!puedeEscribir || mutUrgencia.isPending}
                >
                  <SelectTrigger id="urgencia-hallazgo">
                    <SelectValue placeholder="Sin clasificar" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASIFICACIONES_URGENCIA.map((u) => (
                      <SelectItem key={u} value={u}>
                        {URGENCIA_LABEL[u]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[13px] text-muted-foreground">
                  {urgencia ? `${URGENCIA_DESCRIPCION[urgencia]} ` : ''}Asignada automáticamente
                  por la regla que generó el hallazgo; editable. {URGENCIA_NOTA}
                </p>
              </div>
            </div>
          </TabsContent>

          {/* -------------------------- Documentos --------------------------- */}
          <TabsContent value="documentos" className="space-y-4 pt-4">
            {puedeEscribir && (
              <div className="rounded-md border border-dashed border-border p-4 space-y-2">
                <input
                  ref={inputArchivo}
                  type="file"
                  accept={MIME_DOCUMENTOS_PERMITIDOS.join(',')}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70"
                  onChange={(ev) => {
                    const archivo = ev.target.files?.[0];
                    if (archivo) mutSubir.mutate(archivo);
                  }}
                  disabled={mutSubir.isPending}
                />
                <p className="text-[13px] text-muted-foreground">
                  PDF o imagen (JPG, PNG, WEBP, HEIC), hasta{' '}
                  {Math.round(TAMANO_MAX_DOCUMENTO_BYTES / (1024 * 1024))} MB. Se guarda en un
                  bucket privado; la descarga usa una liga firmada de corta vida.
                </p>
                {mutSubir.isPending && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo…
                  </p>
                )}
              </div>
            )}

            {documentos.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando documentos…
              </p>
            ) : documentos.isError ? (
              <p className="text-sm text-destructive py-6 text-center">
                No se pudieron cargar los documentos:{' '}
                {(documentos.error as Error)?.message}
              </p>
            ) : documentos.data?.length ? (
              <ul className="space-y-2">
                {documentos.data.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-3 rounded-md border border-border p-3"
                  >
                    <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {d.nombre_archivo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.subido_por_nombre ?? 'Usuario —'} · {fechaHora(d.subido_en)} ·{' '}
                        {pesoLegible(d.tamano_bytes)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 shrink-0"
                      onClick={() => abrirDocumento(d.storage_path)}
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Abrir
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <Upload className="w-6 h-6" />
                <p className="text-sm">Sin documentos de soporte todavía.</p>
              </div>
            )}
          </TabsContent>

          {/* --------------------------- Bitácora ---------------------------- */}
          <TabsContent value="bitacora" className="space-y-4 pt-4">
            {puedeEscribir && (
              <div className="space-y-2">
                <Textarea
                  value={nota}
                  onChange={(ev) => setNota(ev.target.value)}
                  placeholder="Nota del Oficial de Cumplimiento sobre este hallazgo…"
                  rows={3}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={!nota.trim() || mutNota.isPending}
                    onClick={() => mutNota.mutate(nota)}
                  >
                    {mutNota.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <MessageSquare className="w-3.5 h-3.5" />
                    )}
                    Agregar nota
                  </Button>
                </div>
              </div>
            )}

            {bitacora.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando bitácora…
              </p>
            ) : bitacora.isError ? (
              <p className="text-sm text-destructive py-6 text-center">
                No se pudo cargar la bitácora: {(bitacora.error as Error)?.message}
              </p>
            ) : bitacora.data?.length ? (
              <ol className="space-y-3">
                {bitacora.data.map((e) => {
                  const Icono = ICONO_BITACORA[e.tipo] ?? MessageSquare;
                  return (
                    <li key={e.id} className="flex gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icono className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1 border-b border-border pb-3">
                        <p className="text-xs font-semibold text-foreground">
                          {TIPO_BITACORA_LABEL[e.tipo] ?? e.tipo}
                        </p>
                        <p className="text-sm text-foreground mt-0.5">
                          {e.tipo === 'cambio_estado' && e.estado_anterior && e.estado_nuevo
                            ? `${ESTADO_LABEL[e.estado_anterior]} → ${ESTADO_LABEL[e.estado_nuevo]}`
                            : e.descripcion}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {e.usuario_nombre ?? 'Sistema'} · {fechaHora(e.creado_en)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">
                Sin actividad registrada todavía.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
