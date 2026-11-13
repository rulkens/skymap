/**
 * visibleDiscAreaPx — device px² of the Moon inside the frame, the crater pick's
 * budget: a coarse grid of the frame's rays, each tested against the unit sphere. A
 * circle round the projected centre is no stand-in near the surface, where the
 * horizon's ellipse runs far off the frame (earthrise: 1% of the true ground).
 */

import { mat4 } from 'wgpu-matrix';
import type { MoonCraterView } from '../@types/MoonCraterView';

const GRID = 32;
const Z = 0.5;

export function visibleDiscAreaPx(view: MoonCraterView): number {
  const inv = mat4.inverse(Float32Array.from(view.mvp));
  const [ex, ey, ez] = view.eye;
  const e2 = ex * ex + ey * ey + ez * ez;
  let inside = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const x = ((i + 0.5) / GRID) * 2 - 1;
      const y = 1 - ((j + 0.5) / GRID) * 2;
      // The pixel's point at mid depth, local axes (finite under a reversed or infinite
      // projection too): the ray runs from the eye through it.
      const w = inv[3]! * x + inv[7]! * y + inv[11]! * Z + inv[15]!;
      const dx = (inv[0]! * x + inv[4]! * y + inv[8]! * Z + inv[12]!) / w - ex;
      const dy = (inv[1]! * x + inv[5]! * y + inv[9]! * Z + inv[13]!) / w - ey;
      const dz = (inv[2]! * x + inv[6]! * y + inv[10]! * Z + inv[14]!) / w - ez;
      const b = ex * dx + ey * dy + ez * dz;
      const d2 = dx * dx + dy * dy + dz * dz;
      // Hits when the ray heads toward the sphere and its closest approach is under 1.
      if (b < 0 && e2 - (b * b) / d2 <= 1) inside++;
    }
  }
  return (inside / (GRID * GRID)) * view.widthPx * view.heightPx;
}
