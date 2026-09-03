import { supabase } from "@/lib/supabase";

/**
 * La aprobación del expediente reforzado (art. 23 Ter 5 de las RCG).
 *
 * El art. 23 Ter 5 pide la aprobación de «un directivo o su equivalente» ANTES
 * de operar. Esas tres últimas palabras resuelven a quién le toca: la regla no
 * exige un cargo llamado directivo, exige que apruebe quien ocupe la posición
 * de mayor responsabilidad. En una notaría el sujeto obligado es una persona
 * física que ejerce una función pública, y el equivalente es el notario
 * titular. Por eso no hay rol «directivo»: hay una CALIDAD en la que se aprueba.
 *
 * La autoaprobación NO se declara aquí ni en ninguna parte del front: la
 * calcula la base comparando identidades. Un dato declarado sobre uno mismo, en
 * el campo que sirve para señalar el conflicto, es el que nunca se marca.
 */

/**
 * Llamada a una función de base que los tipos generados todavía no conocen.
 *
 * `src/types/database.ts` se regenera contra el remoto y va atrás de las
 * migrations 0059 a 0062; incluso trae funciones de una implementación que ya
 * no existe. El puente va aquí, marcado y en un solo lugar, en vez de repartir
 * escapes por el módulo: cuando se regeneren los tipos se borra esta función y
 * el compilador señala cada llamada que haya que volver a tipar.
 *
 * TODO[Sprint D-2]: borrar después de `npm run supabase:gen:types`.
 */
async function rpcSinTipos<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const llamar = supabase.rpc as unknown as (
    nombre: string,
    parametros: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await llamar(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type CalidadAprobacion =
  | "notario_titular"
  | "oficial_cumplimiento"
  | "directivo_designado";

export const ETIQUETA_CALIDAD: Record<CalidadAprobacion, string> = {
  notario_titular: "Notario titular",
  oficial_cumplimiento: "Oficial de Cumplimiento",
  directivo_designado: "Directivo designado",
};

export const DETALLE_CALIDAD: Record<CalidadAprobacion, string> = {
  notario_titular:
    "El equivalente al directivo cuando el sujeto obligado es una persona física que ejerce " +
    "una función pública.",
  oficial_cumplimiento:
    "Aprueba el propio Oficial de Cumplimiento. Fija responsabilidad y fecha, pero no es un " +
    "segundo par de ojos, y la base lo va a registrar así.",
  directivo_designado:
    "Cuando la organización sí tiene esa figura, distinta del Oficial de Cumplimiento.",
};

export interface AprobacionExpediente {
  id: string;
  client_id: string;
  aprobado_por: string | null;
  aprobado_en: string | null;
  calidad: CalidadAprobacion | null;
  autoaprobacion: boolean;
  evaluacion_secuencia: number | null;
  notas: string | null;
}

/** La aprobación registrada de un expediente, si la hay. */
export async function aprobacionDelExpediente(
  clientId: string,
): Promise<AprobacionExpediente | null> {
  const tabla = supabase.from as unknown as (nombre: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await tabla("expediente_reforzado")
    .select(
      "id, client_id, aprobado_por, aprobado_en, calidad, autoaprobacion, " +
        "evaluacion_secuencia, notas",
    )
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AprobacionExpediente) ?? null;
}

/**
 * Si la aprobación sigue cubriendo.
 *
 * Deja de cubrir en cuanto hay una evaluación posterior a aquella sobre la que
 * se firmó: una aprobación no se estira sola a hechos que nadie miró al
 * aprobar. Se le pregunta a la base y no se deduce aquí, porque la misma regla
 * la aplica el disparador que deja pasar o no el acto, y dos implementaciones
 * de la misma regla acaban discrepando.
 */
export async function expedienteVigente(clientId: string): Promise<boolean> {
  const r = await rpcSinTipos<boolean>("expediente_reforzado_vigente", {
    p_client: clientId,
  });
  return r === true;
}

/**
 * Aprobar.
 *
 * El rol operador no puede, ni por delegación ni por ausencia del titular: eso
 * lo rechaza la base, no esta función, para que no dependa de que la pantalla
 * se acuerde de esconder el botón.
 */
export async function aprobarExpediente(
  clientId: string,
  calidad: CalidadAprobacion,
  notas?: string,
): Promise<string> {
  return rpcSinTipos<string>("aprobar_expediente_reforzado", {
    p_client: clientId,
    p_calidad: calidad,
    p_notas: notas?.trim() || null,
  });
}

export interface ExpedienteSinAprobar {
  client_id: string;
  nombre: string;
  actos: number;
  motivo: string;
}

/**
 * Los comparecientes de riesgo alto que están operando sin aprobación vigente.
 *
 * El disparador sólo mira hacia adelante: los actos que ya estaban registrados
 * no se invalidan, porque una regla nueva no vuelve ilícito lo que era válido
 * cuando se hizo. Sin esta lista ese hueco quedaría invisible.
 */
export async function n3SinAprobacionVigente(): Promise<
  ExpedienteSinAprobar[]
> {
  const filas = await rpcSinTipos<ExpedienteSinAprobar[] | null>(
    "n3_sin_aprobacion_vigente",
    { p_org: null },
  );
  return filas ?? [];
}
