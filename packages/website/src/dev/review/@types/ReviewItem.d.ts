import type { DocsReviewMark } from '../../../../../../tools/site/@types/DocsReviewMark';
import type { PageNote } from '../../overlay/@types/PageNote';

/** What a section panel lists: a review mark, or a feedback note whose element lies in the section. */
export type ReviewItem =
  | { kind: 'mark'; mark: DocsReviewMark }
  | { kind: 'note'; note: PageNote; el: Element };
