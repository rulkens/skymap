/**
 * The standalone home of the octree renderer's f64-rebase precision seam
 * (`resolveStarRecord` uses it; `cutIo.wesl` keeps the same discipline on the
 * GPU against catastrophic cancellation). f64 the whole way, narrowed to f32
 * only in the returned `Vec3`. One formula for every level via `2^level`. No
 * division, so a node coincident with the camera yields `[0, 0, 0]`, no
 * divide-by-zero guard.
 */
import type { Vec3 } from '../../@types/math/Vec3';
import type { OctreeGrid } from '../../@types/octree/OctreeGrid';
import { mortonDecode3 } from '../math/mortonDecode3';
import type { OctreeFamily } from '../../@types/octree/OctreeFamily';
import { OCTREE_FAMILIES } from '../../data/octree/octreeFamilies';

export function octreeNodeOriginRelCamMpc(
  grid: OctreeGrid,
  family: OctreeFamily,
  morton: number,
  level: number,
  camPosMpc: Readonly<Vec3>,
): { originRelCamMpc: Vec3; cellScaleMpc: number } {
  const boxEdge = grid.cellEdge * 2 ** level;

  const [gx, gy, gz] = grid.origin;
  const [cx, cy, cz] = mortonDecode3(morton);

  const unitMpc = OCTREE_FAMILIES[family].unitMpc;
  const originRelCamMpc: Vec3 = [
    (gx + cx * boxEdge) * unitMpc - camPosMpc[0],
    (gy + cy * boxEdge) * unitMpc - camPosMpc[1],
    (gz + cz * boxEdge) * unitMpc - camPosMpc[2],
  ];

  return { originRelCamMpc, cellScaleMpc: boxEdge * unitMpc };
}
