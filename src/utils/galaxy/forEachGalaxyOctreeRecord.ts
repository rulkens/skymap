import type { GalaxyColumns } from '../../@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyOctreeObject } from '../../@types/data/galaxyCatalog/GalaxyOctreeObject';
import type { Vec3 } from '../../@types/math/Vec3';
import type { Octree } from '../../@types/octree/Octree';
import { OFFSET_FRACTION_LEVELS } from '../../data/octree/octreeFormat';
import { octreeNodeOriginRelCamMpc } from '../octree/octreeNodeOriginRelCamMpc';

const ORIGIN: Vec3 = [0, 0, 0];

/**
 * Every record of a galaxy octree object at its absolute Mpc position (node origin + offset
 * fraction), node by node; `blob` marks the record a childful node keeps after its own (D7).
 */
export function forEachGalaxyOctreeRecord(
  { nodes, records }: GalaxyOctreeObject,
  octree: Pick<Octree<GalaxyColumns>, 'family' | 'grid'>,
  visit: (r: number, x: number, y: number, z: number, blob: boolean) => void,
): void {
  for (let row = 0; row < nodes.count; row++) {
    const first = nodes.firstRecord[row]!;
    const ownEnd = first + nodes.ownCount[row]!;
    const end = ownEnd + (nodes.childMask[row] !== 0 ? 1 : 0);
    if (end === first) continue;
    const { originRelCamMpc: o, cellScaleMpc } = octreeNodeOriginRelCamMpc(
      octree.grid,
      octree.family,
      nodes.morton[row]!,
      nodes.level[row]!,
      ORIGIN,
    );
    const scale = cellScaleMpc / OFFSET_FRACTION_LEVELS;
    for (let r = first; r < end; r++) {
      visit(
        r,
        o[0] + records.offset[3 * r]! * scale,
        o[1] + records.offset[3 * r + 1]! * scale,
        o[2] + records.offset[3 * r + 2]! * scale,
        r === ownEnd,
      );
    }
  }
}
