/**
 * terrainPickMarkerPass — the `terrain-pick-marker` debug overlay: a fresh
 * terrain pick under the cursor EVERY frame (stateless by ruling 2026-09-17 —
 * no memo, no warm start), drawn as an analytic sphere of the user-set WORLD
 * radius into the body row's own `foreground:0` step, where the tiles bury part
 * of it — the buried fraction is the measurement. Nothing here runs with the
 * toggle off, which is what pays for the per-frame march. A MISS draws nothing:
 * `latchSurfaceGesture`'s datum fallback is camera feel, not truth.
 */

import type { BodyFixedPose } from '../../../../@types/camera/BodyFixedPose';
import type { BodyId } from '../../../../@types/data/body/BodyId';
import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { SurfaceTileSpec } from '../../../../@types/data/SurfaceTileSpec';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { SURFACE_TILE_REGISTRY } from '../../../../data/bodies/surfaceTileRegistry';
import { frustumFovYRad } from '../../../../utils/camera/frustumFovYRad';
import { terrainPickAt } from '../../../../utils/camera/terrainPickAt';
import { terrainHeightAtOf } from '../../../../utils/surfaceTiles/terrainHeightAtOf';

export const terrainPickMarkerPass: ContentPass = {
  name: 'terrain-pick-marker',

  enabled(state, ctx, view) {
    // Handle first, like every sibling in this roster: a null one short-circuits
    // before any other bag is touched.
    if (state.gpu.terrainPickMarkerRenderer === null) return false;
    if (!state.settings.debug.overlays['terrain-pick-marker']) return false;
    if (ctx.snapshot.cursorTexPx === null) return false;
    if (view.slab.frame.kind !== 'body-m') return false;
    // Cast: the registry stays a literal (a row typo is a compile error), which
    // makes it non-indexable by the wider `BodyId` — mirrors `surfaceTilesPass`.
    const registry = SURFACE_TILE_REGISTRY as Partial<Record<BodyId, SurfaceTileSpec>>;
    if (registry[view.slab.frame.hostId] === undefined) return false;
    // A non-empty cut is the closest frame-visible signal that THIS body is the
    // one whose terrain the marcher can read: the tile subsystem serves one
    // engaged body at a time, and `terrainHeightAt` answers 0 for any other.
    const tiles = state.subsystems.surfaceTiles;
    return tiles !== null && tiles !== undefined && tiles.getLastCut().length > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.terrainPickMarkerRenderer;
    const cursorTexPx = ctx.snapshot.cursorTexPx;
    if (renderer === null || cursorTexPx === null || view.slab.frame.kind !== 'body-m') return;
    const bodyId = view.slab.frame.hostId;
    const pose = ctx.bodyPose(bodyId);
    if (pose === null) return;

    // The body arm as `cursorRayBodyLocal` reads it, rebuilt from the SAME
    // provider the slab's `vp` came from (`PassState` refuses the camera
    // runtime). Anchor at the body centre (`bodyRung` ruling S2), so
    // `eyeRelAnchorM` IS `eyeRelBodyM`.
    const eyeM = pose.eyeRelBodyM;
    const arm: BodyFixedPose = {
      bodyId,
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [eyeM[0], eyeM[1], eyeM[2]],
      basisLocal: [...pose.basisM],
    };
    const pick = terrainPickAt({
      arm,
      cursorPx: cursorTexPx,
      viewportPx: view.viewportPx,
      fovYRad: frustumFovYRad(ctx.frustum),
      terrainHeightAt: terrainHeightAtOf(state.subsystems.surfaceTiles),
    });
    if (pick === null) return;

    const centreRelEyeM: Vec3 = [
      pick.pointM[0] - eyeM[0],
      pick.pointM[1] - eyeM[1],
      pick.pointM[2] - eyeM[2],
    ];
    // A WORLD radius the user dials in, not a screen-pixel one: the marker is a
    // gauge of known physical size, and the buried fraction is the measurement.
    // Nothing is drawn once it would swallow the eye — a gauge you are inside
    // reads nothing, and the billboard proxy has no plane in front of the eye
    // there (`terrainPickMarker/io.wesl`'s MAX_SIN_THETA holds the approach).
    const radiusM = state.settings.debug.terrainPickMarkerRadiusM;
    if (!(radiusM > 0) || radiusM >= Math.hypot(...centreRelEyeM)) return;

    const basis = pose.basisM;
    renderer.draw(pass, {
      // The body-m slab's vp is already eye-relative by construction, the same
      // frame `surfaceTile/vertex.wesl` projects through — so the marker's
      // analytic depth and the terrain's rasterised depth are the same number
      // for the same point.
      vp: view.vp,
      centreRelEyeM,
      radiusM,
      camRight: [basis[0], basis[1], basis[2]],
      camUp: [basis[3], basis[4], basis[5]],
    });
  },
};
