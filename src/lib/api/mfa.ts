import { supabase } from '@/lib/supabase';

/**
 * Segundo factor TOTP. Es obligatorio en Ikán: la sesión de un Oficial de
 * Cumplimiento da acceso a expedientes con CURP, RFC y hallazgos de PLD, y a la
 * firma de avisos. Una contraseña sola no basta para eso.
 *
 * Todo pasa por `supabase.auth.mfa`, que guarda el secreto en el servidor de
 * Auth: Ikán nunca lo ve ni lo almacena.
 */

export type EstadoMfa = 'inscrito' | 'sin_inscribir' | 'no_disponible';

export interface SituacionMfa {
  estado: EstadoMfa;
  /** Sólo cuando ya hay factor. Sirve para poder retirarlo. */
  factorId: string | null;
  /**
   * Por qué no se pudo saber, cuando `no_disponible`.
   *
   * Se distingue de `sin_inscribir` a propósito: no es lo mismo «este usuario
   * todavía no dio de alta su segundo factor» que «no se pudo preguntar». Lo
   * primero se resuelve inscribiéndose; lo segundo es un problema de la
   * plataforma, y tratarlos igual dejaría al OC fuera de su propio sistema el
   * día 17 por una falla que no es suya.
   */
  motivo?: string;
}

/** Un factor a medio inscribir —el usuario abandonó antes de confirmarlo— no
 *  protege nada y estorba: Supabase no deja tener dos. */
const VERIFICADO = 'verified';

export async function situacionMfa(): Promise<SituacionMfa> {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return { estado: 'no_disponible', factorId: null, motivo: error.message };

    const verificado = (data?.totp ?? []).find((f) => f.status === VERIFICADO);
    return verificado
      ? { estado: 'inscrito', factorId: verificado.id }
      : { estado: 'sin_inscribir', factorId: null };
  } catch (e) {
    return { estado: 'no_disponible', factorId: null, motivo: (e as Error).message };
  }
}

export interface InscripcionMfa {
  factorId: string;
  /** SVG del código QR que se escanea con la app de autenticación. */
  qr: string;
  /** El mismo secreto en texto, para quien no pueda escanear. */
  secreto: string;
}

/**
 * Empieza el alta. Devuelve el QR; el factor NO queda activo hasta que
 * `confirmarInscripcion` verifique un código: si quedara activo antes, alguien
 * que cierre la pestaña sin apuntar el secreto se quedaría fuera de su cuenta.
 *
 * Limpia primero los factores a medio inscribir de intentos anteriores, que es
 * lo que hace fallar el segundo intento con "factor already exists".
 */
export async function iniciarInscripcion(): Promise<InscripcionMfa> {
  const { data: previos } = await supabase.auth.mfa.listFactors();
  for (const f of previos?.totp ?? []) {
    if (f.status !== VERIFICADO) await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Ikán · ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) throw error;

  return {
    factorId: data.id,
    qr: data.totp.qr_code,
    secreto: data.totp.secret,
  };
}

/** Confirma el alta con un código de la app. Sólo aquí queda activo el factor. */
export async function confirmarInscripcion(factorId: string, codigo: string): Promise<void> {
  const { data: reto, error: errReto } = await supabase.auth.mfa.challenge({ factorId });
  if (errReto) throw errReto;

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: reto.id,
    code: codigo.replace(/\s/g, ''),
  });
  if (error) throw error;
}

/**
 * Retira el segundo factor.
 *
 * No lo ofrece la pantalla del usuario: en Ikán el 2FA es obligatorio, así que
 * quitarlo es una operación de soporte, no una preferencia. Existe aquí para
 * el caso real —un teléfono perdido— y deja rastro en la bitácora de Auth.
 */
export async function retirarFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
