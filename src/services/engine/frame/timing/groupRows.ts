/**
 * groupRows — bucket an ordered row list into display groups by title. The
 * group order is the unique titles of `PASS_GROUP_TITLES` in declared order
 * (which fixes the six-group layout), then any fallback titles (raw groupKeys
 * with no mapping) in first-appearance order. Rows keep their draw order within
 * a group, and an empty group is dropped — that's how the toggles list omits
 * the "composites & pick" group whose rows aren't togglable.
 */

import type { TimedSlotGroup } from '../../../../@types/engine/frame/TimedSlotGroup';
import type { TimedSlotRow } from '../../../../@types/engine/frame/TimedSlotRow';
import { PASS_GROUP_TITLES } from './passGroupTitles';

export function groupRows(rows: readonly TimedSlotRow[]): readonly TimedSlotGroup[] {
  const titleOf = (groupKey: string): string => PASS_GROUP_TITLES[groupKey] ?? groupKey;

  const order: string[] = [];
  const seen = new Set<string>();
  const remember = (title: string): void => {
    if (!seen.has(title)) {
      seen.add(title);
      order.push(title);
    }
  };
  for (const title of Object.values(PASS_GROUP_TITLES)) remember(title);
  for (const row of rows) remember(titleOf(row.groupKey));

  const byTitle = new Map<string, TimedSlotRow[]>();
  for (const row of rows) {
    const title = titleOf(row.groupKey);
    const bucket = byTitle.get(title);
    if (bucket) bucket.push(row);
    else byTitle.set(title, [row]);
  }

  const groups: TimedSlotGroup[] = [];
  for (const title of order) {
    const bucket = byTitle.get(title);
    if (bucket && bucket.length > 0) groups.push({ title, rows: bucket });
  }
  return groups;
}
