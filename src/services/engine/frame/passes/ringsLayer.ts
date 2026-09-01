/**
 * ringsLayer — the translucent planetary rings (Saturn) as a `'body'`-slab
 * content row, one draw per host body, into the depth-bearing `foreground:0`
 * target (spec §8).
 *
 * ### What it draws — the translucent overlay half of the ring system
 *
 * The frame program expands a `'body'` layer into one render step per body-m
 * slab row (Task 7); `enabled`/`draw` are called once per body-m row, gated on
 * whether `SCENE_RINGS` has an entry for `view.slab.frame.bodyId` whose
 * radial strip is resident. The shared `ringRenderer` draws a two-sided
 * translucent annulus in the host body's equatorial plane, with the planet's
 * shadow cast on the ring. Its twin, the ring-on-planet shadow, is baked into
 * `texturedBodyRenderer`'s fragment (binding 3), so the two halves of
 * Saturn's ring system are drawn by different renderers but share the one
 * authored `SCENE_RINGS` table.
 *
 * ### Why it draws AFTER the opaque foreground bodies, OVER not opaque
 *
 * The ring is one of the translucent members of the `(foreground:0, 'body')`
 * render group (the cloud shell and atmosphere are the others). It is
 * registered AFTER `planets` / `textured-bodies` so it draws once the opaque
 * sphere for this SAME row's body has stamped its depth: the ring pipeline
 * depth-TESTS against the planet (`depthCompare: 'greater'`, the body-m
 * slab's reversed-Z convention) but writes NO depth and blends straight-alpha
 * OVER.
 *
 * ### The ring rides the host body's frame by construction — in TWO different
 * radius units, on purpose
 *
 * `composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, outerRadiusM)` scales
 * the unit ring disc to the ring's OUTER radius — no rotation term, no world
 * translation (the seam already rotated the offset into the body's fixed
 * axes, where the ring plane IS the equatorial plane; see
 * `composeBodySlabMvp`'s module header). `bodySlabCamLocal`, though, is
 * measured at the PLANET's radius, not the ring's outer radius: the fragment's
 * in-front-of-planet view-ray test wants the camera in "planet radii", the
 * frame `texturedBodiesLayer`'s Minnaert term also uses, so the ring keeps its
 * own lit brightness where it occults the disc. This asymmetry is inherited
 * unchanged from the pre-body-slabs layer — it is not a bug to unify.
 *
 * ### The f64 seam — `ctx.bodyPose`, not a re-derived camera basis
 *
 * Same seam as the other body-slab layers: this row's `pose =
 * ctx.bodyPose(bodyId)` is the SAME closure `deriveSlabs` built this row's
 * `view.slab.vp` from. See `composeBodySlabMvp`'s module header.
 *
 * ### When it draws
 *
 * `enabled` gates on the `ringRenderer` handle (null pre-bootstrap), the
 * shared near-field distance gate (`FOREGROUND_MAX_DISTANCE_MPC`), AND this
 * row's `bodyId` having a resident `SCENE_RINGS` entry whose outer diameter
 * clears the shared sub-pixel floor — redundant with the host body-m row's
 * own visibility cull (which floors on the PLANET's raw radius, not the
 * ring's wider footprint) but cheap, and keeps this gate honest if the layer
 * is ever probed standalone. `enabled` and `draw` read ONE `ringDrawForBody`
 * derivation, so the two sites cannot disagree.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { PlanetBody } from '../../../../@types/scene/PlanetBody';
import type { RingSpec } from '../../../../@types/scene/RingSpec';
import type { BodyId } from '../../../../@types/data/body/BodyId';
import type { BodyRelativePose } from '../../../../@types/engine/camera/BodyRelativePose';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { SCENE_RINGS } from '../../../../data/bodies/sceneRings';
import { bodyTextureSlotKey } from '../../../../utils/scene/bodyTextureSlotKey';
import { composeBodySlabMvp } from '../../../../utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../utils/camera/bodySlabCamLocal';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { packRingUniforms } from '../../../../utils/gpu/packRingUniforms';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { SUB_PIXEL_BODY_CULL_PX } from '../subPixelBodyCullPx';
import { sceneBodyStates } from '../sceneBodyStates';

/**
 * This row's ring, if `bodyId` hosts one AND its radial strip is resident AND
 * its outer diameter clears the sub-pixel floor — or `null`. ONE derivation
 * feeds both `enabled` and `draw`, so the gate and the draw can never disagree.
 */
