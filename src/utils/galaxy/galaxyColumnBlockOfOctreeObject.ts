/**
 * One galaxy octree object's records as the disk walk's block, in record order so
 * `ordinalBase + i` stays the record's ordinal. Positions are absolute Mpc, placed by
 * the walk `packGalaxyGpuRecords` shares; a blob keeps
 * its NaN position, which is how every block reader tells it from a galaxy (D7).
 */
import type { GalaxyColumnBlock } from '../../@types/data/galaxyCatalog/GalaxyColumnBlock';
import type { GalaxyColumns } from '../../@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyOctreeObject } from '../../@types/data/galaxyCatalog/GalaxyOctreeObject';
import type { Octree } from '../../@types/octree/Octree';
import { bandMagOfBakedAbsMag } from './bandMagOfBakedAbsMag';
import { forEachGalaxyOctreeRecord } from './forEachGalaxyOctreeRecord';

export function galaxyColumnBlockOfOctreeObject(
  object: GalaxyOctreeObject,
  octree: Pick<Octree<GalaxyColumns>, 'family' | 'grid'>,
  magOffset: number,
): GalaxyColumnBlock {
  const { records } = object;
  const { count } = records;
  const positions = new Float32Array(count * 3).fill(NaN);
  const diameterKpc = new Float32Array(count);
  const magG = new Float32Array(count).fill(NaN);
  forEachGalaxyOctreeRecord(object, octree, (r, x, y, z, blob) => {
    if (blob) return;
    positions[3 * r] = x;
    positions[3 * r + 1] = y;
    positions[3 * r + 2] = z;
    diameterKpc[r] = 10 ** records.logSize[r]!;
    magG[r] = bandMagOfBakedAbsMag(records.absMag[r]!, Math.hypot(x, y, z), magOffset);
  });
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
