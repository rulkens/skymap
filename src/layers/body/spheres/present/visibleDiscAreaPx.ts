/**
 * visibleDiscAreaPx — device px² of the Moon's disc inside the frame, the crater
 * pick's budget: the disc as the circle of its silhouette's angular radius round the
 * projected centre (exact on the view axis, near enough off it), counted on a coarse
 * grid of the frame. The whole frame when the centre is behind the eye.
 */

import type { MoonCraterView } from '../@types/MoonCraterView';

const GRID = 32;

export function visibleDiscAreaPx(view: MoonCraterView): number {
  const { widthPx: w, heightPx: h, mvp: m } = view;
  const dist = Math.hypot(view.eye[0], view.eye[1], view.eye[2]);
  const cw = m[15]!;
  if (cw <= 0 || dist <= 1) return w * h;
  const cx = (0.5 + (0.5 * m[12]!) / cw) * w;
  const cy = (0.5 - (0.5 * m[13]!) / cw) * h;
  const r = view.pxPerRad * Math.tan(Math.asin(1 / dist));
  let inside = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const x = ((i + 0.5) / GRID) * w - cx;
      const y = ((j + 0.5) / GRID) * h - cy;
      if (x * x + y * y <= r * r) inside++;
    }
  }
  return (inside / (GRID * GRID)) * w * h;
}
