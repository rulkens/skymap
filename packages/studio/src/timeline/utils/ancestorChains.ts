/** For each visible row, its ancestors outermost first. A visible row's parents are always visible too. */
import type { TimelineRow } from '../../@types/rows/TimelineRow';

export function ancestorChains(rows: readonly TimelineRow[]): TimelineRow[][] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return rows.map((row) => {
    const chain: TimelineRow[] = [];
    for (let at = byId.get(row.parentId ?? ''); at !== undefined; at = byId.get(at.parentId ?? ''))
      chain.unshift(at);
    return chain;
  });
}
