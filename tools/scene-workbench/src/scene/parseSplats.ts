/**
 * Decodes `splats.bin` (spec §5) in the browser. The record array and the
 * SH degree-1 block come back as **views** onto the downloaded buffer —
 * both are uploaded verbatim as instance buffers, so a copy here would
 * exist only to be identical. `positionsM` is the one field actually
 * decoded: the 28-byte stride leaves the xyz floats non-contiguous, and
 * the depth sort re-reads them every frame. No Node imports.
 */
import {
  SPLATS_MAGIC,
  SPLATS_FORMAT_VERSION,
  SPLATS_HEADER_BYTES,
  SPLATS_RECORD_BYTES,
  SPLATS_SH1_RECORD_BYTES,
} from '../../../scene-recon/pack/splatFormat';

export type ParsedGaussianSplats = {
  readonly splatCount: number;
  readonly shDegree: 0 | 1;
  /** The core records verbatim — instance buffer, stride 28, no CPU copy. */
  readonly records: Uint8Array;
  /** The trailing SH degree-1 block, stride 12; null at shDegree 0. */
  readonly sh1: Uint8Array | null;
  readonly positionsM: Float32Array;
};

export function parseSplats(buffer: ArrayBuffer): ParsedGaussianSplats {
  if (buffer.byteLength < SPLATS_HEADER_BYTES) {
    throw new Error(
      `parseSplats: buffer is ${buffer.byteLength} bytes, too short for the ` +
        `${SPLATS_HEADER_BYTES}-byte header — truncated download?`,
    );
  }

  const dv = new DataView(buffer);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== SPLATS_MAGIC) {
    throw new Error(`parseSplats: bad magic "${magic}" — expected "${SPLATS_MAGIC}"`);
  }

  const formatVersion = dv.getUint32(4, true);
  if (formatVersion !== SPLATS_FORMAT_VERSION) {
    throw new Error(
      `parseSplats: unsupported formatVersion ${formatVersion} — expected ` +
        `${SPLATS_FORMAT_VERSION}, re-run the bake`,
    );
  }

  const splatCount = dv.getUint32(8, true);
  const shDegreeField = dv.getUint32(12, true);
  if (shDegreeField !== 0 && shDegreeField !== 1) {
    throw new Error(`parseSplats: unsupported shDegree ${shDegreeField} — expected 0 or 1`);
  }
  const shDegree: 0 | 1 = shDegreeField;

  const coreBytes = splatCount * SPLATS_RECORD_BYTES;
  const sh1Bytes = shDegree === 1 ? splatCount * SPLATS_SH1_RECORD_BYTES : 0;
  const expectedBytes = SPLATS_HEADER_BYTES + coreBytes + sh1Bytes;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `parseSplats: buffer is ${buffer.byteLength} bytes but splatCount ${splatCount} ` +
        `at shDegree ${shDegree} implies ${expectedBytes} — truncated or corrupt download`,
    );
  }

  const records = new Uint8Array(buffer, SPLATS_HEADER_BYTES, coreBytes);
  const sh1 =
    shDegree === 1 ? new Uint8Array(buffer, SPLATS_HEADER_BYTES + coreBytes, sh1Bytes) : null;

  const positionsM = new Float32Array(3 * splatCount);
  for (let i = 0; i < splatCount; i++) {
    const offset = SPLATS_HEADER_BYTES + i * SPLATS_RECORD_BYTES;
    positionsM[i * 3 + 0] = dv.getFloat32(offset + 0, true);
    positionsM[i * 3 + 1] = dv.getFloat32(offset + 4, true);
    positionsM[i * 3 + 2] = dv.getFloat32(offset + 8, true);
  }

  return { splatCount, shDegree, records, sh1, positionsM };
}
