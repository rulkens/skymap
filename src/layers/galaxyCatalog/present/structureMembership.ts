/**
 * structureMembership — pure cone-search over the resident galaxy records:
 * the packed `(sourceCode << 26 | pickIndex)` identities of every galaxy with
 * `distance(g, center) < radius`, strictly (the ring is a hard outer edge, spec
 * §11.6; the squared compare keeps strictness without a sqrt).
 *
 * No caching here: memoising against `(structureId, dataRev)` belongs to the
 * subsystem that sees tier swaps bump `dataRev` (spec §4.3).
 */

import { packSelection } from '../../../data/selectionEncoding';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { GalaxyRecordSource } from '../../../@types/data/galaxyCatalog/GalaxyRecordSource';
import type { StructureMembershipResult } from '../@types/StructureMembershipResult';

/** O(total galaxy count), single-digit ms for ~2.5M galaxies (spec §4.2). */
export function structureMembership(
  records: readonly GalaxyRecordSource[],
  centerMpc: Vec3,
  radiusMpc: number,
): StructureMembershipResult {
  const cx = centerMpc[0];
  const cy = centerMpc[1];
  const cz = centerMpc[2];
  const r2 = radiusMpc * radiusMpc;

  const packedIds: number[] = [];
  for (const record of records) {
    const source = record.source;
    record.forEachResidentBlock(({ positions, count }, ordinalBase) => {
      // packSelection only fires for members (a few hundred of millions
      // scanned), so inlining the encoding would buy nothing.
      for (let i = 0; i < count; i++) {
        const base = i * 3;
        const dx = positions[base + 0]! - cx;
        const dy = positions[base + 1]! - cy;
        const dz = positions[base + 2]! - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r2) {
          const pick = record.pickOfOrdinal(ordinalBase + i);
          if (pick !== null) packedIds.push(packSelection(source, pick));
        }
      }
    });
  }
  return { count: packedIds.length, packedIds };
}
