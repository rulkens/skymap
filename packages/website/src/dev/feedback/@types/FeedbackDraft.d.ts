import type { FeedbackSelection } from './FeedbackSelection';

/** A half-written note as kept across a reload: the element is found again from the rectangle. */
export type FeedbackDraft = Pick<FeedbackSelection, 'kind' | 'rect'> & {
  text: string;
  path: string;
};
