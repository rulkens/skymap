import type { DocsReviewMark } from '../../../../../../tools/site/@types/DocsReviewMark';

/** What the section panel can do to the review; initReview applies each and re-renders. */
export type ReviewPanelActions = {
  setState: (mark: DocsReviewMark, state: DocsReviewMark['state']) => void;
  setNote: (mark: DocsReviewMark, key: 'why' | 'how' | 'after', value: string) => void;
  /** Scrolls to a mark's text, or to a note's element, and lights it. */
  go: (target: DocsReviewMark | Element) => void;
  deleteNote: (id: string) => void;
  whole: (state: 'cut' | 'good') => void;
  /** The consequence of applying the open section, for the confirm line. */
  applyText: () => { text: string; nothing: boolean };
  /** Asks the agent that watches the review file to carry out the open section. */
  apply: () => void;
  /** True from a confirm until the agent has made the edit. */
  applying: () => boolean;
};
