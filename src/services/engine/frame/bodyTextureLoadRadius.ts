/**
 * bodyTextureLoadRadius — camera distance (Mpc) at which a body's surface
 * texture is demanded: 1e4 of its own radii from the celestial roster (mesh
 * bodies bake their albedo, never a texture). Tuned for selectivity over lead
 * time: approaching Earth must not pull in Mars (~135 MB per large-tier
 * surface); a late texture just pops onto the flat-albedo sphere. Earth's gate
 * lands near 0.4 AU. A ring rides its host's gate via `hostBodyId`.
 */

import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../../@types/data/RingTextureId';
import { SCENE_CELESTIAL_BODIES } from '../../../data/bodies/sceneCelestialBodies';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { hostBodyId } from '../../../utils/scene/hostBodyId';
import { SCALE_UNITS } from '../../../data/scaleUnits';

export function loadRadiusMpc(id: BodyTextureId | RingTextureId): number {
  const body = findByIdOrThrow(SCENE_CELESTIAL_BODIES, hostBodyId(id), 'bodyTextureLoadRadius');
  return body.radiusM * SCALE_UNITS.M_TO_MPC * 1e4;
}
