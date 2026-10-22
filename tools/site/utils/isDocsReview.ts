import type { DocsReview } from '../@types/DocsReview';

const STATES = ['cut', 'keep', 'rewrite', 'good'];

/** Whether a body is a review the endpoint may store; the cutter writes these by hand, so it is strict about the shape. */
export function isDocsReview(value: unknown): value is DocsReview {
  const review = value as DocsReview | null;
  if (typeof review?.page !== 'string') return false;
  if (typeof review.words?.before !== 'number' || !Number.isFinite(review.words.before))
    return false;
  if (!Array.isArray(review.marks)) return false;
  const apply = review.apply;
  if (
    apply !== undefined &&
    (typeof apply?.scope !== 'string' || typeof apply.requested !== 'string')
  )
    return false;
  const applied = review.applied;
  if (
    applied !== undefined &&
    !(
      Array.isArray(applied) &&
      applied.every(
        (entry) =>
          typeof entry?.commit === 'string' &&
          typeof entry.at === 'string' &&
          Array.isArray(entry.markIds) &&
          entry.markIds.every((id) => typeof id === 'string'),
      )
    )
  )
    return false;
  const ids = new Set<string>();
  return review.marks.every((mark) => {
    const ok =
      typeof mark?.id === 'string' &&
      mark.id !== '' &&
      !ids.has(mark.id) &&
      typeof mark.text === 'string' &&
      mark.text.trim() !== '' &&
      typeof mark.reason === 'string' &&
      STATES.includes(mark.state) &&
      (mark.after === undefined || typeof mark.after === 'string') &&
      (mark.how === undefined || typeof mark.how === 'string') &&
      (mark.why === undefined || typeof mark.why === 'string');
    ids.add(mark?.id);
    return ok;
  });
}
