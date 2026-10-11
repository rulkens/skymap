/**
 * resolveStarRecord — turn a picked star record index into the star it names:
 * heliocentric position in Mpc plus the decoded absolute magnitude and BP-RP.
 * The owner is the row with own records whose `firstRecord` is the largest at
 * or below the index. Rows with own records are strictly increasing in
 * `firstRecord` in both formats (SKST fills its real-star region leaf by leaf; the
 * octree lays records out in row order), so a binary search over that
 * subsequence finds it; a blob record falls past its owner's own range and
 * resolves to null. Reconstruction runs through `starNodeOriginRelCamMpc`, the
 * formula the renderer draws with, so the pick lands where the sprite was.
 */
import type { Vec3 } from '../../../@types/math/Vec3';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';
import { OFFSET_FRACTION_LEVELS } from '../../../data/octree/octreeFormat';
import { starNodeOriginRelCamMpc } from '../../../utils/star/starNodeOriginRelCamMpc';

/** Heliocentric camera position — the reconstruction wants the world origin. */
const SUN: Vec3 = [0, 0, 0];

/** Rows that own records, in row order; memoised per immutable octree. */
const ownerCache = new WeakMap<StarOctree, Uint32Array>();

function ownerRows(octree: StarOctree): Uint32Array {
  const cached = ownerCache.get(octree);
  if (cached) return cached;
  const rows: number[] = [];
  for (let i = 0; i < octree.nodes.count; i++) if (octree.nodes.ownCount[i]! > 0) rows.push(i);
  const owners = Uint32Array.from(rows);
  ownerCache.set(octree, owners);
  return owners;
}

export function resolveStarRecord(
  octree: StarOctree,
  recordIndex: number,
): { positionMpc: Vec3; absMag: number; bpRp: number } | null {
  const { nodes, records } = octree;
  const owners = ownerRows(octree);

  // Largest owner whose firstRecord ≤ recordIndex; a negative or NaN index never matches.
  let lo = 0;
  let hi = owners.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (nodes.firstRecord[owners[mid]!]! <= recordIndex) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;

  const row = owners[found]!;
  if (recordIndex >= nodes.firstRecord[row]! + nodes.ownCount[row]!) return null;

  const { originRelCamMpc, cellScaleMpc } = starNodeOriginRelCamMpc(
    octree.grid,
    nodes.morton[row]!,
    nodes.level[row]!,
    SUN,
  );
  const o = 3 * recordIndex;
  const positionMpc: Vec3 = [
    originRelCamMpc[0] + (records.offset[o]! / OFFSET_FRACTION_LEVELS) * cellScaleMpc,
    originRelCamMpc[1] + (records.offset[o + 1]! / OFFSET_FRACTION_LEVELS) * cellScaleMpc,
    originRelCamMpc[2] + (records.offset[o + 2]! / OFFSET_FRACTION_LEVELS) * cellScaleMpc,
  ];

  return {
    positionMpc,
    absMag: records.absMag[recordIndex]!,
    bpRp: records.colourIndex[recordIndex]!,
  };
}
