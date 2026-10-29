/**
 * planSurfaceTiles — every surface-tile decision for one frame, pure over the
 * stream's read-only residency, as `planOctreeChunks` is for the star octree:
 * the body (`over`, by position), the cut over the views that show it, the
 * engage gate, the touched/requested split, the manifest request, the atlas
 * verdict and the wake vote. The stream applies the result; nothing here
 * writes.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { SurfaceTileOver } from '../../@types/SurfaceTileOver';
import type { SurfaceTileResidency } from '../../@types/SurfaceTileResidency';
import type { SurfaceTilePlan } from '../../@types/SurfaceTilePlan';
import type { SurfaceTileRequest } from '../../@types/SurfaceTileRequest';
import type { SurfaceTileId } from '../../../../@types/data/SurfaceTileId';
import type { SurfaceTileBodyId } from '../../../../@types/data/SurfaceTileBodyId';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';
import type { Tier } from '../../../../@types/data/Tier';
import { IDLE_SURFACE_TILE_PLAN } from './idleSurfaceTilePlan';
import { SCENE_CELESTIAL_BODIES } from '../../../../data/bodies/sceneCelestialBodies';
import { findByIdOrThrow } from '../../../../utils/object/findByIdOrThrow';
import { baseLevelForTier } from '../../../../utils/surfaceTiles/baseLevelForTier';
import { cutSurfaceTiles } from './cutSurfaceTiles';
import { derivePlannerParams } from './derivePlannerParams';
import { tileBodiesInView } from './tileBodiesInView';
import { tileCamerasOf } from './tileCamerasOf';

export function planSurfaceTiles(
  views: readonly FrameView[],
  over: SurfaceTileOver | null,
  residency: SurfaceTileResidency,
  committedTier: (bodyId: SceneBodyId & SurfaceTileBodyId) => Tier,
): SurfaceTilePlan {
  const engaged = residency.engagedBodyId();
  const inFlight = residency.inFlightCount() > 0;
  // Out of every body's reach, or over a body other than the engaged one: the
  // atlases hold tiles nothing will draw again soon.
  const stale = engaged !== null && engaged !== over?.bodyId;
  if (over === null) {
    return { ...IDLE_SURFACE_TILE_PLAN, verdict: stale ? 'release' : 'keep', awake: inFlight };
  }

  const { bodyId, camPosLocalM } = over;
  const manifest = residency.manifest(bodyId);
  // The COMMITTED tier, so a texture swap in flight cannot make the planner
  // believe in base detail that is not on the GPU yet.
  const params =
    manifest.value === null
      ? null
      : derivePlannerParams(manifest.value, baseLevelForTier(bodyId, committedTier(bodyId)));
  const shown = views.filter((view) => tileBodiesInView(view).includes(bodyId));
  const wantManifest = shown.length > 0 && manifest.status === 'absent' ? bodyId : null;
  const awake = wantManifest !== null || manifest.status === 'pending' || inFlight;
  const unplanned = { ...IDLE_SURFACE_TILE_PLAN, wantManifest, params, awake };
  if (params === null || shown.length === 0) {
    return { ...unplanned, verdict: stale ? 'release' : 'keep' };
  }

  // Another body's atlas answers nothing for this one: its tiles would draw
  // under this body's ids, and its failures would block this body's fetches.
  const own = engaged === bodyId;
  const residentSlot = own ? residency.residentSlot : () => null;
  // Datum, not a bound: tiles displace off the datum sphere, so the camera
  // scale and the radius the cut is planned against must be that same number.
  const { surface } = findByIdOrThrow(SCENE_CELESTIAL_BODIES, bodyId, 'planSurfaceTiles');
  const { cut, requests: demand } = cutSurfaceTiles({
    ...params,
    camPosLocalM,
    views: tileCamerasOf(shown, bodyId, surface.datumRadiusM),
    radiusM: surface.datumRadiusM,
    reliefM: surface.reliefM,
    residentSlot,
  });
  // Both sides of engagement live here: a drive-site `if` once left stale
  // tiles drawing after the camera pulled back out.
  if (!(demand.zWin > params.baseLevel)) {
    return { ...unplanned, verdict: stale ? 'release' : 'keep' };
  }

  const touched: SurfaceTileId[] = [];
  const requests: SurfaceTileRequest[] = [];
  let misses = 0;
  for (const request of demand.requests) {
    const { tile } = request;
    const landed = residentSlot(tile) !== null;
    if (!landed) misses++;
    // Before touching: a touched failed tile keeps its LRU stamp fresh forever,
    // pinning a slot on a tile with no pixels.
    if (own && residency.hasFailed(tile)) continue;
    if (landed || (own && residency.isInFlight(tile))) touched.push(tile);
    else requests.push(request);
  }
  return {
    cut,
    touched,
    requests,
    wantManifest,
    verdict: own ? 'keep' : { engage: bodyId, tilePx: params.tilePx },
    lastPlan: { requestCount: demand.requests.length, zWin: demand.zWin, misses },
    params,
    // This plan's own requests count: `inFlight` was read before they existed,
    // so the engaging frame would otherwise vote asleep.
    awake: awake || requests.length > 0,
  };
}
