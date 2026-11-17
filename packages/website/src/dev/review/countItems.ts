import type { ReviewCounts } from './@types/ReviewCounts';
import type { ReviewItem } from './@types/ReviewItem';

/** How many marks of each state a section has, and how many notes. */
export function countItems(items: ReviewItem[]): ReviewCounts {
  const counts = { cut: 0, keep: 0, rewrite: 0, good: 0, notes: 0 };
  for (const item of items) {
    if (item.kind === 'mark') counts[item.mark.state]++;
    else counts.notes++;
  }
  return counts;
}
