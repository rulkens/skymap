import type { TimelineRow } from '../../@types/rows/TimelineRow';
import type { SelectionRelation } from '../@types/SelectionRelation';

/**
 * Row `index` against the selected row, by their ancestor chains (outermost first). A block holding
 * the selection runs a path down its rail through every row from it to the selected one, inclusive.
 */
export function selectionRelation(
  rows: readonly TimelineRow[],
  chains: readonly (readonly TimelineRow[])[],
  index: number,
  selectedIndex: number,
): SelectionRelation {
  const ancestors = chains[index]!;
  const selected = rows[selectedIndex];
  const holders = chains[selectedIndex] ?? [];
  const at = ancestors.findIndex((a) => a.id === selected?.id);
  const pathAt =
    index > selectedIndex
      ? []
      : ancestors.flatMap((a, k) => (holders.some((h) => h.id === a.id) ? [k] : []));
  return {
    insideAt: at === -1 ? null : at,
    contains: holders.some((h) => h.id === rows[index]!.id),
    pathAt,
  };
}
