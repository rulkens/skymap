import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';

/** A mark the owner draws: the next `owner-N` id in the file. */
export function ownerMark(
  marks: DocsReviewMark[],
  text: string,
  state: DocsReviewMark['state'],
): DocsReviewMark {
  const taken = marks.map((mark) => Number(/^owner-(\d+)$/.exec(mark.id)?.[1] ?? 0));
  return { id: `owner-${Math.max(0, ...taken) + 1}`, text, reason: 'owner', state };
}
