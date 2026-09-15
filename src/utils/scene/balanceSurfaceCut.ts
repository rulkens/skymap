import type { SurfaceCutTile } from '../../@types/scene/SurfaceCutTile';
import type { SurfaceTileBand } from '../../@types/scene/SurfaceTileBand';
import { packSurfaceTileKey as packTile } from './packSurfaceTileKey';
import { surfaceTileColumns } from './surfaceTileColumns';
import { surfaceTileInBand } from './surfaceTileInBand';

/**
 * balanceSurfaceCut — steps edge-neighbouring leaves onto HEIGHT levels no
 * more than one apart (R14) by climbing the finer side's lattice; leaves are
 * never added or removed. Meeting a neighbour AT its band ceiling (no tile
 * one level finer than its CURRENT height) is skipped — a permanent step
 * (R12) — and gets code 2, the only way a step of 2+ survives. Longitude wraps.
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
  const edges: Array<[0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]> = cut.map(() => [0, 0, 0, 0]);

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
  /** Every adjacent pair, visited once, from the finer-or-equal LEAF side: the
   *  coarser leaf of a pair never finds the finer one, so `visit` gets both
   *  indices and `edge` as seen from `i`. Ceiling exemption (R12) is decided
   *  per-comparison by the caller, not here — it keys on HEIGHT level, which
   *  a pair's leaf adjacency does not determine. */
  function eachPair(visit: (i: number, j: number, edge: number) => void): void {
    for (let i = 0; i < cut.length; i++) {
      const { z, x, y } = cut[i]!.id;
      for (let edge = 0; edge < 4; edge++) {
        if (!neighbourCell(edge, z, x, y, cell)) continue;
        const j = coveringLeaf(z, cell[0]!, cell[1]!);
        if (j < 0 || j === i) continue;
        visit(i, j, edge);
      }
    }
  }

  /** True when leaf `k`'s cell has no tile one level FINER than its CURRENT
   *  height level (not its leaf level, which streaming can leave stale) — a
   *  permanent band ceiling (R12), not a resident tile just not landed yet. */
  function atHeightCeiling(k: number): boolean {
    const { z, x, y } = cut[k]!.id;
    const hz = heightLevel(k);
    const shift = z - hz;
    return !surfaceTileInBand(bands, tilePx, hz + 1, (x >> shift) * 2, (y >> shift) * 2);
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
  // base level, so this terminates. Coarsening the fine side toward a coarse
  // one AT its ceiling would throw away resolution the ring can never meet
  // halfway (Søndermarken), so that side alone is exempt — the step survives.
  let changed = true;
  while (changed) {
    changed = false;
    eachPair((i, j) => {
      const a = heightLevel(i);
      const b = heightLevel(j);
      if (a - b >= 2) {
        if (!atHeightCeiling(j) && coarsenTo(i, b + 1)) changed = true;
      } else if (b - a >= 2) {
        if (!atHeightCeiling(i) && coarsenTo(j, a + 1)) changed = true;
      }
    });
  }

  // `edge ^ 1` is the same edge from the neighbour's side (west↔east,
  // south↔north), which is how the coarser-id leaf of a pair gets its code.
  // A step of 2+ survives the fixpoint above only under R12's band-ceiling
  // exemption, and is the seam F2 skirts rather than samples across.
  eachPair((i, j, edge) => {
    const a = heightLevel(i);
    const b = heightLevel(j);
    if (a > b) edges[i]![edge] = a - b === 1 ? 1 : 2;
    else if (b > a) edges[j]![edge ^ 1] = b - a === 1 ? 1 : 2;
  });

  // Most leaves clear balance untouched every frame; returning the SAME
  // object then (not a spread copy) skips ~900 allocations per frame.
  return cut.map((leaf, i) => {
    const e = edges[i]!;
    if (heights[i] === leaf.height && e[0] === 0 && e[1] === 0 && e[2] === 0 && e[3] === 0)
      return leaf;
    return { ...leaf, height: heights[i]!, edgeCoarser: e };
  });
}
