/**
 * Plantilla base / Formato oficial — módulo de Reportes.
 * Muestra los campos del anexo DOF que se llenan y los datos del catálogo
 * versionado para corroborar la actualización DOF 24/09/2026.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { cargarPlantillaPerfilAv } from '@/lib/api/formatos-uif';
import {
  etiquetaVersionDof,
  fechaCatalogoMx,
  REGIMEN_FORMATO_LABEL,
} from '@/lib/formatos-uif/etiquetas';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export function PlantillaFormatoDof({
  className,
  abiertoInicial = true,
}: {
  className?: string;
  abiertoInicial?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [filtro, setFiltro] = useState('');

  const q = useQuery({
    queryKey: ['plantilla-formato-dof'],
    queryFn: cargarPlantillaPerfilAv,
  });

  const camposFiltrados = useMemo(() => {
    const campos = q.data?.campos ?? [];
    const t = filtro.trim().toLowerCase();
    if (!t) return campos;
    return campos.filter(
      (c) =>
        c.numero.toLowerCase().includes(t) ||
        c.nombre.toLowerCase().includes(t) ||
        c.etiqueta_xml.toLowerCase().includes(t) ||
        c.obligatoriedad.toLowerCase().includes(t),
    );
  }, [q.data?.campos, filtro]);

  if (q.isLoading) {
    return (
      <div
        className={cn(
          'estela-placa flex items-center gap-2 p-4 text-sm text-muted-foreground',
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando plantilla base del formato oficial…
      </div>
    );
  }

  if (q.isError) {
    return (
      <div
        className={cn(
          'rounded-md border border-destructive/30 bg-card p-4 text-sm text-destructive',
          className,
        )}
      >
        No se pudo cargar el formato oficial: {(q.error as Error).message}
      </div>
    );
  }

  if (!q.data) {
    return (
      <div className={cn('estela-placa p-4 text-sm text-muted-foreground', className)}>
        Sin perfil de actividad vulnerable: no hay formato oficial ligado a esta
        organización.
      </div>
    );
  }

  const { perfil, formato, campos } = q.data;
  const regimen = REGIMEN_FORMATO_LABEL[formato.regimen_entrada] ?? formato.regimen_entrada;

  return (
    <section aria-labelledby="plantilla-base-titulo" className={cn(className)}>
      <Collapsible open={abierto} onOpenChange={setAbierto} className="estela-placa">
        <CollapsibleTrigger className="flex w-full items-start gap-3 rounded-md p-5 text-left hover:bg-muted/40">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="estela-antetitulo m-0 text-accent">Formato oficial</p>
            <h2
              id="plantilla-base-titulo"
              className="m-0 mt-1 text-base font-semibold text-foreground"
            >
              Plantilla base · Anexo {formato.codigo_anexo}
              <span className="font-normal text-muted-foreground">
                {' '}
                · fracción {perfil.fraccion}
              </span>
            </h2>
            <p className="m-0 mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Datos que se estarán subiendo en el aviso: {campos.length.toLocaleString('es-MX')}{' '}
              campos del catálogo versionado ({formato.version}). Publicación DOF{' '}
              {etiquetaVersionDof(formato.version)}. No es el XML; es la plantilla para
              corroborar que corresponde a la actualización del DOF.
            </p>
          </div>
          <ChevronDown
            className={cn(
              'mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              abierto && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-4 border-t border-border px-5 pb-5 pt-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="estela-antetitulo text-muted-foreground">Ámbito</dt>
                <dd className="m-0 mt-0.5 text-foreground">{formato.ambito}</dd>
              </div>
              <div>
                <dt className="estela-antetitulo text-muted-foreground">Estado en catálogo</dt>
                <dd className="m-0 mt-0.5 capitalize text-foreground">{formato.estado}</dd>
              </div>
              <div>
                <dt className="estela-antetitulo text-muted-foreground">Versión</dt>
                <dd className="m-0 mt-0.5 font-mono text-sm text-foreground">{formato.version}</dd>
              </div>
              <div>
                <dt className="estela-antetitulo text-muted-foreground">Publicación DOF</dt>
                <dd className="m-0 mt-0.5 text-foreground">
                  {etiquetaVersionDof(formato.version)}
                </dd>
              </div>
              <div>
                <dt className="estela-antetitulo text-muted-foreground">Régimen de entrada</dt>
                <dd className="m-0 mt-0.5 text-foreground">{regimen}</dd>
              </div>
              <div>
                <dt className="estela-antetitulo text-muted-foreground">Vigente desde</dt>
                <dd className="m-0 mt-0.5 font-mono text-sm text-foreground">
                  {fechaCatalogoMx(formato.vigente_desde)}
                  {formato.vigente_hasta ? ` → ${fechaCatalogoMx(formato.vigente_hasta)}` : ''}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="estela-antetitulo text-muted-foreground">Fuente (catálogo)</dt>
                <dd className="m-0 mt-0.5 text-[13px] leading-relaxed text-foreground">
                  {formato.fuente ?? '—'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="estela-antetitulo text-muted-foreground">Origen en catálogo</dt>
                <dd className="m-0 mt-0.5 font-mono text-xs text-muted-foreground">
                  {formato.archivo_origen ?? '—'} · total declarado {formato.total_campos} ·
                  cargados {campos.length}
                </dd>
              </div>
            </dl>

            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">
                Campos de la plantilla (lo que se llena / sube)
              </p>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  placeholder="Filtrar por número, nombre u obligatoriedad…"
                  className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm"
                  aria-label="Filtrar campos de la plantilla base"
                />
              </div>

              <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                    <tr className="border-b border-border">
                      {['Nº', 'Etiqueta', 'Nombre', 'Obligatoriedad'].map((h) => (
                        <th
                          key={h}
                          className="estela-antetitulo px-3 py-2 font-medium text-muted-foreground"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {camposFiltrados.map((c) => (
                      <tr
                        key={`${c.orden}-${c.numero}`}
                        className="border-b border-border last:border-0"
                      >
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                          {c.numero}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-foreground">
                          {c.etiqueta_xml}
                        </td>
                        <td className="px-3 py-2 text-foreground">{c.nombre}</td>
                        <td className="px-3 py-2 text-[13px] text-muted-foreground">
                          {c.obligatoriedad}
                        </td>
                      </tr>
                    ))}
                    {camposFiltrados.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                          Ningún campo coincide con «{filtro}».
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
