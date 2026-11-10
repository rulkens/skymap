import type { TimelineRow } from '../../@types/rows/TimelineRow';
import type { SelectionRelation } from '../@types/SelectionRelation';

/** `ancestors` is this row's chain, `selectedAncestors` the selected row's, both outermost first. */
export function selectionRelation(
  row: TimelineRow,
  ancestors: readonly TimelineRow[],
  selectedId: string | null,
  selectedAncestors: readonly TimelineRow[],
): SelectionRelation {
  const at = ancestors.findIndex((a) => a.id === selectedId);
  return {
    insideAt: at === -1 ? null : at,
    contains: selectedAncestors.some((a) => a.id === row.id),
  };
}
