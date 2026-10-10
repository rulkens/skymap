import type { DocsReviewApplied } from './DocsReviewApplied';
import type { DocsReviewApply } from './DocsReviewApply';
import type { DocsReviewMark } from './DocsReviewMark';

/** A proposed cut of one docs page, one JSON file per page under `.superpowers/.../review/`. */
export type DocsReview = {
  /** The page's path without the site base, e.g. `/docs/start/scene/`. */
  page: string;
  /** One line: the question a reader comes to this page with. */
  job: string;
  /** Word count of the article as the cutter found it. */
  words: { before: number };
  marks: DocsReviewMark[];
  /** Present from the owner's confirm until the agent has made the edit. */
  apply?: DocsReviewApply;
  /** Oldest first; the marks in these are history: not counted, not shown in the text. */
  applied?: DocsReviewApplied[];
};
