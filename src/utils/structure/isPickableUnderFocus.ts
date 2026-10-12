import type { Vec3 } from '../../@types/math/Vec3';
import type { FocusUniformsValue } from '../../@types/rendering/FocusUniformsValue';
import { focusAlphaMultiplier } from './focusAlphaMultiplier';

/**
 * isPickableUnderFocus — the one CPU statement of "only what lies inside the
 * focused sphere is clickable": a subject the focus dims is not a target.
 * Exactly true at rest and for the focused subject itself (the sphere centre).
 */

export function isPickableUnderFocus(worldPos: Readonly<Vec3>, focus: FocusUniformsValue): boolean {
  // Mirrors FOCUS_PICK_EXCLUDE_BELOW (1.0) in lib/focusUniforms.wesl.
  return focusAlphaMultiplier(worldPos, focus) >= 1;
}
