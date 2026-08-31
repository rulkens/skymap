/**
 * ringsLayer — the translucent planetary rings (Saturn) as a content-layer row
 * drawing into the depth-bearing `foreground:0` target (spec §8).
 *
 * ### What it draws — the translucent overlay half of the ring system
 *
 * For each `SCENE_RINGS` entry whose radial strip is resident, this layer draws
 * the ring itself through the shared `ringRenderer`: a two-sided translucent
 * annulus in the host body's equatorial plane, with the planet's shadow cast on
 * the ring. Its twin, the ring-on-planet shadow, is baked into
 * `texturedBodyRenderer`'s fragment (binding 3), so the two halves of Saturn's
 * ring system are drawn by different renderers but share the one authored
 * `SCENE_RINGS` table.
 *
 * ### Why it draws AFTER the opaque foreground bodies, OVER not opaque
 *
 * The ring is one of the translucent members of the `(foreground:0, NEAR0)`
 * render group (the cloud shell is another). It is registered AFTER `earth` /
 * `star-spheres` / `planets` / `textured-bodies` so it draws once those opaque
 * spheres have stamped their depth: the ring pipeline depth-TESTS against the
 * planet (`depthCompare: 'greater'`, the NEAR0 slab's reversed-Z convention —
 * clear `0.0`, greater-z-wins, so a nearer body stamps a LARGER depth) so the far
 * half is correctly occluded, but writes NO depth (`depthWriteEnabled: false`) and
 * blends straight-alpha OVER.
 * Translucent rows in this group carry `blend: 'over'` where the opaque bodies
 * carry `'opaque'`, and each such pipeline bakes exactly that profile
 * (`foreground:0` formats, depth read / no write, over blend).
 *
 * ### The ring rides the host body's frame by construction
 *
 * `composeBodyMvp(view.slab.vp, bodyState.positionMpc, RENDER_ORIGIN_MPC,
 * outerRadiusMpc, bodyState.orientation)` scales the unit ring disc to the ring's
 * OUTER radius and folds in the host body's orientation (from the per-frame
 * body-state snapshot), so the annulus lands in the planet's equatorial plane at
 * the right world size — no ring-specific transform. The sun is rotated into the
 * same local frame, and the
 * two ring-shape scalars (`planetRadiusRatio`, `innerRatio`) are resolved from
 * the authored km radii; `packRingUniforms` is the layout SSOT.
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Same seam as the sphere-body layers: the ring sits AU-to-parsec distances from
 * the render origin, tiny Mpc numbers the VP's large translation nearly cancels.
 * `composeBodyMvp` resolves that in double precision before narrowing to f32;
 * feeding it the already-narrowed `view.vp` would misplace the ring by more than
 * its width. See `composeBodyMvp`'s module header.
 *
 * ### When it draws
 *
 * `enabled` gates on the `ringRenderer` handle (null pre-bootstrap), the shared
 * near-field distance gate (`FOREGROUND_MAX_DISTANCE_MPC`), AND a non-empty set
 * of drawable rings — a ring whose strip has not committed or whose host body is
 * sub-pixel is dropped, so a row that would issue zero draws leaves the pass
 * plan. `enabled` and `draw` read ONE `drawableRings` derivation, so the two
 * sites cannot disagree.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { PlanetBody } from '../../../../@types/scene/PlanetBody';
import type { BodyState } from '../../../../@types/scene/BodyState';
import type { RingSpec } from '../../../../@types/scene/RingSpec';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { SCENE_RINGS } from '../../../../data/bodies/sceneRings';
import { bodyTextureSlotKey } from '../../../../utils/scene/bodyTextureSlotKey';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { camPosLocal } from '../../../../utils/camera/camPosLocal';
import { packRingUniforms } from '../../../../utils/gpu/packRingUniforms';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { SUB_PIXEL_BODY_CULL_PX } from '../subPixelBodyCullPx';
import { sceneBodyStates } from '../sceneBodyStates';

/**
 * The rings worth drawing this frame: each `SCENE_RINGS` entry whose radial
 * strip is resident AND whose host body resolves to at least a pixel across (the
 * ring's OUTER diameter). ONE derivation feeds both `enabled` and `draw`, so the
 * gate and the loop can never disagree about which rings render.
 */
