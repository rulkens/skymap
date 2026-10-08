import type { ReviewSection } from './ReviewSection';

/** The one open section panel. */
export type ReviewPanel = {
  heading: Element;
  refresh: (section: ReviewSection, wordsBefore: number, wordsAfter: number) => void;
  /** Scrolls an item's row into view and, with `focus`, puts the cursor in its first note field. */
  reveal: (key: string, focus: boolean) => void;
  close: () => void;
};
