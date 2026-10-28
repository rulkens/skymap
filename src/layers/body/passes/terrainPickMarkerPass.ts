/**
 * terrainPickMarkerPass — the `terrain-pick-marker` debug overlay: a fresh terrain pick
 * under the cursor EVERY frame (stateless: no memo, no warm start), drawn as an analytic
 * sphere of the user-set WORLD radius into the body row's `foreground:0` step, where the
 * tiles bury part of it; the buried fraction is the measurement. Nothing runs with the
 * toggle off. A MISS draws nothing: `latchSurfaceGesture`'s datum fallback is camera feel.
 */

import type { BodyFixedPose } from '../../../@types/camera/BodyFixedPose';
import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../@types/BodyRuntime';
import type { Vec3 } from '../../../@types/math/Vec3';
import { frustumFovYRad } from '../../../utils/camera/frustumFovYRad';
import { terrainPickAt } from '../../../utils/camera/terrainPickAt';
import { isSurfaceTileBodyId } from '../subsystems/surfaceTiles/isSurfaceTileBodyId';

export function terrainPickMarkerPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'terrain-pick-marker',

    enabled(state, ctx, view) {
      if (!state.settings.debug.overlays['terrain-pick-marker']) return false;
      if (ctx.snapshot.cursorTexPx === null) return false;
      if (view.slab.frame.kind !== 'body-m') return false;
      if (!isSurfaceTileBodyId(view.slab.frame.hostId)) return false;
      // A non-empty cut signals THIS body is the one the tile stream serves; `heightAt` answers 0 for any other.
      return runtime.surfaceTiles.plan.cut.length > 0;
    },

    draw(pass, view, ctx, state) {
      const cursorTexPx = ctx.snapshot.cursorTexPx;
      if (cursorTexPx === null || view.slab.frame.kind !== 'body-m') return;
      const bodyId = view.slab.frame.hostId;
      // A place hosts no terrain, so the registry guard is what makes the host a body.
      if (!isSurfaceTileBodyId(bodyId)) return;
      const pose = ctx.bodyPose(bodyId);
      if (pose === null) return;

      // The body arm as `cursorRayBodyLocal` reads it, rebuilt from the SAME provider the
      // slab's `vp` came from. Anchored at the body centre, so `eyeRelAnchorM` IS `eyeRelBodyM`.
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
        terrainHeightAt: (b, d) => {
          const tiles = runtime.surfaceTiles;
          return tiles.stream.heightAt(b, d, tiles.plan.params);
        },
      });
      if (pick === null) return;

      const centreRelEyeM: Vec3 = [
        pick.pointM[0] - eyeM[0],
        pick.pointM[1] - eyeM[1],
        pick.pointM[2] - eyeM[2],
      ];
      // Nothing is drawn once the sphere would swallow the eye: the billboard proxy has no
      // plane in front of the eye there (`terrainPickMarker/io.wesl`'s MAX_SIN_THETA).
      const radiusM = state.settings.debug.terrainPickMarkerRadiusM;
      if (!(radiusM > 0) || radiusM >= Math.hypot(...centreRelEyeM)) return;

      const basis = pose.basisM;
      runtime.terrainPickMarkerRenderer.draw(pass, {
        // Eye-relative like `surfaceTile/vertex.wesl`'s projection, so analytic and rasterised depth agree.
        vp: view.vp,
        centreRelEyeM,
        radiusM,
        camRight: [basis[0], basis[1], basis[2]],
        camUp: [basis[3], basis[4], basis[5]],
      });
    },
  };
}
