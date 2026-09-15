/**
 * packSurfaceTileKey — `(z, x, y)` in one double: 5 + 20 + 19 bits, exact well
 * past z19 at any tile edge ≥ 256 px. A number key keeps the per-frame cut's
 * Maps and Sets off string building.
 */
export function packSurfaceTileKey(z: number, x: number, y: number): number {
  return z * 2 ** 39 + x * 2 ** 19 + y;
}
