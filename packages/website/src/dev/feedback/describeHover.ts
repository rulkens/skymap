import type { FeedbackHover } from './@types/FeedbackHover';
import type { FeedbackPoint } from './@types/FeedbackPoint';
import { pickElement } from './pickElement';

/** The element a press at `point` would choose, as its box in the viewport and a tag-and-classes label. */
export function describeHover({ x, y }: FeedbackPoint): FeedbackHover {
  const el = pickElement(x, y);
  const { left, top, width, height } = el.getBoundingClientRect();
  const classes = [...el.classList].slice(0, 2).map((c) => `.${c}`);
  return { rect: { x: left, y: top, width, height }, label: `${el.localName}${classes.join('')}` };
}
