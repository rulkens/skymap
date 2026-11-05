import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import { wordsIn } from './wordsIn';

/** The words of a page or section after cut passages go and rewrites that have text are in place. */
export function wordsAfter(marks: DocsReviewMark[], before: number): number {
  return marks.reduce((words, mark) => {
    if (mark.state === 'cut') return words - wordsIn(mark.text);
    if (mark.state === 'rewrite' && mark.after)
      return words - wordsIn(mark.text) + wordsIn(mark.after);
    return words;
  }, before);
}
