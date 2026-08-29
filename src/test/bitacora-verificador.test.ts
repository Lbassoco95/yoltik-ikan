import { describe, it, expect } from 'vitest';
import {
  HASH_GENESIS,
  hashDeEslabon,
  hashDeEvento,
  verificarPaquete,
  type EventoBitacora,
  type PaqueteVerificacion,
} from '@/lib/bitacora/verificador';

/** Arma una cadena bien formada, con los mismos hashes que calcularía la base. */
async function cadena(payloads: string[]): Promise<PaqueteVerificacion> {
  const eventos: EventoBitacora[] = [];
  let anterior = HASH_GENESIS;
  for (let i = 0; i < payloads.length; i++) {
    const secuencia = i + 1;
    const nonce = `nonce${secuencia}`;
    const evento_hash = await hashDeEvento({ payload_canonico: payloads[i], nonce });
    const cadena_hash = await hashDeEslabon(anterior, evento_hash, secuencia);
    eventos.push({
      secuencia,
      payload_canonico: payloads[i],
      nonce,
      evento_hash,
      cadena_hash,
      hash_anterior: anterior,
    });
    anterior = cadena_hash;
  }
  return {
    organization_id: '11111111-1111-1111-1111-111111111111',
    generado_en: '2026-08-29T00:00:00.000Z',
    ultima_secuencia: eventos.length,
    ultimo_hash: anterior,
    eventos,
  };
}

const TRES = ['{"a":1}', '{"monto_mxn":"1500000.00"}', '{"estado":"confirmado_inusual"}'];

/**
 * Si el verificador y la base no calculan el mismo hash, todo esto no sirve:
 * la base diría íntegra y el auditor rota, o al revés. Estos tres valores se
 * sacaron corriendo sha256 en PostgreSQL 16 y se fijan aquí para que cualquier
 * cambio en la forma de hashear —separador, orden, codificación— rompa la
 * prueba en vez de romper la confianza.
 */
describe('los hashes coinciden con los de PostgreSQL', () => {
  it('hash de evento', async () => {
    expect(await hashDeEvento({ payload_canonico: '{"a":1}', nonce: 'nonce1' })).toBe(
      '9391a94ca87fdab7c5306fece2729c54b284f3e59e2437b7501dde70be6f68d9',
    );
  });

  it('hash de eslabón sobre el hash de génesis', async () => {
    const eventoHash = await hashDeEvento({ payload_canonico: '{"a":1}', nonce: 'nonce1' });
    expect(await hashDeEslabon(HASH_GENESIS, eventoHash, 1)).toBe(
      '7c5d48f0d45e62f9b87cc6b91c9ffe210b998b4945474f1e35835d8effe5df1f',
    );
  });

  it('acentos: se hashea UTF-8 en las dos puntas', async () => {
    expect(await hashDeEvento({ payload_canonico: '{"nombre":"Pérez"}', nonce: 'n' })).toBe(
      '1303e01d66f27ed91e1bb6700320eaf53280c712a40d91cfa63b0fba4b2749ef',
    );
  });
});

describe('verificación de la bitácora', () => {
  it('una cadena bien formada verifica íntegra', async () => {
    const r = await verificarPaquete(await cadena(TRES));
    expect(r.integra).toBe(true);
    expect(r.eventosVerificados).toBe(3);
    expect(r.roturas).toEqual([]);
  });

  it('el primer eslabón cuelga del hash de génesis', async () => {
    const p = await cadena(TRES);
    expect(p.eventos[0].hash_anterior).toBe(HASH_GENESIS);
    expect(HASH_GENESIS).toHaveLength(64);
  });

  it('los eventos llegan desordenados y se verifican igual', async () => {
    const p = await cadena(TRES);
    p.eventos.reverse();
    expect((await verificarPaquete(p)).integra).toBe(true);
  });

  it('detecta que se alteró el contenido de un evento', async () => {
    const p = await cadena(TRES);
    p.eventos[1].payload_canonico = '{"monto_mxn":"1.00"}';
    const r = await verificarPaquete(p);
    expect(r.integra).toBe(false);
    expect(r.roturas[0].motivo).toContain('se alteró el payload');
    expect(r.roturas[0].secuencia).toBe(2);
  });

  it('cambiar el nonce también rompe: el hash cubre las dos partes', async () => {
    const p = await cadena(TRES);
    p.eventos[0].nonce = 'otro';
    expect((await verificarPaquete(p)).integra).toBe(false);
  });

  it('detecta que se borró un evento intermedio', async () => {
    const p = await cadena(TRES);
    p.eventos.splice(1, 1);
    const r = await verificarPaquete(p);
    expect(r.integra).toBe(false);
    expect(r.roturas.some((x) => x.motivo.includes('hueco'))).toBe(true);
  });

  it('detecta el truncamiento por el final, que no rompe ningún eslabón', async () => {
    const p = await cadena(TRES);
    p.eventos.pop();
    const r = await verificarPaquete(p);
    expect(r.integra).toBe(false);
    expect(r.roturas.some((x) => x.motivo.includes('truncó por el final'))).toBe(true);
  });

  it('recalcular el eslabón no salva un payload alterado', async () => {
    const p = await cadena(TRES);
    p.eventos[1].payload_canonico = '{"monto_mxn":"1.00"}';
    // El atacante rehace el eslabón desde el evento_hash viejo, que ya no
    // corresponde al contenido.
    p.eventos[1].cadena_hash = await hashDeEslabon(
      p.eventos[1].hash_anterior,
      p.eventos[1].evento_hash,
      2,
    );
    const r = await verificarPaquete(p);
    expect(r.integra).toBe(false);
    expect(r.roturas.some((x) => x.motivo.includes('se alteró el payload'))).toBe(true);
  });

  it('detecta que la cabeza no corresponde a la cadena', async () => {
    const p = await cadena(TRES);
    p.ultimo_hash = 'f'.repeat(64);
    const r = await verificarPaquete(p);
    expect(r.integra).toBe(false);
    expect(r.roturas.some((x) => x.motivo.includes('cabeza'))).toBe(true);
  });

  it('reporta TODAS las roturas, no sólo la primera', async () => {
    const p = await cadena(TRES);
    p.eventos[0].payload_canonico = '{"a":2}';
    p.eventos[2].payload_canonico = '{"estado":"descartado"}';
    const r = await verificarPaquete(p);
    expect(r.roturas.filter((x) => x.motivo.includes('se alteró el payload'))).toHaveLength(2);
  });

  it('una cadena vacía es íntegra: no hay nada que contradiga', async () => {
    const r = await verificarPaquete({
      organization_id: '1',
      generado_en: '2026-08-29T00:00:00.000Z',
      ultima_secuencia: 0,
      ultimo_hash: HASH_GENESIS,
      eventos: [],
    });
    expect(r.integra).toBe(true);
    expect(r.hashFinal).toBe(HASH_GENESIS);
  });

  it('el hash final es el que se compara contra el ancla externa', async () => {
    const p = await cadena(TRES);
    const r = await verificarPaquete(p);
    expect(r.hashFinal).toBe(p.ultimo_hash);
    expect(r.hashFinal).toMatch(/^[0-9a-f]{64}$/);
  });
});
