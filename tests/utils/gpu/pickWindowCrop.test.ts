import { describe, expect, it } from 'vitest';

import type { PickWindow } from '../../../src/@types/engine/frame/PickWindow';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import { pickWindowCrop } from '../../../src/utils/gpu/pickWindowCrop';

const CANVAS: Vec2 = [100, 50];
const WINDOW: PickWindow = { originPx: [10, 20], sizePx: [4, 6] };

/** Column-major m · v. */
function apply(m: Float64Array, v: readonly number[]): number[] {
  return [0, 1, 2, 3].map((r) => v.reduce((sum, vc, c) => sum + m[c * 4 + r]! * vc, 0));
}

/** A canvas-px point as clip space at depth `z`, scaled by `w`. */
function clipOfCanvasPx(x: number, y: number, z: number, w: number): number[] {
  return [((x / CANVAS[0]) * 2 - 1) * w, (1 - (y / CANVAS[1]) * 2) * w, z, w];
}

describe('pickWindowCrop', () => {
  it('pickWindowCrop maps the window centre to clip (0, 0)', () => {
    const [x, y, z, w] = apply(pickWindowCrop(WINDOW, CANVAS), clipOfCanvasPx(12, 23, 0.4, 3));
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBe(0.4);
    expect(w).toBe(3);
  });

  it('pickWindowCrop maps the window corners to (±w, ±w)', () => {
    const crop = pickWindowCrop(WINDOW, CANVAS);
    const w = 2.5;
    const topLeft = apply(crop, clipOfCanvasPx(10, 20, 0, w));
    const bottomRight = apply(crop, clipOfCanvasPx(14, 26, 0, w));
    expect(topLeft[0]).toBeCloseTo(-w, 12);
    expect(topLeft[1]).toBeCloseTo(w, 12);
    expect(bottomRight[0]).toBeCloseTo(w, 12);
    expect(bottomRight[1]).toBeCloseTo(-w, 12);
  });

  it('a point k canvas px from the window centre lands k target px from it', () => {
    const crop = pickWindowCrop(WINDOW, CANVAS);
    const [kx, ky] = [7, -3];
    const [x, y, , w] = apply(crop, clipOfCanvasPx(12 + kx, 23 + ky, 0, 1.7));
    // Target px offset from its centre = target NDC · sizePx / 2, y flipped back to px-down.
    expect(((x! / w!) * WINDOW.sizePx[0]) / 2).toBeCloseTo(kx, 10);
    expect((-(y! / w!) * WINDOW.sizePx[1]) / 2).toBeCloseTo(ky, 10);
  });

  it('pickWindowCrop of the whole canvas is the identity', () => {
    const crop = pickWindowCrop({ originPx: [0, 0], sizePx: CANVAS }, CANVAS);
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    crop.forEach((value, i) => expect(value).toBeCloseTo(identity[i]!, 12));
  });
});
