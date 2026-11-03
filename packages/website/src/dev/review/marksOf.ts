import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import type { ReviewSection } from './@types/ReviewSection';

/** The marks of a section, without its notes. */
export function marksOf(section: ReviewSection): DocsReviewMark[] {
  return section.items.flatMap((item) => (item.kind === 'mark' ? [item.mark] : []));
}
