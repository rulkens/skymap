/**
 * ringsPass: the translucent planetary rings (Saturn) as a `'body'`-slab content
 * row, one draw per host body, into `foreground:0`. Gated on `SCENE_RINGS` having an
 * entry for `view.slab.frame.hostId` whose radial strip is resident and whose outer
 * diameter clears the sub-pixel floor; `enabled` and `draw` share ONE
 * `ringDrawForBody` derivation. Registered AFTER `planets` / `textured-bodies`: it
 * depth-TESTS against the planet (reversed-Z `greater`), writes no depth, blends
 * straight-alpha OVER. The ring-on-planet shadow is baked into
 * `texturedBodyRenderer`'s fragment (binding 3) from the same `SCENE_RINGS` table.
 *
 * Two radius units, on purpose: `composeBodySlabMvp` scales the unit disc to the
 * ring's OUTER radius, but `bodySlabCamLocal` is measured in PLANET radii, the frame
 * the fragment's in-front-of-planet view-ray test and `texturedBodiesPass`'s
 * Minnaert term use. Not a bug to unify.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../@types/BodyRuntime';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PlanetBody } from '../../../@types/scene/PlanetBody';
import type { RingSpec } from '../../../@types/scene/RingSpec';
import type { BodyRelativePose } from '../../../@types/engine/camera/BodyRelativePose';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SCENE_RINGS } from '../../../data/bodies/sceneRings';
import { bodyTextureSlotKey } from '../load/bodyTextureSlotKey';
import { composeBodySlabMvp } from '../../../utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../utils/camera/bodySlabCamLocal';
import { sunDirLocal } from '../../../utils/camera/sunDirLocal';
import { packRingUniforms } from '../render/packRingUniforms';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { SUB_PIXEL_BODY_CULL_PX } from '../../../services/engine/frame/subPixelBodyCullPx';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import type { PositionedId } from '../../../@types/scene/PositionedId';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';

/** This row's ring if `bodyId` hosts one with a resident strip clearing the sub-pixel floor, else `null`. */
function ringDrawForBody(
  ctx: FrameView,
  bodyId: PositionedId,
  runtime: BodyRuntime,
): { readonly ring: RingSpec; readonly body: PlanetBody; readonly pose: BodyRelativePose } | null {
  const ring = SCENE_RINGS.find((r) => r.bodyId === bodyId);
  if (ring === undefined) return null;
  if (runtime.textureSlots.get(bodyTextureSlotKey(ring.textureId, 'surface'))?.current() == null)
    return null;
  const body = SCENE_PLANETS.find((b) => b.id === bodyId);
  if (body === undefined) return null;
  // The closure `deriveSlabs` built `view.slab.vp` from.
  const pose = ctx.bodyPose(bodyId);
  if (pose === null) return null;
  // Zero distance means the camera is inside the body (apparentSizePx returns 0): treat as resolved.
  const dM = Math.hypot(pose.eyeRelBodyM[0], pose.eyeRelBodyM[1], pose.eyeRelBodyM[2]);
  if (dM > 0) {
    const outerDiameterKpc =
      (2 * ring.outerRadiusKm * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC;
    const diameterPx = apparentSizePx({
      diameterKpc: outerDiameterKpc,
      distanceMpc: dM * SCALE_UNITS.M_TO_MPC,
      pxPerRad: ctx.drawPxPerRad,
    });
    if (diameterPx < SUB_PIXEL_BODY_CULL_PX) return null;
  }
  return { ring, body, pose };
}

export function ringsPass(runtime: BodyRuntime): ContentPass {
  return {
    name: 'rings',

    enabled(state, ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      return ringDrawForBody(ctx, view.slab.frame.hostId, runtime) !== null;
    },

    draw(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const drawInputs = ringDrawForBody(ctx, view.slab.frame.hostId, runtime);
      if (drawInputs === null) return;
      const { ring, body, pose } = drawInputs;

      const bodyState = sceneBodyStates(state, ctx).get(body.id)!;

      const outerRadiusM = ring.outerRadiusKm * SCALE_UNITS.KM_TO_M;
      const mvp = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, outerRadiusM);
      const sun = sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation);
      // PLANET radii, not ring-outer radii (see the module header).
      const cam = bodySlabCamLocal(pose.eyeRelBodyM, body.surface.datumRadiusM);
      // Both relative to the OUTER radius. The ring table is in km, the body in metres.
      const planetRadiusRatio =
        (body.surface.datumRadiusM * SCALE_UNITS.M_TO_KM) / ring.outerRadiusKm;
      const innerRatio = ring.innerRadiusKm / ring.outerRadiusKm;
      // Narrow here, at the GPU uniform write — composeBodySlabMvp returns f64.
      runtime.ringRenderer.draw(
        pass,
        packRingUniforms(narrowMat4(mvp), sun, planetRadiusRatio, cam, innerRatio),
      );
    },
  };
}
