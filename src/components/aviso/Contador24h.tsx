/**
 * Contador visible del plazo de 24 h para el Oficial de Cumplimiento.
 * El reloj corre desde el conocimiento; no exige operación celebrada.
 */
import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { iniciarReloj24h, type Reloj24h } from '@/lib/formatos-uif/reloj-24h';
import { cn } from '@/lib/utils';

export function Contador24h({
  fechaConocimiento,
  className,
}: {
  fechaConocimiento: string | Date;
  className?: string;
}) {
  const [reloj, setReloj] = useState<Reloj24h>(() => iniciarReloj24h(fechaConocimiento));

  useEffect(() => {
    const tick = () => setReloj(iniciarReloj24h(fechaConocimiento));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [fechaConocimiento]);

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm',
        reloj.vencido
          ? 'border-destructive/40 bg-destructive/5 text-destructive'
          : 'border-ikan-ambar/40 bg-ikan-ambar/10 text-foreground',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold tracking-tight">{reloj.etiqueta}</p>
        <p className="text-xs text-muted-foreground">
          Conocimiento:{' '}
          {reloj.fechaConocimiento.toLocaleString('es-MX', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
          {' · '}
          Límite:{' '}
          {reloj.plazoLimite.toLocaleString('es-MX', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
          <div
            className={cn('h-full transition-all', reloj.vencido ? 'bg-destructive' : 'bg-ikan-ambar')}
            style={{ width: `${reloj.consumidoPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
