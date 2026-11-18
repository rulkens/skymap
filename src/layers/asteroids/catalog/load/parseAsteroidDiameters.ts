import type { AsteroidDiameters } from '../@types/AsteroidDiameters';

/** parseAsteroidDiameters — `asteroid-diameters.bin` as views, no copy. */
export function parseAsteroidDiameters(buf: ArrayBuffer): AsteroidDiameters {
  const count = new DataView(buf).getUint32(0, true);
  if (4 + 12 * count > buf.byteLength) throw new Error('parseAsteroidDiameters: truncated');
  return {
    numbers: new Uint32Array(buf, 4, count),
    diameterKm: new Float32Array(buf, 4 + 4 * count, count),
    albedo: new Float32Array(buf, 4 + 8 * count, count),
  };
}
