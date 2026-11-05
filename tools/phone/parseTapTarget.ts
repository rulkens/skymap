import type { TapTarget } from './@types/TapTarget';
import { parsePoint } from './parsePoint';

/** `x,y` is a point; anything else, selector lists like `.a,.b` included, is a CSS selector. */
export function parseTapTarget(text: string): TapTarget {
  const point = parsePoint(text);
  return point === undefined ? { kind: 'selector', selector: text } : { kind: 'point', point };
}
