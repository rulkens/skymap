import type { PickWindow } from '../../@types/engine/frame/PickWindow';
import type { Vec2 } from '../../@types/math/Vec2';
import { pickWindowNdc } from './pickWindowNdc';

/**
 * The clip-space crop C that maps a canvas-px window onto the whole target:
 * x' = s.x·(x − c.x·w), y' = s.y·(y − c.y·w), z and w untouched, with c the
 * window centre in canvas NDC and s = 1 / its half-extent. Column-major f64,
 * so `C · slab.vp` keeps the `x − c.x·w` cancellation out of f32 (s reaches
 * 3840 at 4K).
 */
export function pickWindowCrop(window: PickWindow, canvasPx: Readonly<Vec2>): Float64Array {
  const { centre, halfExtent } = pickWindowNdc(window, canvasPx);
  const sx = 1 / halfExtent[0];
  const sy = 1 / halfExtent[1];
  const crop = new Float64Array(16);
  crop[0] = sx;
  crop[5] = sy;
  crop[10] = 1;
  crop[12] = -sx * centre[0];
  crop[13] = -sy * centre[1];
  crop[15] = 1;
  return crop;
}
