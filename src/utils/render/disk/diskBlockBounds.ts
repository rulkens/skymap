import type { DiskBlockBounds } from '../../../@types/engine/subsystems/DiskBlockBounds';
import type { GalaxyColumnBlock } from '../../../@types/data/galaxyCatalog/GalaxyColumnBlock';

/**
 * One pass over a block's rows: the box and largest diameter of its galaxies. A NaN-position row
 * is a blob, not a galaxy, and is left out; a block of blobs only gets an empty box (min > max),
 * which no camera is inside or near.
 */
export function diskBlockBounds(
  block: Pick<GalaxyColumnBlock, 'count' | 'positions' | 'diameterKpc'>,
): DiskBlockBounds {
  const { count, positions, diameterKpc } = block;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let maxDiameter = 0;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    if (Number.isNaN(x + y + z)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
    maxDiameter = Math.max(maxDiameter, diameterKpc[i]!);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ, maxDiameterKpc: maxDiameter };
}
