/**
 * bodyGlintBrightnessOf — a glint's final brightness: phase x near cross-fade x far dissolve.
 * The one rule, so the pick pass recomputes exactly the drawn value rather than a copy of it.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { RENDER_ORIGIN_MPC } from '../../data/renderOrigin';
import { SCALE_FADE_BANDS } from '../../data/scaleFadeBands';
import { fadeBand } from '../math/fadeBand';
import { bodyGlintBrightness } from './bodyGlintBrightness';

export function bodyGlintBrightnessOf(
  albedo: Readonly<Vec3>,
  positionMpc: Readonly<Vec3>,
  camPosMpc: Readonly<Vec3>,
  diameterPx: number,
  backdropFade: number,
): number {
  return (
    bodyGlintBrightness({
      albedo,
      positionMpc,
      camPosMpc,
      renderOriginMpc: RENDER_ORIGIN_MPC,
      apparentDiameterPx: diameterPx,
    }) *
    fadeBand(SCALE_FADE_BANDS.bodyGlint, diameterPx) *
    backdropFade
  );
}
