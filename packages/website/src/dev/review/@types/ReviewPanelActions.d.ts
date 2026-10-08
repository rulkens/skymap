import type { DocsReviewMark } from '../../../../../../tools/site/@types/DocsReviewMark';

/** What the section panel can do to the review; initReview applies each and re-renders. */
export type ReviewPanelActions = {
  setState: (mark: DocsReviewMark, state: DocsReviewMark['state']) => void;
  setNote: (mark: DocsReviewMark, key: 'why' | 'how' | 'after', value: string) => void;
  go: (mark: DocsReviewMark) => void;
  whole: (state: 'cut' | 'good') => void;
};
