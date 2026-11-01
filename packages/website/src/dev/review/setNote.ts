import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';

/** The mark with one of the owner's notes stored on it; an empty note, or a replacement equal to the passage, is no note. */
export function setNote(
  mark: DocsReviewMark,
  key: 'why' | 'how' | 'after',
  value: string,
): DocsReviewMark {
  const next = { ...mark };
  if (value !== '' && !(key === 'after' && value === mark.text)) next[key] = value;
  else delete next[key];
  return next;
}
