import type { DocsReviewMark } from '../../../../../../tools/site/@types/DocsReviewMark';

/** A heading and everything up to the next heading of its level or above, with the marks inside it. */
export type ReviewSection = {
  /** Carries the section's icon: an h2 or h3, or the article's h1 for the intro. */
  heading: Element;
  /** The section runs from `start` (the heading, or the article for the intro) to before `end`; null runs to the article's end. */
  start: Element;
  end: Element | null;
  /** The heading's text as rendered, before any review UI is added to it. */
  title: string;
  /** In page order; a mark in an h3 is also in the h2 section around it. */
  marks: DocsReviewMark[];
};
