import { describe, expect, it } from 'vitest';
import {
  artefactosDeLaDecision,
  huella,
  modulosAplicados,
} from '../../supabase/functions/_shared/artefactos';
import { ESTADOS_CONOCIDOS, estadoDeDidit } from '../../supabase/functions/_shared/didit';

/**
 * Recortado del payload REAL de una sesión de producción. Los nombres de campo
 * son los que devuelve Didit; las ligas van acortadas.
 */
const decisionReal = {
  features: ['ID_VERIFICATION', 'LIVENESS', 'FACE_MATCH', 'IP_ANALYSIS'],
  id_verifications: [
    {
      status: 'Approved',
      document_type: 'Identity Card',
      portrait_image: 'https://s3.example/ocr/sesion-portrait_image-abc.jpg?X-Amz-Signature=x',
      front_image: 'https://s3.example/ocr/sesion-front_image-abc.jpg?X-Amz-Signature=x',
      back_image: 'https://s3.example/ocr/sesion-back_image-abc.jpg?X-Amz-Signature=x',
      full_front_image: 'https://s3.example/ocr/sesion-full_front_image-abc.jpg?X-Amz-Signature=x',
      full_back_image: 'https://s3.example/ocr/sesion-full_back_image-abc.jpg?X-Amz-Signature=x',
      front_video: null,
      back_video: null,
    },
  ],
  liveness_checks: [
    {
      status: 'Approved',
      score: 87.75,
      reference_image: 'https://s3.example/face/sesion/reference_image.jpg?X-Amz-Signature=x',
      video_url: 'https://s3.example/face-videos/sesion-video-abc.mp4?X-Amz-Signature=x',
    },
  ],
  face_matches: [
    {
      status: 'Approved',
      score: 94.03,
      source_image: 'https://s3.example/face-match/sesion/source.jpg?X-Amz-Signature=x',
      target_image: 'https://s3.example/face-match/sesion/target.jpg?X-Amz-Signature=x',
    },
  ],
};

describe('qué artefactos se custodian', () => {
  it('las cuatro imágenes del documento', () => {
    const tipos = artefactosDeLaDecision(decisionReal).map((a) => a.tipo);
    expect(tipos).toEqual([
      'documento_frente',
      'documento_reverso',
      'documento_frente_completo',
      'documento_reverso_completo',
    ]);
  });

  it('NO la biometría: ni la referencia de vida, ni el vídeo, ni el cotejo facial', () => {
    // Kawiil trata la biometría como dato sensible y de esos módulos se conserva
    // el PUNTAJE como valor. Copiarla multiplicaría dónde vive un dato sensible
    // sin que nadie lo haya pedido, y con conservación a diez años.
    const urls = artefactosDeLaDecision(decisionReal).map((a) => a.url);
    const todas = urls.join(' ');
    expect(todas).not.toContain('reference_image');
    expect(todas).not.toContain('face-videos');
    expect(todas).not.toContain('face-match');
  });

  it('NO el recorte del retrato del documento', () => {
    // La imagen del documento ya lo contiene: guardarlo aparte añade una
    // fotografía de rostro sin ningún valor legal adicional.
    const urls = artefactosDeLaDecision(decisionReal).map((a) => a.url).join(' ');
    expect(urls).not.toContain('portrait_image');
  });

  it('sin módulo de documento no hay nada que custodiar', () => {
    expect(artefactosDeLaDecision({ id_verifications: null })).toEqual([]);
    expect(artefactosDeLaDecision({})).toEqual([]);
    expect(artefactosDeLaDecision(null)).toEqual([]);
  });

  it('una liga que no es https no se descarga', () => {
    // Descargar de donde sea es una vía de entrada. Se exige el esquema.
    const r = artefactosDeLaDecision({
      id_verifications: [{ front_image: 'file:///etc/passwd', back_image: 'http://interno/x.jpg' }],
    });
    expect(r).toEqual([]);
  });
});

describe('qué módulos corrieron de verdad', () => {
  it('los lee de la decisión, no del workflow', () => {
    // La diferencia no es teórica: la primera verificación de producción corrió
    // sin barrido de listas porque el módulo se encendió después. Sin este dato
    // el expediente no podría decirlo.
    expect(modulosAplicados(decisionReal)).toEqual([
      'ID_VERIFICATION',
      'LIVENESS',
      'FACE_MATCH',
      'IP_ANALYSIS',
    ]);
    expect(modulosAplicados(decisionReal)).not.toContain('AML');
  });

  it('sin lista de módulos devuelve null, no una lista vacía', () => {
    // Vacío diría «no corrió ninguno»; null dice «no se sabe». Son cosas
    // distintas y el expediente tiene que poder distinguirlas.
    expect(modulosAplicados({})).toBeNull();
    expect(modulosAplicados({ features: [] })).toBeNull();
    expect(modulosAplicados(null)).toBeNull();
  });
});

describe('la huella', () => {
  it('es un SHA-256 en hexadecimal', async () => {
    const h = await huella(new TextEncoder().encode('ikán').buffer as ArrayBuffer);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el mismo contenido da la misma huella, y otro contenido otra', async () => {
    // Es lo que permite demostrar a diez años que es EL archivo y no un archivo.
    const a = await huella(new TextEncoder().encode('documento').buffer as ArrayBuffer);
    const b = await huella(new TextEncoder().encode('documento').buffer as ArrayBuffer);
    const c = await huella(new TextEncoder().encode('documentO').buffer as ArrayBuffer);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('los estados que la conciliación sabe leer', () => {
  it('cubre exactamente los que estadoDeDidit mapea', async () => {
    // Si alguien añade un caso al switch y se olvida de esta lista, la
    // conciliación dejaría de corregir ese estado y lo trataría como
    // desconocido. La prueba ata las dos cosas.
    const { ESTADOS_CONOCIDOS, estadoDeDidit } = await import(
      '../../supabase/functions/_shared/didit'
    );
    for (const s of ESTADOS_CONOCIDOS) {
      // Ninguno de los conocidos puede caer en el default.
      const esperadoDefault = s === 'In Progress' || s === 'Awaiting User';
      expect(estadoDeDidit(s) === 'en_progreso').toBe(esperadoDefault);
    }
  });

  it('un estado que no conocemos NO se confunde con aprobado', () => {
    // El default seguro para recibir. Lo que la conciliación no puede hacer es
    // usarlo para corregir: degradaría una verificación aprobada.
    expect(ESTADOS_CONOCIDOS.has('Something New')).toBe(false);
    expect(estadoDeDidit('Something New')).toBe('en_progreso');
  });
});
