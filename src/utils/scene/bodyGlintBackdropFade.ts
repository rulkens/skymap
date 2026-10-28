/**
 * bodyGlintBackdropFade — the glints' far dissolve for one eye: `bodyGlintBackdrop` keyed on
 * the eye's distance from the solar system's own anchor, never `cam.distance` (which measures
 * to the orbit target). Both the band's edges and the distance come from that one region, so
 * the fade stays attached to the content it dissolves rather than to the render origin.
 * Per-frame constant: every glint shares one eye.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { BodyState } from '../../@types/scene/BodyState';
import { SCALE_FADE_BANDS } from '../../data/scaleFadeBands';
import { fadeBand } from '../math/fadeBand';
import { regionById } from '../regions/regionById';
import { regionRelativeDistanceMpc } from '../regions/regionRelativeDistanceMpc';

export function bodyGlintBackdropFade(
  camPosMpc: Readonly<Vec3>,
  states: ReadonlyMap<string, BodyState>,
): number {
  return fadeBand(
    SCALE_FADE_BANDS.bodyGlintBackdrop,
    regionRelativeDistanceMpc(camPosMpc, regionById('solar-system'), states),
  );
}
