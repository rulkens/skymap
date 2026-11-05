import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import { wordsAfter } from './wordsAfter';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The consequence of applying `marks`, in one line the owner reads before confirming. */
export function describeApply(
  marks: DocsReviewMark[],
  before: number,
): { text: string; nothing: boolean } {
  const cut = marks.filter((m) => m.state === 'cut').length;
  const rewrites = marks.filter((m) => m.state === 'rewrite');
  const withText = rewrites.filter((m) => m.after).length;
  const left = rewrites.length - withText;
  if (cut + rewrites.length === 0)
    return { text: 'nothing to apply: no passage is cut or marked for rewrite', nothing: true };
  const parts = [
    ...(cut > 0 ? [`removes ${plural(cut, 'passage', 'passages')}`] : []),
    `${before} → ${wordsAfter(marks, before)} words`,
    ...(withText > 0 ? [`${plural(withText, 'rewrite', 'rewrites')} with text`] : []),
    ...(left > 0 ? [`${left} left for the rewriter`] : []),
  ];
  return { text: parts.join(' · '), nothing: false };
}
