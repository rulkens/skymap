/** horizonTilePath — a baked horizon tile's `index.txt` line, `surfaceTilePath`'s shape for the
 *  new product (`horizon` joins `SURFACE_TILE_PRODUCTS` with the lane, Task 4). */
export function horizonTilePath(prefix: string, z: number, x: number, y: number): string {
  return `${prefix}/horizon/${z}/${x}/${y}.webp`;
}
