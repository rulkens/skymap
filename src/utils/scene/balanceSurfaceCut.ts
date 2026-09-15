import type { SurfaceCutTile } from '../../@types/scene/SurfaceCutTile';
import { surfaceTileColumns } from './surfaceTileColumns';

/** (z, x, y) in one double: 5 + 20 + 19 bits, exact well past z19 at any tile
 *  edge ≥ 256 px, and a number key keeps the Map off per-leaf string building. */
function packTile(z: number, x: number, y: number): number {
  return z * 2 ** 39 + x * 2 ** 19 + y;
}

/**
 * balanceSurfaceCut — coarsens leaves, never refines, until no two
 * edge-neighbouring leaves differ by more than one level, then fills
 * `edgeCoarser`. One bit per edge is all F2's vertex stage gets to stitch
 * with, and that bit only means something under a 2:1 cut.
 *
 * Coarsening replaces a leaf's whole parent subtree with the parent, which
 * `resolveParent` builds from the residency the walk already has — resident by
 * construction, since it is what let the walk refine past it. A sibling culled
 * from the cut does not block the collapse: the parent covers it, off-screen.
 * Longitude wraps; the poles have no north/south neighbour.
 */
export function balanceSurfaceCut(
  cut: readonly SurfaceCutTile[],
  tilePx: number,
  resolveParent: (z: number, x: number, y: number) => SurfaceCutTile | null,
): SurfaceCutTile[] {
  if (cut.length === 0) return [];

  const leaves = new Map<number, SurfaceCutTile>();
  let minZ = Infinity;
  for (const leaf of cut) {
    leaves.set(packTile(leaf.id.z, leaf.id.x, leaf.id.y), leaf);
    if (leaf.id.z < minZ) minZ = leaf.id.z;
  }

  /** The leaf covering cell `(z, x, y)` — itself or the nearest leaf ancestor.
   *  `null` when something FINER covers it, or nothing does (off the cut). */
  function coveringLeaf(z: number, x: number, y: number): SurfaceCutTile | null {
    for (let az = z; az >= minZ; az--) {
      const found = leaves.get(packTile(az, x >> (z - az), y >> (z - az)));
      if (found !== undefined) return found;
    }
    return null;
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
  /** The coarsest edge neighbour of this leaf, or null if none is coarser. */
  function coarsestNeighbourLevel(z: number, x: number, y: number): number | null {
    let coarsest: number | null = null;
    for (let edge = 0; edge < 4; edge++) {
      if (!neighbourCell(edge, z, x, y, cell)) continue;
      const other = coveringLeaf(z, cell[0]!, cell[1]!);
      if (other === null || other.id.z >= z) continue;
      if (coarsest === null || other.id.z < coarsest) coarsest = other.id.z;
    }
    return coarsest;
  }

  // Fixpoint, finest offender first: one collapse can put its new parent two
  // levels from a neighbour that was in balance a moment ago, and only a
  // re-scan sees that. Each collapse strictly lowers the level sum, so this
  // terminates; in a cut the walk produced there is usually nothing to do.
  let coarsened = true;
  while (coarsened) {
    coarsened = false;
    const ordered = [...leaves.values()].sort((a, b) => b.id.z - a.id.z);
    for (const leaf of ordered) {
      const { z, x, y } = leaf.id;
      if (z <= minZ || leaves.get(packTile(z, x, y)) !== leaf) continue;
      const coarsest = coarsestNeighbourLevel(z, x, y);
      if (coarsest === null || z - coarsest < 2) continue;

      const parentZ = z - 1;
      const parentX = x >> 1;
      const parentY = y >> 1;
      const parent = resolveParent(parentZ, parentX, parentY);
      // Nothing drawable one level up: leave the step rather than punch a
      // hole. F2 reads `edgeCoarser`, so an unstitched edge is a seam, not a
      // missing patch.
      if (parent === null) continue;
      for (const [key, tile] of leaves) {
        const delta = tile.id.z - parentZ;
        if (delta > 0 && tile.id.x >> delta === parentX && tile.id.y >> delta === parentY)
          leaves.delete(key);
      }
      leaves.set(packTile(parentZ, parentX, parentY), parent);
      coarsened = true;
    }
  }

  const balanced: SurfaceCutTile[] = [];
  for (const leaf of leaves.values()) {
    const { z, x, y } = leaf.id;
    const edgeCoarser: [0 | 1, 0 | 1, 0 | 1, 0 | 1] = [0, 0, 0, 0];
    for (let edge = 0; edge < 4; edge++) {
      if (!neighbourCell(edge, z, x, y, cell)) continue;
      const other = coveringLeaf(z, cell[0]!, cell[1]!);
      if (other !== null && other.id.z < z) edgeCoarser[edge] = 1;
    }
    balanced.push({ ...leaf, edgeCoarser });
  }
  return balanced;
}
