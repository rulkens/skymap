import { mat4d } from 'wgpu-matrix';
import type { PickWindow } from '../../../@types/engine/frame/PickWindow';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { Vec2 } from '../../../@types/math/Vec2';
import { pickWindowCrop } from '../../../utils/gpu/pickWindowCrop';
import { narrowMat4 } from '../../../utils/math/narrowMat4';

/**
 * `view` rasterising only `window`: the one place a window is applied. The
 * crop composes onto the f64 `slab.vp` and is narrowed after; cropping the
 * f32 `view.vp` would scale its rounding error by the crop's scale.
 */
export function windowedSlabView(
  view: SlabView,
  window: PickWindow,
  canvasPx: Readonly<Vec2>,
): SlabView {
  const vp = mat4d.multiply(pickWindowCrop(window, canvasPx), view.slab.vp) as Float64Array;
  return {
    ...view,
    slab: { ...view.slab, vp },
    vp: narrowMat4(vp),
    viewportPx: [window.sizePx[0], window.sizePx[1]],
    window,
  };
}
