/** Where a row sits, for the inspector's eyebrow: "Start", "Top level", or its block's name. */
import type { TimelineRow } from '../../@types/rows/TimelineRow';

/** `rows` is the full tree (nothing collapsed). */
export function rowWhere(rows: readonly TimelineRow[], row: TimelineRow): string {
  if (row.ref.kind === 'start') return 'Start';
  return rows.find((r) => r.id === row.parentId)?.label.name ?? 'Top level';
}
