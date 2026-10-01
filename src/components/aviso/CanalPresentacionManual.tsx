/**
 * Canal único de presentación manual (sin API a la autoridad).
 * Generar/descargar → confirmar presentación → registrar acuse.
 * Acuse de rechazo NO cierra el aviso.
 */
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Contador24h } from '@/components/aviso/Contador24h';
import {
  confirmarPresentacionManual,
  registrarAcuseManual,
  registrarDocumentoAviso,
} from '@/lib/api/formatos-uif';
import {
  decidirPresentacion,
  type EstadoAvisoUif,
  type TipoAvisoUif,
} from '@/lib/formatos-uif/presentacion';
import type { ResumenValidacion } from '@/lib/formatos-uif/validacion';
import { cn } from '@/lib/utils';

export function CanalPresentacionManual({
  avisoId,
  estado,
  tipo,
  xml,
  validacion,
  anexo14Pendiente = true,
  layout = 'fep',
  formatoVersion = 'dof-2026-09-24',
  fechaConocimiento,
  plazoLimite24h,
  onCambio,
}: {
  avisoId: string;
  estado: EstadoAvisoUif;
  tipo: TipoAvisoUif;
  xml: string | null;
  validacion: Pick<ResumenValidacion, 'ok' | 'verificado' | 'errores' | 'noValidados'>;
  anexo14Pendiente?: boolean;
  layout?: string;
  formatoVersion?: string;
  fechaConocimiento?: string | null;
  plazoLimite24h?: string | null;
  onCambio?: () => void;
}) {
  const [acuseTexto, setAcuseTexto] = useState('');
  const [folio, setFolio] = useState('');
  const [busy, setBusy] = useState(false);

  const decision = decidirPresentacion({
    estado,
    tipo,
    tieneXml: Boolean(xml),
    validacion,
    anexoInformeSinOpsPendiente: anexo14Pendiente,
    layout,
    formatoVersion,
  });

  async function descargar() {
    if (!xml) return;
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aviso-${avisoId.slice(0, 8)}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    try {
      await registrarDocumentoAviso({
        avisoId,
        tipo: 'xml',
        nombreArchivo: a.download,
        contenido: xml,
        metadata: { canal: 'manual', accion: 'descarga' },
      });
      toast.success('XML descargado y huella registrada (no se sobrescribe).');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function confirmar() {
    if (!decision.puedePresentar) return;
    setBusy(true);
    try {
      await confirmarPresentacionManual({
        avisoId,
        validacionCompleta: decision.comoVerificado,
        camposNoValidados: validacion.noValidados,
      });
      toast.success(
        decision.comoVerificado
          ? 'Presentación confirmada (verificada).'
          : 'Presentación confirmada sin verificación completa (catálogos pendientes).',
      );
      onCambio?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function registrarAcuse(resultado: 'aceptado' | 'rechazo') {
    if (!acuseTexto.trim()) {
      toast.error('Pegue el texto del acuse antes de registrarlo.');
      return;
    }
    if (resultado === 'aceptado' && !folio.trim()) {
      toast.error('La aceptación requiere el folio de la autoridad.');
      return;
    }
    setBusy(true);
    try {
      await registrarAcuseManual({
        avisoId,
        resultado,
        acuseTexto: acuseTexto.trim(),
        folio: folio.trim() || null,
      });
      if (resultado === 'rechazo') {
        toast.message(
          'Acuse de rechazo registrado. El aviso NO se cierra; el contador de 24 h conserva el plazo original.',
        );
      } else {
        toast.success(`Acuse aceptado con folio ${folio.trim()}. Aviso cerrado.`);
      }
      onCambio?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="estela-placa space-y-4 p-5">
      <div>
        <h3 className="text-base font-semibold text-foreground">Canal de presentación</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Interfaz única · implementación manual. No hay API a la autoridad: genere el XML,
          preséntelo en el portal y registre el acuse aquí.
        </p>
        <p className="mt-2 inline-flex items-center gap-2 rounded border border-ikan-ambar/40 bg-ikan-ambar/10 px-2 py-1 text-xs text-foreground">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          DEMO — sin integración real con el portal SPPLD / UIF
        </p>
        {layout === 'fep' && (
          <p className="mt-2 text-xs text-destructive">
            XML con layout fep (estructura anterior): no se presenta como validado contra el
            formato oficial DOF 24/09/2026.
          </p>
        )}
      </div>

      {fechaConocimiento && (
        <Contador24h
          fechaConocimiento={fechaConocimiento}
          plazoLimite={plazoLimite24h}
        />
      )}

      {!decision.puedePresentar && decision.bloqueos.length > 0 && (
        <ul className="space-y-1 text-sm text-destructive">
          {decision.bloqueos.map((b) => (
            <li key={b}>· {b}</li>
          ))}
        </ul>
      )}
      {decision.advertencias.map((a) => (
        <p key={a} className="text-sm text-warning-ink">
          {a}
        </p>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!xml || busy} onClick={descargar}>
          <Download className="mr-2 h-4 w-4" />
          Generar / descargar XML
        </Button>
        <Button
          type="button"
          disabled={!decision.puedePresentar || busy || estado === 'presentado'}
          onClick={confirmar}
          className={cn(decision.comoVerificado ? 'bg-ikan-jade' : '')}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Confirmar presentación manual
          {!decision.comoVerificado && decision.puedePresentar ? ' (no verificada)' : ''}
        </Button>
      </div>

      {(estado === 'presentado' || estado === 'acuse_rechazo' || estado === 'enviado') && (
        <div className="space-y-3 border-t border-border pt-4">
          <label className="block text-sm font-medium" htmlFor="acuse-folio">
            Folio del acuse (obligatorio para aceptar)
          </label>
          <input
            id="acuse-folio"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Folio asignado por la autoridad…"
            value={folio}
            onChange={(e) => setFolio(e.target.value)}
          />
          <label className="block text-sm font-medium" htmlFor="acuse-texto">
            Texto del acuse
          </label>
          <textarea
            id="acuse-texto"
            className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Pegue el texto del acuse…"
            value={acuseTexto}
            onChange={(e) => setAcuseTexto(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => registrarAcuse('aceptado')}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Registrar acuse aceptado y cerrar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => registrarAcuse('rechazo')}
            >
              Registrar acuse de rechazo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Un acuse de rechazo no cierra el aviso: queda en «acuse_rechazo» y puede volver a generarse.
          </p>
        </div>
      )}
    </section>
  );
}
