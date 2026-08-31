import { useQuery } from '@tanstack/react-query';
import { listarCatalogos, valoresDeCatalogo } from '@/lib/api/catalogos';
import type { EstadoCatalogo, ValorCatalogo } from '@/lib/catalogos';

/**
 * Valores de un catálogo del layout, para poblar una lista.
 *
 * `cargado` distingue "todavía no llega la respuesta" de "el catálogo está
 * vacío": son cosas distintas para el usuario y la pantalla tiene que poder
 * decir cuál es.
 */
export function useCatalogo(codigo: string | null | undefined): {
  valores: ValorCatalogo[];
  cargando: boolean;
  cargado: boolean;
  descripcionDe: (clave: string | null | undefined) => string | undefined;
} {
  const { data, isLoading } = useQuery({
    queryKey: ['catalogo', codigo],
    queryFn: () => valoresDeCatalogo(codigo as string),
    enabled: !!codigo,
    // Los catálogos cambian cuando Kawiil los carga, no durante la captura.
    staleTime: 5 * 60 * 1000,
  });
  const valores = data ?? [];
  return {
    valores,
    cargando: isLoading,
    cargado: valores.length > 0,
    descripcionDe: (clave) => valores.find((v) => v.clave === String(clave ?? ''))?.descripcion,
  };
}

/** Estado de todos los catálogos (consola de plataforma y pantallas de estado). */
export function useCatalogos(): { catalogos: EstadoCatalogo[]; cargando: boolean } {
  const { data, isLoading } = useQuery({ queryKey: ['catalogos'], queryFn: listarCatalogos });
  return { catalogos: data ?? [], cargando: isLoading };
}
