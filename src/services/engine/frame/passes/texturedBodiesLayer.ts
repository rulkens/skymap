/**
 * texturedBodiesLayer — the `textured` branch of the per-frame body partition
 * (spec §6, §6.4): every non-Earth body whose surface texture is resident,
 * drawn as a lit, surface-mapped sphere in the depth-bearing `foreground:0`
 * target.
 *
 * ### What it draws — the partition's textured branch
 *
 * `sceneBodyPartition` splits the seeded planets into `{ glints, flat, textured }`
 * once per frame; this layer takes the `textured` array (resolved bodies whose
 * `bodyTextures` slot has committed a bitmap) and draws each through the shared
 * `texturedBodyRenderer`. Its sibling `planetsLayer` takes the `flat` array, so
 * a body is textured XOR flat by construction — never both, so the two opaque
 * `foreground:0` layers can never z-fight over the same sphere. A body whose
 * texture has not landed yet is `flat` (the plain lit albedo sphere is the
 * placeholder), and slides to `textured` the frame its bitmap commits.
 *
 * ### The ring ratios are DATA on the uniform, not a Saturn-only code path
 *
 * Each textured body packs two ring radii into `TexturedBodyUniforms`, resolved
 * from `SCENE_RINGS` to planet-radius units (ring radius / body radius). Only
 * Saturn has a row there, so every other body packs `(0, 0)` — and
 * `ringOuterRatio == 0` is the fragment's "no ring" sentinel that short-circuits
 * the ring-on-planet shadow branch. One uniform layout + one pipeline serve
 * ringed and ringless bodies alike; the ring is a per-body datum, not a fork in
 * the draw path (spec §8).
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Same seam as `earthLayer` / `planetsLayer`: these near-field bodies sit
 * AU-to-parsec distances from the render origin — tiny Mpc numbers the VP's
 * large translation nearly cancels. `composeBodyMvp` resolves that cancellation
 * in double precision BEFORE narrowing to f32; feeding it the already-narrowed
 * `view.vp` would misplace a body by more than its radius. See `composeBodyMvp`'s
 * module header.
 *
 * ### When it draws
 *
 * `enabled` gates on the `texturedBodyRenderer` GPU handle (null pre-bootstrap),
 * the shared near-field distance gate (`FOREGROUND_MAX_DISTANCE_MPC` — beyond it
 * every body is a deep-sub-pixel speck, and gating with the NEAR0 siblings lets
 * the executor skip the whole foreground pass group as empty), AND a non-empty
 * `textured` partition branch — a row whose draw loop would issue zero draws must
 * not stay in the pass plan just because the loop is a no-op (the executor still
 * opens the render pass otherwise). `enabled` and `draw` read ONE partition (via
 * `sceneBodyPartition`), so the two sites cannot disagree about which bodies are
 * textured. `draw` re-checks the handle so a stale call is a harmless no-op.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { BodyTextureId } from '../../../../@types/data/BodyTextureId';
import type { PlanetBody } from '../../../../@types/scene/PlanetBody';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { SCENE_RINGS } from '../../../../data/bodies/sceneRings';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { packTexturedBodyUniforms } from '../../../../utils/gpu/packTexturedBodyUniforms';
import { sceneBodyPartition } from '../sceneBodyPartition';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';

/**
 * Resolve a body's ring radii into planet-radius units (ring radius / body
 * radius), or `(0, 0)` when the body has no ring. `ringOuterRatio == 0` is the
 * fragment's "no ring" sentinel; a body outside `SCENE_RINGS` pays nothing and
 * never samples the ring strip. The ratios are unit-free, so the shadow-march
 * maths rides the body's local unit sphere directly.
 */
/** Placeholder body-local camera for the Minnaert view term — zeroed until
 *  Task 4 supplies the real value; `limbStrength == 0` makes it a no-op today. */
const LIMB_CAM_UNUSED: Readonly<Vec3> = [0, 0, 0];

function ringRatios(body: PlanetBody): { inner: number; outer: number } {
  const ring = SCENE_RINGS.find((r) => r.bodyId === body.id);
  if (ring === undefined) return { inner: 0, outer: 0 };
  return { inner: ring.innerRadiusKm / body.radiusKm, outer: ring.outerRadiusKm / body.radiusKm };
}

export const texturedBodiesLayer: ContentLayer = {
  name: 'textured-bodies',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx) {
    // Handle first: the check short-circuits so pre-bootstrap fixtures (null
    // renderer, bare ctx) never touch ctx or the partition inputs.
    if (state.gpu.texturedBodyRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    // A row that would draw zero bodies must leave the pass plan (see header):
    // mirror draw's branch with the SAME partition.
    return sceneBodyPartition(state, ctx).textured.length > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.texturedBodyRenderer;
    if (renderer === null) return;

    // Draw each textured body once. Unlike planetsLayer's single instanced
    // batch, each body owns its own uniform buffer + surface/ring textures on
    // the renderer, so the draws are per-body — the renderer writes THIS body's
    // buffer immediately before its own draw, and no shared uniform can be
    // clobbered mid-frame (see texturedBodyRenderer's header).
    for (const body of sceneBodyPartition(state, ctx).textured) {
      // Compose the MVP from the slab's f64 vp — see the header's "f64 seam"
      // note for why `view.slab.vp` and not `view.vp`.
      const mvp = composeBodyMvp(
        view.slab.vp,
        body.positionMpc,
        RENDER_ORIGIN_MPC,
        body.radiusKm * SCALE_UNITS.KM_TO_MPC,
        body.orientation,
      );
      // Rotate the sun direction into the body's local frame (its baked
      // orientation carries any axial tilt) so the fragment's Lambert term stays
      // a plain co-framed dot product — the same rotate earth/planets do.
      const sun = sunDirLocal(body.positionMpc, RENDER_ORIGIN_MPC, body.orientation);
      const { inner, outer } = ringRatios(body);
      // Minnaert limb-darkening params + the body-local camera are packed as the
      // identity (strength 0, exponent 0, camera at the origin) until Task 4
      // wires the per-body param table and the view-dependent fragment term.
      // `limbStrength == 0` makes the factor a no-op regardless of the other two,
      // so every body renders as plain Lambert here — behaviour-neutral.
      const uniforms = packTexturedBodyUniforms(mvp, sun, inner, outer, 0, 0, LIMB_CAM_UNUSED);
      // The partition only routes bodies with a BODY_TEXTURE_REGISTRY row into
      // `textured`, so the string id IS a BodyTextureId the renderer accepts.
      renderer.draw(pass, body.id as BodyTextureId, uniforms);
    }
  },
};
