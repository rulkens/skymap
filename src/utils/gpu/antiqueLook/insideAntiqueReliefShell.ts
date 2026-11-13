/**
 * insideAntiqueReliefShell — whether the eye is close enough over `hostId`, a body the
 * antique look engraves (`ANTIQUE_RELIEF_BODIES`), for the relief pass to run there.
 * Inside it the engraved ground replaces the globe's ink (its washes carry on).
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PositionedId } from '../../../@types/scene/PositionedId';
import {
  ANTIQUE_RELIEF_BODIES,
  ANTIQUE_RELIEF_MAX_ALT_M,
} from '../../../data/rendering/antiqueRelief';
import { SCENE_CELESTIAL_BODIES } from '../../../data/bodies/sceneCelestialBodies';

export function insideAntiqueReliefShell(ctx: FrameView, hostId: PositionedId): boolean {
  if (ANTIQUE_RELIEF_BODIES[hostId] === undefined) return false;
  const body = SCENE_CELESTIAL_BODIES.find((b) => b.id === hostId);
  const pose = ctx.bodyPose(hostId);
  if (body === undefined || pose === null) return false;
  return Math.hypot(...pose.eyeRelBodyM) - body.surface.datumRadiusM <= ANTIQUE_RELIEF_MAX_ALT_M;
}
