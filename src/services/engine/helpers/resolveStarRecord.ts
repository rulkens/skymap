/**
 * resolveStarRecord — turn a catalog record ordinal into the star it names:
 * heliocentric position in Mpc plus the decoded absolute magnitude and BP-RP.
 * The ordinal names an object (the index, or a chunk that must be resident)
 * and a local record, owned by the row with own records whose `firstRecord`
 * is the largest at or below it: owners rise strictly in both formats (SKST's
 * aggregate region breaks that over ALL rows), so a binary search finds it.
 * A blob falls past its owner's own range and resolves to null. Positions go
 * through `octreeNodeOriginRelCamMpc`, the formula the renderer draws with.
 */
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Octree } from '../../../@types/octree/Octree';
import type { OctreeResidency } from '../../../@types/octree/OctreeResidency';
import type { OctreeNodeTable } from '../../../@types/octree/OctreeNodeTable';
import { OFFSET_FRACTION_LEVELS } from '../../../data/octree/octreeFormat';
import { octreeNodeOriginRelCamMpc } from '../../../utils/octree/octreeNodeOriginRelCamMpc';
import type { StarColumns } from '../../../@types/data/starCatalog/StarColumns';

/** Heliocentric camera position — the reconstruction wants the world origin. */
const SUN: Vec3 = [0, 0, 0];

/** Rows that own records, in row order; memoised per immutable node table. */
const ownerCache = new WeakMap<OctreeNodeTable, Uint32Array>();

function ownerRows(nodes: OctreeNodeTable): Uint32Array {
  const cached = ownerCache.get(nodes);
  if (cached) return cached;
  const rows: number[] = [];
  for (let i = 0; i < nodes.count; i++) if (nodes.ownCount[i]! > 0) rows.push(i);
  const owners = Uint32Array.from(rows);
  ownerCache.set(nodes, owners);
  return owners;
}

export function resolveStarRecord(
  octree: Octree<StarColumns>,
  resident: OctreeResidency<StarColumns>,
  ordinal: number,
): { positionMpc: Vec3; absMag: number; bpRp: number } | null {
  if (!Number.isInteger(ordinal) || ordinal < 0) return null;
  const inIndex = ordinal < octree.records.count;
  const chunk = inIndex ? null : resident.chunkOfRecord(ordinal);
  if (!inIndex && chunk === null) return null;
  const { nodes, records } = chunk ?? octree;
  const recordIndex = chunk === null ? ordinal : ordinal - chunk.ref.recordBase;
  const owners = ownerRows(nodes);

  // Largest owner whose firstRecord ≤ recordIndex.
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

  const { originRelCamMpc, cellScaleMpc } = octreeNodeOriginRelCamMpc(
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
