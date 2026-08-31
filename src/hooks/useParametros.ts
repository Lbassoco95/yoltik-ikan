import { useQuery } from '@tanstack/react-query';
import { listarParametrosVigentes } from '@/lib/api/parametros';
import {
  resolverParametro,
  valorParametro,
  type ParametroVigente,
} from '@/lib/parametros';

/**
 * Parámetros regulatorios vigentes.
 *
 * Se cachean largo a propósito: la UMA cambia una vez al año y los umbrales
 * sólo cuando cambia la ley. No tiene sentido re-consultarlos por navegación.
 */
export function useParametros() {
  const query = useQuery({
    queryKey: ['parametros-vigentes'],
    queryFn: listarParametrosVigentes,
    staleTime: 60 * 60 * 1000, // 1 hora
    gcTime: 24 * 60 * 60 * 1000,
  });

  const parametros: ParametroVigente[] = query.data ?? [];

  return {
    ...query,
    parametros,
    /** Valor numérico, o `undefined` si no hay parámetro vigente. Nunca un default inventado. */
    valor: (codigo: string, sector = '*') => valorParametro(parametros, codigo, sector),
    /** El registro completo, para poder mostrar fuente y si está confirmado. */
    parametro: (codigo: string, sector = '*') => resolverParametro(parametros, codigo, sector),
  };
}
