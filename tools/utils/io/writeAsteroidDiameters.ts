import type { AsteroidDiameterRow } from '../../@types/asteroids/AsteroidDiameterRow';

/**
 * writeAsteroidDiameters — the `asteroid-diameters.bin` layout (little-endian): u32 count, u32
 * numbers[count] ascending, f32 diameterKm[count], f32 albedo[count] (NaN where none). The Layer
 * binary-searches `numbers`, so the order is part of the format.
 */
export function writeAsteroidDiameters(rows: readonly AsteroidDiameterRow[]): Uint8Array {
  const count = rows.length;
  const bytes = new Uint8Array(4 + 12 * count);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, count, true);
  rows.forEach(({ number, diameterKm, albedo }, k) => {
    if (k > 0 && number <= rows[k - 1]!.number) {
      throw new Error(`writeAsteroidDiameters: (${number}) is out of order`);
    }
    view.setUint32(4 + 4 * k, number, true);
    view.setFloat32(4 + 4 * count + 4 * k, diameterKm, true);
    view.setFloat32(4 + 8 * count + 4 * k, albedo ?? NaN, true);
  });
  return bytes;
}
