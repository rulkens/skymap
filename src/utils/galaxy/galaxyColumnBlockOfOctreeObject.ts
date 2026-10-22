/**
 * One galaxy octree object's records as the disk walk's block, in record order so
 * `ordinalBase + i` stays the record's ordinal. Positions are absolute Mpc (node origin +
 * offset fraction); a blob, the record a childful node keeps after its own, keeps its NaN
 * position, which is how every block reader tells it from a galaxy (D7).
 */
import type { GalaxyColumnBlock } from '../../@types/data/galaxyCatalog/GalaxyColumnBlock';
import type { GalaxyColumns } from '../../@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyOctreeObject } from '../../@types/data/galaxyCatalog/GalaxyOctreeObject';
import type { Vec3 } from '../../@types/math/Vec3';
import type { Octree } from '../../@types/octree/Octree';
import { OFFSET_FRACTION_LEVELS } from '../../data/octree/octreeFormat';
import { octreeNodeOriginRelCamMpc } from '../octree/octreeNodeOriginRelCamMpc';
import { bandMagOfBakedAbsMag } from './bandMagOfBakedAbsMag';

const ORIGIN: Vec3 = [0, 0, 0];

export function galaxyColumnBlockOfOctreeObject(
  { nodes, records }: GalaxyOctreeObject,
  octree: Pick<Octree<GalaxyColumns>, 'family' | 'grid'>,
  magOffset: number,
): GalaxyColumnBlock {
  const { count, offset, absMag, logSize } = records;
  const positions = new Float32Array(count * 3).fill(NaN);
  const diameterKpc = new Float32Array(count);
  const magG = new Float32Array(count).fill(NaN);
  for (let row = 0; row < nodes.count; row++) {
    const first = nodes.firstRecord[row]!;
    const ownEnd = first + nodes.ownCount[row]!;
    if (ownEnd === first) continue;
    const { originRelCamMpc: o, cellScaleMpc } = octreeNodeOriginRelCamMpc(
      octree.grid,
      octree.family,
      nodes.morton[row]!,
      nodes.level[row]!,
      ORIGIN,
    );
    const scale = cellScaleMpc / OFFSET_FRACTION_LEVELS;
    for (let r = first; r < ownEnd; r++) {
      const x = o[0] + offset[3 * r]! * scale;
      const y = o[1] + offset[3 * r + 1]! * scale;
      const z = o[2] + offset[3 * r + 2]! * scale;
      positions[3 * r] = x;
      positions[3 * r + 1] = y;
      positions[3 * r + 2] = z;
      diameterKpc[r] = 10 ** logSize[r]!;
      magG[r] = bandMagOfBakedAbsMag(absMag[r]!, Math.hypot(x, y, z), magOffset);
    }
  }
  return {
    count,
    positions,
    diameterKpc,
    axisRatio: records.axisRatio,
    positionAngleDeg: records.pa,
    magG,
    colourIndexAt: (i) => records.colourIndex[i]!,
  };
}
