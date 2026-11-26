import type { HeightPyramid } from '../@types/HeightPyramid';
import { HORIZON_MARCH_COARSEST_LEVEL } from '../data/horizonMarch';

/**
 * marchCeilingM — the highest ground a march from tile (z, x, y) can meet: the max
 * `subtreeMaxM` over its z3 ancestor and the ancestor's neighbours, taking every column of a
 * polar row, where meridians converge and a march crosses many columns or the pole. The
 * ancestor alone would miss a ridge just across its edge. Enough because a march ends within
 * ~12° of arc on all three bodies (relief under 30 km), inside one 45° z3 tile.
 */
export function marchCeilingM(pyramid: HeightPyramid, z: number, x: number, y: number): number {
  const level = HORIZON_MARCH_COARSEST_LEVEL;
  const columns = 2 ** level;
  const rows = columns / 2;
  const ancestorX = x >> (z - level);
  const ancestorY = y >> (z - level);
  let ceilingM = Number.NEGATIVE_INFINITY;
  for (let row = Math.max(0, ancestorY - 1); row <= Math.min(rows - 1, ancestorY + 1); row++) {
    const polar = row === 0 || row === rows - 1;
    const near = [ancestorX - 1, ancestorX, ancestorX + 1].map((c) => (c + columns) % columns);
    for (const column of polar ? [...Array(columns).keys()] : near) {
      ceilingM = Math.max(ceilingM, pyramid.subtreeMaxM(level, column, row));
    }
  }
  return ceilingM;
}
