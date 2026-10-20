import type { PickWindow } from '../../@types/engine/frame/PickWindow';
import type { PickWindowNdc } from '../../@types/engine/frame/PickWindowNdc';
import type { Vec2 } from '../../@types/math/Vec2';

/**
 * A canvas-px window as a canvas-NDC rectangle. Pixel y grows down while NDC
 * y grows up, hence the flip on the centre.
 */
export function pickWindowNdc(window: PickWindow, canvasPx: Readonly<Vec2>): PickWindowNdc {
  const [ox, oy] = window.originPx;
  const [sx, sy] = window.sizePx;
  const [w, h] = canvasPx;
  return {
    centre: [((ox + sx / 2) / w) * 2 - 1, 1 - ((oy + sy / 2) / h) * 2],
    halfExtent: [sx / w, sy / h],
  };
}
