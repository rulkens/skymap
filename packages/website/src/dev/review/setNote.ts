import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';

/** Stores one of the owner's notes on a mark; an empty note, or a replacement equal to the passage, is no note. */
export function setNote(mark: DocsReviewMark, key: 'why' | 'how' | 'after', value: string): void {
  if (value !== '' && !(key === 'after' && value === mark.text)) mark[key] = value;
  else delete mark[key];
}
