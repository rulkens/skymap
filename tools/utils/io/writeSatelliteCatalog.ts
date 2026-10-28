/**
 * writeSatelliteCatalog — serialise a `SatelliteCatalog` to the `satellites.bin` layout (little-endian):
 * `SATG`, u32 version 1, u32 count n, u32 0, f64 fetchedAtMs; from byte 24 the ten f64 columns in
 * `SatelliteCatalog` order (epochMs … meanMotionDdot, n each), u32 noradId (n), u8 classCode (n),
 * padding to 4, u32 string offsets (2n + 1) into a UTF-8 blob holding names[0..n) then cosparIds.
 * f64 columns stay 8-aligned so the reader views them in place. `parseSatelliteCatalog` is the reader.
 */
import type { SatelliteCatalog } from '../../../src/@types/satellites/SatelliteCatalog';

const align = (n: number, to: number): number => Math.ceil(n / to) * to;

export function writeSatelliteCatalog(cat: SatelliteCatalog): Uint8Array {
  const n = cat.noradId.length;
  const columns = [
    cat.epochMs,
    cat.meanMotion,
    cat.eccentricity,
    cat.inclinationDeg,
    cat.raanDeg,
    cat.argPericenterDeg,
    cat.meanAnomalyDeg,
    cat.bstar,
    cat.meanMotionDot,
    cat.meanMotionDdot,
  ];
  const strings = [...cat.names, ...cat.cosparIds].map((s) => new TextEncoder().encode(s));
  if (
    columns.some((c) => c.length !== n) ||
    cat.classCode.length !== n ||
    strings.length !== 2 * n
  ) {
    throw new Error('writeSatelliteCatalog: columns disagree on the object count');
  }
  const offsetsAt = align(24 + 84 * n + n, 4);
  const blobAt = offsetsAt + 4 * (2 * n + 1);
  const blobLength = strings.reduce((sum, s) => sum + s.length, 0);

  const bytes = new Uint8Array(blobAt + blobLength);
  const view = new DataView(bytes.buffer);
  bytes.set([0x53, 0x41, 0x54, 0x47]); // 'SATG'
  view.setUint32(4, 1, true);
  view.setUint32(8, n, true);
  view.setFloat64(16, cat.fetchedAtMs, true);
  columns.forEach((c, k) => new Float64Array(bytes.buffer, 24 + 8 * n * k, n).set(c));
  new Uint32Array(bytes.buffer, 24 + 80 * n, n).set(cat.noradId);
  bytes.set(cat.classCode, 24 + 84 * n);
  const offsets = new Uint32Array(bytes.buffer, offsetsAt, 2 * n + 1);
  let at = 0;
  strings.forEach((s, k) => {
    offsets[k] = at;
    bytes.set(s, blobAt + at);
    at += s.length;
  });
  offsets[2 * n] = at;
  return bytes;
}
