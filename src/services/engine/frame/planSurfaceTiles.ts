/**
 * planSurfaceTiles — the surface-tile planner over the rig's views: pick the
 * engaged tiling body, gate and plan against the first view that holds it, cut
 * across every view that does. Takes the subsystem as a parameter, never off
 * `state`, so a Layer can register it closed over its own runtime.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { PlannerResult } from '../../../@types/engine/frame/PlannerResult';
import type { TilingSlab } from '../../../@types/engine/frame/TilingSlab';
import type { SurfaceTileSubsystem } from '../../../@types/engine/subsystems/SurfaceTileSubsystem';
import type { SurfaceCutTile } from '../../../@types/scene/SurfaceCutTile';
import type { Vec2 } from '../../../@types/math/Vec2';
import { SURFACE_TILE_REGISTRY } from '../../../data/bodies/surfaceTileRegistry';
import { bodySurfaceTier } from '../../../utils/bodyTextures/bodySurfaceTier';
import { baseLevelForTier } from '../../../utils/surfaceTiles/baseLevelForTier';
import { surfaceTilesEngaged } from '../../../utils/surfaceTiles/surfaceTilesEngaged';
import { cutSurfaceTiles } from '../../../utils/surfaceTiles/cutSurfaceTiles';
import { prepareBodySurfaceFrame } from './prepareBodySurfaceFrame';
import { pastTextureReleaseRadius } from './pastTextureReleaseRadius';
import { sceneBodyStates } from './sceneBodyStates';
import { slabViewOf } from './slabs';

export function planSurfaceTiles(
  tiles: SurfaceTileSubsystem,
  views: readonly FrameView[],
  state: PassState,
): PlannerResult<readonly SurfaceCutTile[]> {
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

  // Empty on a disengaged frame so the stored cut never outlives the engagement.
  let cut: readonly SurfaceCutTile[] = [];
  if (primary !== undefined && primarySlab !== undefined) {
    const bodyId = primarySlab.frame.hostId;
    // The same slab view `earthPass.draw` samples into.
    const primarySlabView = slabViewOf(primary, primarySlab.index);
    if (surfaceTilesEngaged(state, primary, primarySlabView)) {
      // The tier off the COMMITTED texture slot, so a swap in flight cannot make
      // the planner believe in detail that is not on the GPU yet.
      const baseLevel = baseLevelForTier(bodyId, bodySurfaceTier(state, bodyId));
      const params = tiles.plannerParams(bodyId, baseLevel);
      // `cut` stays empty while `params`/`prepared` are null so a tier swap in
      // flight draws nothing stale rather than last frame's cut.
      if (params !== null) {
        const prepared = prepareBodySurfaceFrame(state, primary, primarySlabView);
        if (prepared !== null) {
          // Each view's own body slab vp AND viewport (mono: the primary's, the
          // memo hit above), so one cut and one fetch queue cover every view
          // the frame draws — an XR eye sized differently than the main view
          // scales its own NDC against its own target, not a shared one.
          const rigViews: { viewProjLocal: Float64Array; viewportPx: Readonly<Vec2> }[] = [];
          for (const view of views) {
            const slab = view.slabs.find(
              (s) => s.frame.kind === 'body-m' && s.frame.hostId === bodyId,
            );
            if (slab === undefined) continue;
            const viewSlabView = slabViewOf(view, slab.index);
            const viewPrepared = prepareBodySurfaceFrame(state, view, viewSlabView);
            if (viewPrepared !== null)
              rigViews.push({
                viewProjLocal: viewPrepared.mvpLocal,
                viewportPx: viewSlabView.viewportPx,
              });
          }
          // One walk yields both the draw cut and the fetch requests.
          const result = cutSurfaceTiles({
            ...params,
            camPosLocalM: prepared.pose.eyeRelBodyM,
            views: rigViews,
            radiusM: prepared.radiusM,
            reliefM: prepared.body.surface.reliefM,
            residentSlot: tiles.residentSlot,
          });
          cut = result.cut;
          tiles.update({ bodyId, plan: result.requests });
        }
      }
    }
  }

  // A pull-back keeps the tile atlases (~324 MB) for a quick re-engage; past twice
  // the body's texture load radius its globe map unloads too, and so do they.
  const engagedTileBody = tiles.engagedBodyId();
  if (engagedTileBody !== null) {
    const poseView = primary ?? views[0];
    const body = poseView && sceneBodyStates(state, poseView).get(engagedTileBody);
    if (
      poseView !== undefined &&
      body !== undefined &&
      pastTextureReleaseRadius(engagedTileBody, poseView.drawCamPos, body.positionMpc)
    ) {
      tiles.release();
    }
  }

  // Outside the gate: `isAnimating()` is true while the manifest is in flight,
  // before the layer can engage — voting only on engaged frames would sleep
  // the loop mid-fetch.
  return { value: cut, awake: tiles.isAnimating(), settling: false };
}
