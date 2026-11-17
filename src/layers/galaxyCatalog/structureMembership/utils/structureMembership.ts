/**
 * structureMembership — pure cone-search over the resident galaxy records:
 * how many galaxies sit at `distance(g, center) < radius`, strictly (the ring is
 * a hard outer edge, spec §11.6; the squared compare keeps strictness without a sqrt).
 *
 * No caching here: memoising against `(structureId, dataRev)` belongs to the
 * subsystem that sees tier swaps bump `dataRev` (spec §4.3).
 */

import type { Vec3 } from '../../../../@types/math/Vec3';
import type { GalaxyRecordSource } from '../../records/@types/GalaxyRecordSource';

/** O(total galaxy count), single-digit ms for ~2.5M galaxies (spec §4.2). */
export function structureMembership(
  records: readonly GalaxyRecordSource[],
  centerMpc: Vec3,
  radiusMpc: number,
): number {
  const cx = centerMpc[0];
  const cy = centerMpc[1];
  const cz = centerMpc[2];
  const r2 = radiusMpc * radiusMpc;

  let count = 0;
  for (const record of records) {
    record.forEachResidentBlock(({ positions, count: blockCount }, ordinalBase) => {
      for (let i = 0; i < blockCount; i++) {
        const base = i * 3;
        const dx = positions[base + 0]! - cx;
        const dy = positions[base + 1]! - cy;
        const dz = positions[base + 2]! - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        // A member with no drawn point is not on screen, so it does not count.
        if (d2 < r2 && record.pickOfOrdinal(ordinalBase + i) !== null) count += 1;
      }
    });
  }
  return count;
}
