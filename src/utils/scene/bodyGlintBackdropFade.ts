/**
 * bodyGlintBackdropFade — a glint's far dissolve: `bodyGlintBackdrop` keyed on the eye's
 * distance from the body's own root anchor (the Sun for the solar system, the host star for
 * an exoplanet), never `cam.distance` (which measures to the orbit target). So the fade stays
 * attached to the system it dissolves rather than to the render origin.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { BodyState } from '../../@types/scene/BodyState';
import type { PositionedId } from '../../@types/scene/PositionedId';
import { SCALE_FADE_BANDS } from '../../data/scaleFadeBands';
import { fadeBand } from '../math/fadeBand';
import { distanceMpc } from '../math/distanceMpc';
import { rootBodyIdOf } from './rootBodyIdOf';

export function bodyGlintBackdropFade(
  bodyId: PositionedId,
  camPosMpc: Readonly<Vec3>,
  states: ReadonlyMap<string, BodyState>,
): number {
  const root = states.get(rootBodyIdOf(bodyId))!.positionMpc;
  return fadeBand(SCALE_FADE_BANDS.bodyGlintBackdrop, distanceMpc(camPosMpc, root));
}
