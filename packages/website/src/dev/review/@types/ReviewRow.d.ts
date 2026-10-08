import type { DocsReviewMark } from '../../../../../../tools/site/@types/DocsReviewMark';

/** One mark's row in the section panel. */
export type ReviewRow = {
  el: HTMLElement;
  update: (mark: DocsReviewMark) => void;
  focus: () => void;
};
