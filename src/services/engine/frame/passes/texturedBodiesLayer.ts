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
 * ### The ring ratios + limb params are DATA on the uniform, not code paths
 *
 * Each textured body packs two ring radii into `TexturedBodyUniforms`, resolved
 * from `SCENE_RINGS` to planet-radius units (ring radius / body radius). Only
 * Saturn has a row there, so every other body packs `(0, 0)` — and
 * `ringOuterRatio == 0` is the fragment's "no ring" sentinel that short-circuits
 * the ring-on-planet shadow branch. One uniform layout + one pipeline serve
 * ringed and ringless bodies alike; the ring is a per-body datum, not a fork in
 * the draw path (spec §8).
 *
 * The Minnaert limb-darkening params ride the same data-gate: `limbParams` reads
 * `LIMB_DARKENING_PARAMS` (the giants + Venus) and falls back to
 * `{ strength: 0, exponent: 1 }` — identity — for every absent body, so
 * `limbStrength == 0` makes the fragment's limb term a no-op (spec §6.3). The
 * limb's view cosine needs the camera in the body's local frame, so each body
 * also packs `camPosLocal` derived through the shared `camPosLocal` util at the
 * body's SURFACE radius (`radiusM * M_TO_MPC` — the fragment's unit sphere, the
 * SAME inputs `composeBodyMvp` consumes; NOT an atmosphere-top scale). A body
 * absent from the limb table still packs a real `camPosLocal`, but with
 * `strength 0` it is never read — cheap and behaviour-neutral.
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
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { SCENE_RINGS } from '../../../../data/bodies/sceneRings';
import { LIMB_DARKENING_PARAMS } from '../../../../data/bodies/limbDarkeningParams';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { camPosLocal } from '../../../../utils/camera/camPosLocal';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { packTexturedBodyUniforms } from '../../../../utils/gpu/packTexturedBodyUniforms';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { sceneBodyPartition } from '../sceneBodyPartition';
import { sceneBodyStates } from '../sceneBodyStates';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';

/**
 * Resolve a body's ring radii into planet-radius units (ring radius / body
 * radius), or `(0, 0)` when the body has no ring. `ringOuterRatio == 0` is the
 * fragment's "no ring" sentinel; a body outside `SCENE_RINGS` pays nothing and
 * never samples the ring strip. The ratios are unit-free, so the shadow-march
 * maths rides the body's local unit sphere directly.
 */
function ringRatios(body: PlanetBody): { inner: number; outer: number } {
  const ring = SCENE_RINGS.find((r) => r.bodyId === body.id);
  if (ring === undefined) return { inner: 0, outer: 0 };
  // The ring table is authored in km, the body in metres.
  const bodyRadiusKm = body.radiusM * SCALE_UNITS.M_TO_KM;
  return { inner: ring.innerRadiusKm / bodyRadiusKm, outer: ring.outerRadiusKm / bodyRadiusKm };
}

/**
 * Resolve a body's Minnaert limb-darkening params from `LIMB_DARKENING_PARAMS`,
 * or `{ strength: 0, exponent: 1 }` — the shader identity — when the body has no
 * row. Sibling of `ringRatios`: the same data-gate the ring branch uses, so a
 * body absent from the table renders as plain Lambert (`limbStrength == 0` makes
 * the fragment's limb factor a no-op).
 */
function limbParams(body: PlanetBody): { strength: number; exponent: number } {
  return LIMB_DARKENING_PARAMS[body.id] ?? { strength: 0, exponent: 1 };
}

export const texturedBodiesLayer: ContentLayer = {
  name: 'textured-bodies',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx, _view) {
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

    // Live position + orientation from the per-frame snapshot (keyed by id),
    // resolved ONCE for the whole draw loop — not the baked record fields.
    const states = sceneBodyStates(state, ctx);

    // Draw each textured body once. Unlike planetsLayer's single instanced
    // batch, each body owns its own uniform buffer + surface/ring textures on
    // the renderer, so the draws are per-body — the renderer writes THIS body's
    // buffer immediately before its own draw, and no shared uniform can be
    // clobbered mid-frame (see texturedBodyRenderer's header).
    for (const body of sceneBodyPartition(state, ctx).textured) {
      const bodyState = states.get(body.id)!;
      // Compose the MVP from the slab's f64 vp — see the header's "f64 seam"
      // note for why `view.slab.vp` and not `view.vp`.
      const mvp = composeBodyMvp(
        view.slab.vp,
        bodyState.positionMpc,
        RENDER_ORIGIN_MPC,
        body.radiusM * SCALE_UNITS.M_TO_MPC,
        bodyState.orientation,
      );
      // Rotate the sun direction into the body's local frame (its orientation
      // carries any axial tilt) so the fragment's Lambert term stays a plain
      // co-framed dot product — the same rotate earth/planets do.
      const sun = sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation);
      const { inner, outer } = ringRatios(body);
      // Minnaert limb-darkening: the per-body strength/exponent (identity for a
      // body absent from `LIMB_DARKENING_PARAMS`), plus the camera in the body's
      // local frame the fragment's view cosine needs. `camPosLocal` takes the
      // body's SURFACE radius — the same `radiusM × M_TO_MPC` scale
      // `composeBodyMvp` uses above, so the local camera matches the unit sphere
      // the fragment shades (NOT an atmosphere-top scale).
      const { strength, exponent } = limbParams(body);
      const cam = camPosLocal(
        view.camPos,
        bodyState.positionMpc,
        body.radiusM * SCALE_UNITS.M_TO_MPC,
        bodyState.orientation,
      );
      // Narrow here, at the GPU uniform write — composeBodyMvp returns f64.
      const uniforms = packTexturedBodyUniforms(
        narrowMat4(mvp),
        sun,
        inner,
        outer,
        strength,
        exponent,
        cam,
      );
      // The partition only routes bodies with a BODY_TEXTURE_REGISTRY row into
      // `textured`, so the string id IS a BodyTextureId the renderer accepts.
      renderer.draw(pass, body.id as BodyTextureId, uniforms);
    }
  },
};