function ringDrawForBody(
  state: EngineState,
  ctx: ReadyFrameContext,
  bodyId: BodyId,
): { readonly ring: RingSpec; readonly body: PlanetBody; readonly pose: BodyRelativePose } | null {
  const ring = SCENE_RINGS.find((r) => r.bodyId === bodyId);
  if (ring === undefined) return null;
  // Resident iff the ring's surface strip slot holds a committed bitmap.
  if (
    state.assetSlots.bodyTextures.get(bodyTextureSlotKey(ring.textureId, 'surface'))?.current() ==
    null
  )
    return null;
  const body = state.data.bodies.planets.find((b) => b.id === bodyId);
  if (body === undefined) return null;
  // The SAME pose-provider closure `deriveSlabs` was fed to build this row's
  // `view.slab.vp` — reading it here instead of re-deriving the pose is what
  // keeps this layer's eyeRelBodyM from ever drifting off that basis.
  const pose = ctx.bodyPose(bodyId);
  if (pose === null) return null;
  // Sub-pixel cull on the ring's outer diameter: below a pixel the annulus
  // cannot resolve. A zero camera-to-centre distance means the camera is
  // inside the body — apparentSizePx defensively returns 0, so treat it as
  // resolved.
  const dM = Math.hypot(pose.eyeRelBodyM[0], pose.eyeRelBodyM[1], pose.eyeRelBodyM[2]);
  if (dM > 0) {
    const outerDiameterKpc =
      (2 * ring.outerRadiusKm * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC;
    const diameterPx = apparentSizePx({
      diameterKpc: outerDiameterKpc,
      distanceMpc: dM * SCALE_UNITS.M_TO_MPC,
      viewportHeightPx: ctx.canvasSize.height,
      fovYRad: ctx.fovYRad,
    });
    if (diameterPx < SUB_PIXEL_BODY_CULL_PX) return null;
  }
  return { ring, body, pose };
}

export const ringsLayer: ContentLayer = {
  name: 'rings',
  slab: 'body',
  target: 'foreground:0',
  blend: 'over',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    // Handle first: the check short-circuits so pre-bootstrap fixtures (null
    // renderer, bare ctx) never touch ctx or the ring inputs.
    if (state.gpu.ringRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    return ringDrawForBody(state, ctx, view.slab.frame.bodyId) !== null;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.ringRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    const drawInputs = ringDrawForBody(state, ctx, view.slab.frame.bodyId);
    if (drawInputs === null) return;
    const { ring, body, pose } = drawInputs;

    // Live position + orientation from the per-frame snapshot — sunDirLocal
    // still reads Mpc/orientation directly; only the mvp/camLocal seam moved
    // to the metre-native body-slab primitives.
    const bodyState = sceneBodyStates(state, ctx).get(body.id)!;

    // Scale the unit ring disc to the ring's OUTER radius, in metres — the
    // body-m slab frame's own unit.
    const outerRadiusM = ring.outerRadiusKm * SCALE_UNITS.KM_TO_M;
    const mvp = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, outerRadiusM);
    // Sun rotated into the host body's local frame, co-framed with the
    // fragment's two-sided Lambert + shadow ray.
    const sun = sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation);
    // Camera in the body's local frame, in PLANET radii (not ring-outer
    // radii) — see the module header's "two different radius units" note.
    const cam = bodySlabCamLocal(pose.eyeRelBodyM, body.radiusM);
    // Ring-shape scalars, both relative to the OUTER radius (the disc's unit
    // radius): the planet's size in disc units, and the hole's inner edge.
    // The ring table is authored in km, the body in metres — hence the
    // conversion inside this otherwise unit-free ratio.
    const planetRadiusRatio = (body.radiusM * SCALE_UNITS.M_TO_KM) / ring.outerRadiusKm;
    const innerRatio = ring.innerRadiusKm / ring.outerRadiusKm;
    // Narrow here, at the GPU uniform write — composeBodySlabMvp returns f64.
    renderer.draw(pass, packRingUniforms(narrowMat4(mvp), sun, planetRadiusRatio, cam, innerRatio));
  },
};
