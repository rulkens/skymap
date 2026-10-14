import type { Point } from './@types/Point';

/** Centre of a DevTools quad (x1,y1 … x4,y4): the mean of its four corners. */
export function quadCentre(quad: readonly number[]): Point {
  if (quad.length !== 8) throw new Error(`a quad has 8 numbers (got ${quad.length})`);
  let x = 0;
  let y = 0;
  for (let i = 0; i < 8; i += 2) {
    x += quad[i] as number;
    y += quad[i + 1] as number;
  }
  return { x: x / 4, y: y / 4 };
}
