/**
 * sumProvenanceCounts — collapse the per-source provenance tallies stored in
 * `engineSlice` into the one totals row the debug panel's provenance table
 * renders under the per-source rows.
 *
 * Iterates `PROVENANCE_AXES` for the axis keys rather than hard-coding
 * 'orientation' / 'size': a third axis then needs no edit here, same reason
 * `countEstimatedProvenance` iterates the registry to produce the per-source
 * counts this function sums.
 *
 * Returns all-zeros rather than null when `bySource` is empty. The panel
 * decides "no catalogs loaded yet" off `total === 0`; a null return would
 * just move that branch into every call site instead of removing it.
 */

import { PROVENANCE_AXES } from '../data/provenanceAxes';
import type { SourceType } from '../@types/data/SourceType';
import type { ProvenanceAxisId } from '../@types/settings/ProvenanceAxisId';
import type { ProvenanceCounts } from '../@types/engine/ProvenanceCounts';

export function sumProvenanceCounts(
  bySource: Partial<Record<SourceType, ProvenanceCounts>>,
): ProvenanceCounts {
  const estimated = {} as Record<ProvenanceAxisId, number>;
  for (const axis of PROVENANCE_AXES) estimated[axis.id] = 0;

  let total = 0;
  for (const counts of Object.values(bySource) as ProvenanceCounts[]) {
    total += counts.total;
    for (const axis of PROVENANCE_AXES) estimated[axis.id] += counts.estimated[axis.id];
  }

  return { total, estimated };
}
