/**
 * planSurfaceCut — the engaged body's surface-tile cut across every view, and
 * the fetch plan handed to the subsystem; empty when nothing engages.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { SurfaceTileSubsystem } from '../../../@types/engine/subsystems/SurfaceTileSubsystem';
import type { TilingSlab } from '../../../@types/engine/frame/TilingSlab';
import type { SurfaceCutTile } from '../../../@types/scene/SurfaceCutTile';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../data/rendering/foregroundMaxDistance';
import { SURFACE_TILE_REGISTRY } from '../../../data/bodies/surfaceTileRegistry';
import { bodySurfaceTier } from '../../../utils/bodyTextures/bodySurfaceTier';
import { baseLevelForTier } from '../../../utils/surfaceTiles/baseLevelForTier';
import { cutSurfaceTiles } from '../../../utils/surfaceTiles/cutSurfaceTiles';
import { prepareBodySurfaceFrame } from './prepareBodySurfaceFrame';
import { slabViewOf } from './slabs';

// Empty whenever nothing engages (and while `params`/`prepared` are null), so the
// stored cut, the debug cut count and the terrain-pick marker's enable never
// see a stale cut after a pull-back or a tier swap in flight.
export function planSurfaceCut(
  tiles: SurfaceTileSubsystem,
  views: readonly FrameView[],
  state: PassState,
): readonly SurfaceCutTile[] {
  // The ENGAGED body is the first registry host with a slab row in any view (no
  // row = already culled; registry membership is the "this body tiles"
  // predicate, never a literal bodyId), so tiles and layer never disagree about
  // whether that body is on screen. A slab exists only for a body
  // `sceneBodyPartition` actually iterated, so its presence implies the body is seeded.
  let primary: FrameView | undefined;
  let primarySlab: TilingSlab | undefined;
  for (const view of views) {
    const slab = view.slabs.find(
      (s): s is TilingSlab => s.frame.kind === 'body-m' && s.frame.hostId in SURFACE_TILE_REGISTRY,
    );
    if (slab !== undefined) {
      primary = view;
      primarySlab = slab;
      break;
    }
  }
  if (primary === undefined || primarySlab === undefined) return [];
  if (primary.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return [];

  const bodyId = primarySlab.frame.hostId;
  // The same slab view `earthPass.draw` samples into. Never gated on
  // `earthRenderer`: a registry body with no base-globe renderer still tiles.
  const primarySlabView = slabViewOf(primary, primarySlab.index);
  const prepared = prepareBodySurfaceFrame(state, primary, primarySlabView);
  if (prepared === null) return [];

  // The tier off the COMMITTED texture slot, so a swap in flight cannot make
  // the planner believe in detail that is not on the GPU yet.
  const baseLevel = baseLevelForTier(bodyId, bodySurfaceTier(state, bodyId));
  const params = tiles.plannerParams(bodyId, baseLevel);
  if (params === null) return [];

  // Each view's own body slab vp AND viewport (mono: the primary's, the memo
  // hit above), so one cut and one fetch queue cover every view the frame
  // draws — an XR eye sized differently than the main view scales its own NDC
  // against its own target, not a shared one.
  const rigViews = views.flatMap((view) => {
    const slab = view.slabs.find((s) => s.frame.kind === 'body-m' && s.frame.hostId === bodyId);
    if (slab === undefined) return [];
    const viewSlabView = slabViewOf(view, slab.index);
    const viewPrepared = prepareBodySurfaceFrame(state, view, viewSlabView);
    return viewPrepared === null
      ? []
      : [{ viewProjLocal: viewPrepared.mvpLocal, viewportPx: viewSlabView.viewportPx }];
  });
  // One walk yields both the draw cut and the fetch requests.
  const result = cutSurfaceTiles({
    ...params,
    camPosLocalM: prepared.pose.eyeRelBodyM,
    views: rigViews,
    radiusM: prepared.radiusM,
    reliefM: prepared.body.surface.reliefM,
    residentSlot: tiles.residentSlot,
  });
  tiles.update({ bodyId, plan: result.requests });
  return result.cut;
}
