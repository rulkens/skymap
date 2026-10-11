import type { ReviewItem } from './ReviewItem';

/** One item's row in the section panel. */
export type ReviewRow = {
  el: HTMLElement;
  update: (item: ReviewItem) => void;
  focus: () => void;
};
