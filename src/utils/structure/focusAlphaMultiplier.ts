import type { Vec3 } from '../../@types/math/Vec3';
import type { FocusUniformsValue } from '../../@types/rendering/FocusUniformsValue';
import { FOCUS_CORE_FRACTION } from '../../data/focusCoreFraction';
import { FOCUS_DIM_FLOOR } from '../../data/focusDimFloor';
import { distance3 } from '../math/distance3';
import { smoothstep } from '../math/smoothstep';

/**
 * focusAlphaMultiplier — the CPU statement of `focusAlphaMultiplier` in
 * `shaders/lib/focusUniforms.wesl`, which it must match constant for constant:
 * CPU-drawn things (the curated stars) dim by the same rule the GPU-drawn
 * survey does. Takes absolute world positions against the absolute focus centre.
 */

export function focusAlphaMultiplier(worldPos: Readonly<Vec3>, focus: FocusUniformsValue): number {
  const inner = Math.min(focus.physicalRadiusMpc, focus.apparentRadiusMpc * FOCUS_CORE_FRACTION);
  const t = smoothstep(inner, focus.apparentRadiusMpc, distance3(worldPos, focus.center));
  // Written as a subtraction from 1 so it is exactly 1 inside the core, where
  // the pick cut (multiplier < 1) must never fire.
  return 1 - t * (1 - FOCUS_DIM_FLOOR) * focus.blend;
}
