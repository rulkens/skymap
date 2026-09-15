import type { SurfaceCutTile } from '../../@types/scene/SurfaceCutTile';
import type { SurfaceTileBand } from '../../@types/scene/SurfaceTileBand';
import { packSurfaceTileKey as packTile } from './packSurfaceTileKey';
import { surfaceTileColumns } from './surfaceTileColumns';
import { surfaceTileInBand } from './surfaceTileInBand';

/**
 * balanceSurfaceCut — steps edge-neighbouring leaves onto HEIGHT levels no
 * more than one apart (R14) by climbing the finer side's lattice; leaves are
 * never added or removed. A neighbour that cannot refine (no band bakes under
 * it) is exempt: a band ceiling is a permanent step (R12). Longitude wraps.
 */
export function balanceSurfaceCut(
  cut: readonly SurfaceCutTile[],
  tilePx: number,
  bands: readonly SurfaceTileBand[],
  resolveHeight: (
    z: number,
    x: number,
    y: number,
    minLevelDelta: number,
  ) => SurfaceCutTile['height'] | null,
): SurfaceCutTile[] {
  if (cut.length === 0) return [];

  const indexOf = new Map<number, number>();
  let minZ = Infinity;
  for (let i = 0; i < cut.length; i++) {
    const { z, x, y } = cut[i]!.id;
    indexOf.set(packTile(z, x, y), i);
    if (z < minZ) minZ = z;
  }
  const heights = cut.map((leaf) => leaf.height);
  const edges: Array<[0 | 1, 0 | 1, 0 | 1, 0 | 1]> = cut.map(() => [0, 0, 0, 0]);

  const heightLevel = (i: number): number => cut[i]!.id.z - heights[i]!.levelDelta;

  /** Index of the leaf covering cell `(z, x, y)` — itself or the nearest leaf
   *  ancestor. `-1` when something FINER covers it (that leaf finds this pair
   *  from its own side) or nothing does. */
  function coveringLeaf(z: number, x: number, y: number): number {
    for (let az = z; az >= minZ; az--) {
      const found = indexOf.get(packTile(az, x >> (z - az), y >> (z - az)));
      if (found !== undefined) return found;
    }
    return -1;
  }

  /** Cell across `edge` (0..3 = west, east, south, north — R9) at the same
   *  level, into `out`; false at a pole, where rows do not wrap as x does. */
  function neighbourCell(edge: number, z: number, x: number, y: number, out: number[]): boolean {
    const cols = surfaceTileColumns(z, tilePx);
    out[0] = x;
    out[1] = y;
    if (edge === 0) out[0] = x === 0 ? cols - 1 : x - 1;
    else if (edge === 1) out[0] = x === cols - 1 ? 0 : x + 1;
    else if (edge === 2) {
      if (y + 1 >= cols / 2) return false;
      out[1] = y + 1;
    } else {
      if (y === 0) return false;
      out[1] = y - 1;
    }
    return true;
  }

  const cell = [0, 0];
  /** Every adjacent pair, visited once, from the finer-or-equal side: the
   *  coarser leaf of a pair never finds the finer one, so `visit` gets both
   *  indices and `edge` as seen from `i`. A pair straddling a band ceiling is
   *  skipped whole (R12): nothing exists under the coarse side to refine into,
   *  so its step is permanent and meeting it would walk the cut back up. */
  function eachPair(visit: (i: number, j: number, edge: number) => void): void {
    for (let i = 0; i < cut.length; i++) {
      const { z, x, y } = cut[i]!.id;
      for (let edge = 0; edge < 4; edge++) {
        if (!neighbourCell(edge, z, x, y, cell)) continue;
        const j = coveringLeaf(z, cell[0]!, cell[1]!);
        if (j < 0 || j === i) continue;
        const other = cut[j]!.id;
        if (other.z < z && !surfaceTileInBand(bands, tilePx, other.z + 1, other.x * 2, other.y * 2))
          continue;
        visit(i, j, edge);
      }
    }
  }

  /** Climb leaf `i`'s lattice to `targetLevel` or the next resident level
   *  above it. False when nothing coarser is resident — the step survives
   *  rather than the leaf, which F2 reads as a seam. */
  function coarsenTo(i: number, targetLevel: number): boolean {
    const { z, x, y } = cut[i]!.id;
    const next = resolveHeight(z, x, y, z - targetLevel);
    if (next === null || next.levelDelta <= heights[i]!.levelDelta) return false;
    heights[i] = next;
    return true;
  }

  // Fixpoint: one climb can put its leaf two levels from a neighbour that was
  // in balance a moment ago. `levelDelta` only ever grows and is bounded by the
  // base level, so this terminates.
  let changed = true;
  while (changed) {
    changed = false;
    eachPair((i, j) => {
      const a = heightLevel(i);
      const b = heightLevel(j);
      if (a - b >= 2) {
        if (coarsenTo(i, b + 1)) changed = true;
      } else if (b - a >= 2) {
        if (coarsenTo(j, a + 1)) changed = true;
      }
    });
  }

  // `edge ^ 1` is the same edge from the neighbour's side (west↔east,
  // south↔north), which is how the coarser-id leaf of a pair gets its bit.
  eachPair((i, j, edge) => {
    const a = heightLevel(i);
    const b = heightLevel(j);
    if (a === b + 1) edges[i]![edge] = 1;
    else if (b === a + 1) edges[j]![edge ^ 1] = 1;
  });

  return cut.map((leaf, i) => ({ ...leaf, height: heights[i]!, edgeCoarser: edges[i]! }));
}
