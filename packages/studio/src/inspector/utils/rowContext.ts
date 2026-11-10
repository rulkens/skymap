/** Where a row sits for the inspector's eyebrow: its parent's name and its place among its siblings. */
import type { TimelineRow } from '../../@types/rows/TimelineRow';
import type { RowContext } from '../@types/RowContext';

const TOP_LEVEL = 'Top level';

/** `rows` is the full tree (nothing collapsed); `index` counts from 1. */
export function rowContext(rows: readonly TimelineRow[], row: TimelineRow): RowContext {
  // The Start row has no parent either, but it is not a step among the top-level ones.
  const siblings = rows.filter((r) => r.parentId === row.parentId && r.ref.kind !== 'start');
  const parent = rows.find((r) => r.id === row.parentId);
  return {
    parent: parent?.label.name ?? TOP_LEVEL,
    index: siblings.indexOf(row) + 1,
    count: siblings.length,
  };
}