function drawableRings(
  state: EngineState,
  ctx: ReadyFrameContext,
): ReadonlyArray<{ ring: RingSpec; body: PlanetBody; bodyState: BodyState }> {
  // Live position + orientation from the per-frame snapshot (keyed by id),
  // resolved ONCE for the whole scan — not the baked record fields.
  const states = sceneBodyStates(state, ctx);
  const out: Array<{ ring: RingSpec; body: PlanetBody; bodyState: BodyState }> = [];
  for (const ring of SCENE_RINGS) {
    // Resident iff the ring's surface strip slot holds a committed bitmap.
    if (
      state.assetSlots.bodyTextures.get(bodyTextureSlotKey(ring.textureId, 'surface'))?.current() ==
      null
    )
      continue;
    const body = state.data.bodies.planets.find((b) => b.id === ring.bodyId);
    if (body === undefined) continue;
    const bodyState = states.get(body.id)!;
    // Sub-pixel cull on the ring's outer diameter: below a pixel the annulus
    // cannot resolve. A zero camera-to-centre distance means the camera is inside
    // the body — apparentSizePx defensively returns 0, so treat it as resolved.
    const dx = bodyState.positionMpc[0] - ctx.drawCamPos[0];
    const dy = bodyState.positionMpc[1] - ctx.drawCamPos[1];
    const dz = bodyState.positionMpc[2] - ctx.drawCamPos[2];
    const distanceMpc = Math.hypot(dx, dy, dz);
    if (distanceMpc > 0) {
      const outerDiameterKpc =
        (2 * ring.outerRadiusKm * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC;
      const diameterPx = apparentSizePx({
        diameterKpc: outerDiameterKpc,
        distanceMpc,
        viewportHeightPx: ctx.canvasSize.height,
        fovYRad: ctx.fovYRad,
      });
      if (diameterPx < SUB_PIXEL_BODY_CULL_PX) continue;
    }
    out.push({ ring, body, bodyState });
  }
  return out;
}

export const ringsLayer: ContentLayer = {
  name: 'rings',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'over',

  enabled(state, ctx, _view) {
    // Handle first: the check short-circuits so pre-bootstrap fixtures (null
    // renderer, bare ctx) never touch ctx or the ring inputs.
    if (state.gpu.ringRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    // A row that would draw zero rings must leave the pass plan: mirror draw's
    // branch with the SAME derivation.
    return drawableRings(state, ctx).length > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.ringRenderer;
    if (renderer === null) return;

    for (const { ring, body, bodyState } of drawableRings(state, ctx)) {
      // Scale the unit ring disc to the ring's OUTER radius and fold in the host
      // body's orientation, from the slab's f64 vp (the f64 seam). The annulus
      // then lands in the planet's equatorial plane at the right size.
      const outerRadiusMpc = ring.outerRadiusKm * SCALE_UNITS.KM_TO_MPC;
      const mvp = composeBodyMvp(
        view.slab.vp,
        bodyState.positionMpc,
        RENDER_ORIGIN_MPC,
        outerRadiusMpc,
        bodyState.orientation,
      );
      // Sun rotated into the host body's local frame (its orientation carries any
      // axial tilt), so the fragment's two-sided Lambert + shadow ray stay
      // co-framed.
      const sun = sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation);
      // Camera in the body's local frame, in planet radii (planet = unit sphere)
      // — the frame the fragment's in-front-of-planet view-ray test runs in, so
      // the ring keeps its own lit brightness where it occults the disc.
      const radiusMpc = body.radiusM * SCALE_UNITS.M_TO_MPC;
      const cam = camPosLocal(
        ctx.drawCamPos,
        bodyState.positionMpc,
        radiusMpc,
        bodyState.orientation,
      );
      // Ring-shape scalars, both relative to the OUTER radius (the disc's unit
      // radius): the planet's size in disc units, and the hole's inner edge.
      // The ring table is authored in km, the body in metres — hence the
      // conversion inside this otherwise unit-free ratio.
      const planetRadiusRatio = (body.radiusM * SCALE_UNITS.M_TO_KM) / ring.outerRadiusKm;
      const innerRatio = ring.innerRadiusKm / ring.outerRadiusKm;
      // Narrow here, at the GPU uniform write — composeBodyMvp returns f64.
      renderer.draw(
        pass,
        packRingUniforms(narrowMat4(mvp), sun, planetRadiusRatio, cam, innerRatio),
      );
    }
  },
};
