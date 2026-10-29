/**
 * parseSatelliteCatalog — read `satellites.satg` (layout in `writeSatelliteCatalog`). The f64 and u32
 * columns are views into `buf`, not copies, so the buffer can be transferred to the worker whole.
 */
import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';

const align = (n: number, to: number): number => Math.ceil(n / to) * to;

export function parseSatelliteCatalog(buf: ArrayBuffer): SatelliteCatalog {
  const view = new DataView(buf);
  const need = (end: number): void => {
    if (end > buf.byteLength) throw new Error('parseSatelliteCatalog: truncated');
  };
  need(24);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic !== 'SATG') throw new Error(`parseSatelliteCatalog: bad magic "${magic}"`);
  const version = view.getUint32(4, true);
  if (version !== 1) {
    throw new Error(
      `parseSatelliteCatalog: unsupported version ${version}, regenerate with "npm run build-satellites"`,
    );
  }
  const n = view.getUint32(8, true);
  const offsetsAt = align(24 + 85 * n, 4);
  const blobAt = offsetsAt + 4 * (2 * n + 1);
  need(blobAt);
  const offsets = new Uint32Array(buf, offsetsAt, 2 * n + 1);
  need(blobAt + offsets[2 * n]!);

  const column = (k: number): Float64Array => new Float64Array(buf, 24 + 8 * n * k, n);
  const decoder = new TextDecoder();
  const strings = Array.from({ length: 2 * n }, (_, k) =>
    decoder.decode(new Uint8Array(buf, blobAt + offsets[k]!, offsets[k + 1]! - offsets[k]!)),
  );
  return {
    fetchedAtMs: view.getFloat64(16, true),
    epochMs: column(0),
    meanMotion: column(1),
    eccentricity: column(2),
    inclinationDeg: column(3),
    raanDeg: column(4),
    argPericenterDeg: column(5),
    meanAnomalyDeg: column(6),
    bstar: column(7),
    meanMotionDot: column(8),
    meanMotionDdot: column(9),
    noradId: new Uint32Array(buf, 24 + 80 * n, n),
    classCode: new Uint8Array(buf, 24 + 84 * n, n),
    names: strings.slice(0, n),
    cosparIds: strings.slice(n),
  };
}
