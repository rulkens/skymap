import type { ReviewItem } from './@types/ReviewItem';

/** What names an item's row: a mark and a note may share an id string. */
export function itemKey(item: ReviewItem): string {
  return item.kind === 'mark' ? `mark:${item.mark.id}` : `note:${item.note.id}`;
}
