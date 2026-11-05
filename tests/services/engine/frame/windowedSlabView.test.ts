import { mat4d } from 'wgpu-matrix';
import { describe, expect, it } from 'vitest';

import type { PickWindow } from '../../../../src/@types/engine/frame/PickWindow';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import { windowedSlabView } from '../../../../src/services/engine/frame/windowedSlabView';
import { pickWindowCrop } from '../../../../src/utils/gpu/pickWindowCrop';
import { narrowMat4 } from '../../../../src/utils/math/narrowMat4';

const CANVAS: Vec2 = [3840, 2160];
const CURSOR: PickWindow = { originPx: [1234, 567], sizePx: [1, 1] };

// A translation the f32 `view.vp` cannot hold exactly, so the crop's 3840× scale
// turns its rounding into a different f32 product.
const SLAB_VP = mat4d.translation([1e7 + 0.37, -2e6 - 0.21, 0.5]) as Float64Array;

const SLAB: Slab = {
  index: 1,
  near: 0.1,
  far: 1000,
  vp: SLAB_VP,
  frame: { kind: 'world-mpc', originRelative: true },
  distanceRangeM: null,
  precision: 'f64',
  reversedZ: true,
};

const VIEW: SlabView = {
  slab: SLAB,
  vp: narrowMat4(SLAB_VP),
  camPos: [1, 2, 3],
  viewportPx: [CANVAS[0], CANVAS[1]],
  window: { originPx: [0, 0], sizePx: CANVAS },
  sampledDepth: { kind: 'test' } as unknown as SlabView['sampledDepth'],
};

describe('windowedSlabView', () => {
  it('windowedSlabView sets viewportPx and window to the window', () => {
    const windowed = windowedSlabView(VIEW, CURSOR, CANVAS);
    expect(windowed.viewportPx).toEqual([1, 1]);
    expect(windowed.window).toBe(CURSOR);
  });

  it('windowedSlabView narrows vp from the f64 product', () => {
    const crop = pickWindowCrop(CURSOR, CANVAS);
    const fromF64 = narrowMat4(mat4d.multiply(crop, SLAB_VP) as Float64Array);
    const fromF32 = narrowMat4(mat4d.multiply(crop, Float64Array.from(VIEW.vp)) as Float64Array);
    expect(fromF32).not.toEqual(fromF64);

    const windowed = windowedSlabView(VIEW, CURSOR, CANVAS);
    expect(windowed.vp).toEqual(fromF64);
    expect(windowed.slab.vp).toEqual(mat4d.multiply(crop, SLAB_VP));
  });

  it('windowedSlabView keeps camPos and every other slab field', () => {
    const windowed = windowedSlabView(VIEW, CURSOR, CANVAS);
    expect(windowed.camPos).toBe(VIEW.camPos);
    expect(windowed.sampledDepth).toBe(VIEW.sampledDepth);
    const { vp: _vp, ...rest } = windowed.slab;
    const { vp: _origVp, ...origRest } = SLAB;
    expect(rest).toEqual(origRest);
    expect(SLAB.vp).toBe(SLAB_VP);
  });
});
