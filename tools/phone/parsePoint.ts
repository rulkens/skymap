import type { Point } from './@types/Point';

/** `x,y` in CSS pixels, or undefined when the text is not that shape. */
export function parsePoint(text: string): Point | undefined {
  const m = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(text.trim());
  return m === null ? undefined : { x: Number(m[1]), y: Number(m[2]) };
}
