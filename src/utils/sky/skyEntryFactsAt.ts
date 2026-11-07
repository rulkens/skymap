/**
 * skyEntryFactsAt — the view-centre ground hit on the eye's terrain host: the same marcher,
 * tolerance and relief shells as the body arm's zoom pick, without its datum fallback (a miss
 * offers no entry). Cast at every altitude: a far sky entry reads the ground under its spot from
 * here once its approach looks straight down at it; the entry ceiling is `selectSkyEntry`'s.
 */
import type { BodyFixedPose } from '../../@types/camera/pose/BodyFixedPose';
import type { SkyEntryFacts } from '../../@types/engine/SkyEntryFacts';
import type { ViewFrustum } from '../../@types/camera/projection/ViewFrustum';
import type { Vec2 } from '../../@types/math/Vec2';
import type { HostBody } from '../../services/engine/camera/arms/@types/HostBody';
import { NO_SKY_ENTRY } from '../../data/sky/noSkyEntry';
import { SKY_HOSTS } from '../../data/sky/skyHosts';
import { bodyFixedEyeM } from '../camera/surfaceFrame/bodyFixedEyeM';
import { cursorRayBodyLocal } from '../camera/terrain/cursorRayBodyLocal';
import { raycastTerrain } from '../camera/terrain/raycastTerrain';
import { surfacePickToleranceM } from '../camera/terrain/surfacePickToleranceM';
import { skySpotAt } from '../geo/skySpotAt';

export function skyEntryFactsAt(
  pose: BodyFixedPose,
  host: HostBody,
  viewportPx: Readonly<Vec2>,
  frustum: ViewFrustum,
  fovYRad: number,
): SkyEntryFacts {
  if (!SKY_HOSTS.has(host.id)) return NO_SKY_ENTRY;
  const eyeM = bodyFixedEyeM(pose);
  const altitudeM = Math.hypot(...eyeM) - host.groundRadiusAtM(eyeM);
  const centrePx: Vec2 = [viewportPx[0] / 2, viewportPx[1] / 2];
  const hit = raycastTerrain(
    cursorRayBodyLocal(pose, centrePx, viewportPx, frustum),
    host.innerBoundRadiusM,
    host.outerBoundRadiusM,
    host.groundRadiusAtM,
    surfacePickToleranceM(eyeM, host.radiusM, fovYRad, viewportPx[1]),
  );
  return hit === null
    ? { spot: null, pointLocalM: null, altitudeM }
    : { spot: skySpotAt(host.id, hit.pointM), pointLocalM: hit.pointM, altitudeM };
}
