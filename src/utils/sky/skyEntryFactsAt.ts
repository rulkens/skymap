/**
 * skyEntryFactsAt — the view-centre ground hit on the eye's terrain host: the same marcher,
 * tolerance and relief shells as the body arm's zoom pick, without its datum fallback (a miss
 * offers no entry). Above `SKY_ENTRY_MAX_ALT_M` no ray is cast: nothing reads the spot there,
 * and this runs every frame.
 */
import type { BodyFixedPose } from '../../@types/camera/pose/BodyFixedPose';
import type { SkyEntryFacts } from '../../@types/engine/SkyEntryFacts';
import type { GroundRadiusLookup } from '../../@types/camera/terrain/GroundRadiusLookup';
import type { TerrainHeightAtLookup } from '../../@types/camera/terrain/TerrainHeightAtLookup';
import type { ViewFrustum } from '../../@types/camera/projection/ViewFrustum';
import type { Vec2 } from '../../@types/math/Vec2';
import { SCENE_CELESTIAL_BODIES } from '../../data/bodies/sceneCelestialBodies';
import { SKY_ENTRY_MAX_ALT_M } from '../../data/sky/skyEntryMaxAltM';
import { SKY_HOSTS } from '../../data/sky/skyHosts';
import { bodyFixedEyeM } from '../camera/surfaceFrame/bodyFixedEyeM';
import { cursorRayBodyLocal } from '../camera/terrain/cursorRayBodyLocal';
import { raycastTerrain } from '../camera/terrain/raycastTerrain';
import { surfacePickToleranceM } from '../camera/terrain/surfacePickToleranceM';
import { innerBoundRadiusM } from '../occlusion/innerBoundRadiusM';
import { outerBoundRadiusM } from '../occlusion/outerBoundRadiusM';
import { bodyGroundRadiusAtM } from '../scene/bodyGroundRadiusAtM';
import { skySpotAt } from '../geo/skySpotAt';

export function skyEntryFactsAt(
  pose: BodyFixedPose,
  viewportPx: Readonly<Vec2>,
  frustum: ViewFrustum,
  fovYRad: number,
  terrainHeightAt: TerrainHeightAtLookup,
): SkyEntryFacts {
  const body = SKY_HOSTS.has(pose.bodyId)
    ? SCENE_CELESTIAL_BODIES.find((row) => row.id === pose.bodyId)
    : undefined;
  if (body === undefined) return { spot: null, pointLocalM: null, altitudeM: Infinity };
  const groundRadiusAtM: GroundRadiusLookup = (dir) =>
    bodyGroundRadiusAtM(body, terrainHeightAt(body.id, dir));
  const eyeM = bodyFixedEyeM(pose);
  const altitudeM = Math.hypot(...eyeM) - groundRadiusAtM(eyeM);
  if (altitudeM >= SKY_ENTRY_MAX_ALT_M) return { spot: null, pointLocalM: null, altitudeM };
  const centrePx: Vec2 = [viewportPx[0] / 2, viewportPx[1] / 2];
  const hit = raycastTerrain(
    cursorRayBodyLocal(pose, centrePx, viewportPx, frustum),
    innerBoundRadiusM(body.surface),
    outerBoundRadiusM(body.surface),
    groundRadiusAtM,
    surfacePickToleranceM(eyeM, body.surface.datumRadiusM, fovYRad, viewportPx[1]),
  );
  return hit === null
    ? { spot: null, pointLocalM: null, altitudeM }
    : { spot: skySpotAt(body.id, hit.pointM), pointLocalM: hit.pointM, altitudeM };
}
