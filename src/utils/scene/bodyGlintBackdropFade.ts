/**
 * bodyGlintBackdropFade — a glint's far dissolve: `bodyGlintBackdrop` keyed on the eye's
 * distance from the body's own root anchor (the Sun for the solar system, the host star for
 * an exoplanet), never `cam.distance` (which measures to the orbit target). So the fade stays
 * attached to the system it dissolves rather than to the render origin.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_FADE_BANDS } from '../../data/scaleFadeBands';
import { fadeBand } from '../math/fadeBand';
import { distanceMpc } from '../math/distanceMpc';

/** `rootMpc` is the body's root anchor, `lightSourceMpc`'s answer: callers walk it once per glint. */
export function bodyGlintBackdropFade(rootMpc: Readonly<Vec3>, camPosMpc: Readonly<Vec3>): number {
  return fadeBand(SCALE_FADE_BANDS.bodyGlintBackdrop, distanceMpc(camPosMpc, rootMpc));
}
