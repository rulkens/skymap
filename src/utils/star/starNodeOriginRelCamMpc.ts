/**
 * The standalone home of the star renderer's f64-rebase precision seam
 * (`resolveStarRecord` reuses it; see `computeStarCut` for the full
 * catastrophic-cancellation landmine). f64 the whole way, narrowed to f32
 * only in the returned `Vec3`. One formula for leaves and aggregates via
 * `2^level` — inverts the box scaling `buildStarOctree` applies when
 * quantizing an aggregate's flux centroid. No division, so a node coincident
 * with the camera yields `[0, 0, 0]`, no divide-by-zero guard.
 */
import type { Vec3 } from '../../@types/math/Vec3';
import type { StarCatalog } from '../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogNode } from '../../@types/data/starCatalog/StarCatalogNode';
import { mortonDecode3 } from '../math/mortonDecode3';
import { SCALE_UNITS } from '../../data/scaleUnits';

export function starNodeOriginRelCamMpc(
  catalog: StarCatalog,
  node: StarCatalogNode,
  camPosMpc: Vec3,
): { originRelCamMpc: Vec3; cellScaleMpc: number } {
  const boxCells = 2 ** node.level;
  const boxEdgePc = catalog.cellEdgePc * boxCells;

  const [gx, gy, gz] = catalog.gridOrigin;
  const [cx, cy, cz] = mortonDecode3(node.mortonIndex);

  const pcToMpc = SCALE_UNITS.PC_TO_MPC;
  const originRelCamMpc: Vec3 = [
    (gx + cx * boxEdgePc) * pcToMpc - camPosMpc[0],
    (gy + cy * boxEdgePc) * pcToMpc - camPosMpc[1],
    (gz + cz * boxEdgePc) * pcToMpc - camPosMpc[2],
  ];

  const cellScaleMpc = boxEdgePc * pcToMpc;

  return { originRelCamMpc, cellScaleMpc };
}
