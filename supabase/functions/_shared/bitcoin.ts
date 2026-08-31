/**
 * La fecha de un bloque de Bitcoin, para poder decirla en pantalla.
 *
 * La atestiguación de OpenTimestamps lleva la ALTURA del bloque, no su hora.
 * La altura es lo verificable y lo que se guarda como prueba; la fecha es
 * comodidad de lectura —«anclado el 30 de agosto» dice más que «bloque
 * 964750»— y sale de consultar esa altura contra un explorador público.
 *
 * De ahí una regla que no se rompe: **la fecha jamás decide si un anclaje está
 * confirmado**. Eso lo decide la atestiguación dentro del archivo. Si el
 * explorador no contesta, o miente, o desaparece, el anclaje sigue confirmado
 * y la pantalla sigue enseñando el número de bloque, que es lo que cualquiera
 * puede comprobar por su cuenta.
 *
 * Módulo puro salvo la implementación HTTP, aislada tras la interfaz.
 */

/** Lo que hace falta del mundo exterior. */
export interface FechaDeBloque {
  /** ISO, o null si no se pudo averiguar. Nunca lanza por un fallo de red. */
  consultar(altura: number): Promise<string | null>;
}

/**
 * Exploradores públicos que hablan la API de Esplora:
 *   GET /api/block-height/{altura}  → hash del bloque, en texto plano
 *   GET /api/block/{hash}           → JSON con `timestamp` en segundos unix
 *
 * Se consultan en orden y basta con que uno conteste. Dos y no uno porque
 * dentro de un año cualquiera de los dos puede no existir, y perder la fecha
 * por eso sería tonto.
 */
export const EXPLORADORES = ['https://mempool.space/api', 'https://blockstream.info/api'];

export class FechaDeBloqueHttp implements FechaDeBloque {
  constructor(
    private readonly exploradores: string[] = EXPLORADORES,
    private readonly tiempoLimiteMs = 10_000,
  ) {}

  async consultar(altura: number): Promise<string | null> {
    if (!Number.isInteger(altura) || altura < 0) return null;

    for (const base of this.exploradores) {
      try {
        const fecha = await this.deExplorador(base, altura);
        if (fecha) return fecha;
      } catch {
        // Se pasa al siguiente. Que un explorador falle no es un problema del
        // anclaje: la prueba está en el archivo, no aquí.
      }
    }
    return null;
  }

  private async deExplorador(base: string, altura: number): Promise<string | null> {
    const corte = () => AbortSignal.timeout(this.tiempoLimiteMs);

    const rHash = await fetch(`${base}/block-height/${altura}`, { signal: corte() });
    if (!rHash.ok) return null;
    const hash = (await rHash.text()).trim();
    // El explorador devuelve el hash en texto plano; cualquier otra cosa
    // —una página de error, un HTML— se descarta en vez de pasarla a la URL
    // siguiente.
    if (!/^[0-9a-f]{64}$/.test(hash)) return null;

    const rBloque = await fetch(`${base}/block/${hash}`, { signal: corte() });
    if (!rBloque.ok) return null;
    const bloque = (await rBloque.json()) as { timestamp?: number; height?: number };

    // Que el bloque devuelto sea el que se pidió: si el explorador se equivoca
    // de altura, la fecha sería de otro bloque y nadie lo notaría.
    if (bloque.height !== undefined && bloque.height !== altura) return null;

    const segundos = bloque.timestamp;
    if (typeof segundos !== 'number' || !Number.isFinite(segundos) || segundos <= 0) return null;

    return new Date(segundos * 1000).toISOString();
  }
}

/** Para probar sin red. */
export class FechaDeBloqueFija implements FechaDeBloque {
  constructor(private readonly fecha: string | null) {}
  consultar(): Promise<string | null> {
    return Promise.resolve(this.fecha);
  }
}
