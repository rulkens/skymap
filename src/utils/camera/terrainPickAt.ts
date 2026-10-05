/**
 * terrainPickAt — the terrain pick under a cursor pixel, for the debug
 * instrument (the marker and its readouts). Same marcher, same tolerance and
 * same shells as `latchSurfaceGesture`, but WITHOUT that call site's
 * datum-sphere fallback: "always answer something" is camera feel, and an
 * instrument that hid a miss would hide the thing it is here to show.
 * Stateless — recomputed from arguments on every call (user ruling 2026-09-17).
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { SurfacePick } from '../../@types/camera/SurfacePick';
import type { TerrainHeightAtLookup } from '../../@types/camera/TerrainHeightAtLookup';
import type { Vec2 } from '../../@types/math/Vec2';
import { SCENE_CELESTIAL_BODIES } from '../../data/bodies/sceneCelestialBodies';
import { innerBoundRadiusM } from '../occlusion/innerBoundRadiusM';
import { outerBoundRadiusM } from '../occlusion/outerBoundRadiusM';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { cursorRayBodyLocal } from './cursorRayBodyLocal';
import { raycastTerrain } from './raycastTerrain';
import { surfacePickToleranceM } from './surfacePickToleranceM';

export function terrainPickAt(input: {
  readonly arm: BodyFixedPose;
  /** Cursor and viewport in ONE pixel space; only their ratio reaches the ray. */
  readonly cursorPx: Readonly<Vec2>;
  readonly viewportPx: Readonly<Vec2>;
  readonly fovYRad: number;
  readonly terrainHeightAt: TerrainHeightAtLookup;
}): SurfacePick | null {
  const { arm, cursorPx, viewportPx, fovYRad, terrainHeightAt } = input;
  const body = SCENE_CELESTIAL_BODIES.find((row) => row.id === arm.bodyId);
  if (body === undefined) return null;

  const datumRadiusM = body.surface.datumRadiusM;
  const eyeM = bodyFixedEyeM(arm);
  return raycastTerrain(
    cursorRayBodyLocal(arm, cursorPx, viewportPx, fovYRad),
    innerBoundRadiusM(body.surface),
    outerBoundRadiusM(body.surface),
    (dir) => datumRadiusM + terrainHeightAt(arm.bodyId, dir),
    surfacePickToleranceM(eyeM, datumRadiusM, fovYRad, viewportPx[1]),
  );
}
