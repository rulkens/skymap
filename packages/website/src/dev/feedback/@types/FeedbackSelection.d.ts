import type { FeedbackRect } from '../../../../../../tools/site/@types/FeedbackRect';

/** What the owner chose: the area in page coordinates, how, and the element it stands for. */
export type FeedbackSelection = {
  kind: 'element' | 'rectangle';
  rect: FeedbackRect;
  element: Element;
};
