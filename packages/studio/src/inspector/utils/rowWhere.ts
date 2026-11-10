/** Where a row sits, for the inspector's eyebrow: "Start", "Top level", or "Sequence · 2/3". */
import type { TimelineRow } from '../../@types/rows/TimelineRow';

/** `rows` is the full tree (nothing collapsed). */
export function rowWhere(rows: readonly TimelineRow[], row: TimelineRow): string {
  if (row.ref.kind === 'start') return 'Start';
  const parent = rows.find((r) => r.id === row.parentId);
  if (parent === undefined) return 'Top level';
  const siblings = rows.filter((r) => r.parentId === row.parentId);
  return `${parent.label.name} · ${siblings.indexOf(row) + 1}/${siblings.length}`;
}
