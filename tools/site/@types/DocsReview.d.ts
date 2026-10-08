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
};
