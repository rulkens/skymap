/**
 * planSurfaceCut — the engaged body's surface-tile cut across every view that
 * engages it, and the fetch plan handed to the subsystem; empty when nothing
 * engages. Reads no slab: the body comes from `engagedTileBody`, the cameras
 * from `tileCamerasOf`, the radius and relief from the static body table.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { SurfaceTileSubsystem } from '../../../../@types/engine/subsystems/SurfaceTileSubsystem';
import type { SurfaceTileBodyId } from '../../../../@types/data/SurfaceTileBodyId';
import type { SurfaceCutTile } from '../../../../@types/scene/SurfaceCutTile';
import type { Tier } from '../../../../@types/data/Tier';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';
import { SCENE_CELESTIAL_BODIES } from '../../../../data/bodies/sceneCelestialBodies';
import { findByIdOrThrow } from '../../../../utils/object/findByIdOrThrow';
import { baseLevelForTier } from '../../../../utils/surfaceTiles/baseLevelForTier';
import { cutSurfaceTiles } from '../../../../utils/surfaceTiles/cutSurfaceTiles';
import { engagedTileBody } from './engagedTileBody';
import { tileCamerasOf } from './tileCamerasOf';

// Empty whenever nothing engages (and while `params` or the pose is null), so the
// stored cut, the debug cut count and the terrain-pick marker's enable never
// see a stale cut after a pull-back or a tier swap in flight.
export function planSurfaceCut(
  tiles: SurfaceTileSubsystem,
  views: readonly FrameView[],
  committedTier: (bodyId: SceneBodyId & SurfaceTileBodyId) => Tier,
): readonly SurfaceCutTile[] {
  // The first view that engages a body picks it; its pose stands for the eye.
  const engaged = views.map(engagedTileBody);
  const primary = engaged.findIndex((bodyId) => bodyId !== null);
  const bodyId = engaged[primary];
  if (bodyId === undefined || bodyId === null) return [];
  const pose = views[primary]!.bodyPose(bodyId);
  if (pose === null) return [];
  // The tier off the COMMITTED texture slot, so a swap in flight cannot make
  // the planner believe in detail that is not on the GPU yet.
  const params = tiles.plannerParams(bodyId, baseLevelForTier(bodyId, committedTier(bodyId)));
  if (params === null) return [];

  // Datum, not a bound: tiles displace off the datum sphere, so the camera scale
  // and the radius the cut is planned against must be that same number.
  const { surface } = findByIdOrThrow(SCENE_CELESTIAL_BODIES, bodyId, 'planSurfaceCut');
  // Every view engaging this body, so one cut and one fetch queue cover every
  // view the frame draws it in. One walk yields both the draw cut and the fetch requests.
  const result = cutSurfaceTiles({
    ...params,
    camPosLocalM: pose.eyeRelBodyM,
    views: tileCamerasOf(
      views.filter((_, i) => engaged[i] === bodyId),
      bodyId,
      surface.datumRadiusM,
    ),
    radiusM: surface.datumRadiusM,
    reliefM: surface.reliefM,
    residentSlot: tiles.residentSlot,
  });
  tiles.update({ bodyId, plan: result.requests });
  return result.cut;
}
