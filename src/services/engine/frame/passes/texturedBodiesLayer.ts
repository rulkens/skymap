/**
 * texturedBodiesLayer — the `textured` branch of the per-frame body partition
 * (spec §6, §6.4): a resolved, resident-texture body drawn as a lit,
 * surface-mapped sphere, one `'body'`-slab content row per body.
 *
 * ### What it draws — the partition's textured branch, this row's body only
 *
 * The frame program expands a `'body'` layer into one render step per body-m
 * slab row (Task 7); `enabled`/`draw` are called once per body-m row, gated on
 * `view.slab.frame.bodyId` filtered to the `textured` branch of
 * `sceneBodyPartition`. Its sibling `planetsLayer` takes the `flat` branch, so
 * a body is textured XOR flat by construction — a given bodyId matches at most
 * one, so the two opaque `foreground:0` layers can never z-fight over the same
 * sphere. A body whose texture has not landed yet is `flat` (the plain lit
 * albedo sphere is the placeholder), and slides to `textured` the frame its
 * bitmap commits.
 *
 * ### The ring ratios + limb params are DATA on the uniform, not code paths
 *
 * Unchanged from the pre-body-slabs layer: each textured body packs two ring
 * radii into `TexturedBodyUniforms`, resolved from `SCENE_RINGS` to
 * planet-radius units. Only Saturn has a row there, so every other body packs
 * `(0, 0)` — `ringOuterRatio == 0` is the fragment's "no ring" sentinel. The
 * Minnaert limb-darkening params ride the same data-gate: `limbParams` reads
 * `LIMB_DARKENING_PARAMS` and falls back to `{ strength: 0, exponent: 1 }` —
 * identity — for every absent body.
 *
 * ### The f64 seam — `ctx.bodyPose`, not a re-derived camera basis
 *
 * Same seam as `earthLayer`/`planetsLayer`: this row's `pose =
 * ctx.bodyPose(bodyId)` is the SAME closure `deriveSlabs` built this row's
 * `view.slab.vp` from, so `composeBodySlabMvp`/`bodySlabCamLocal` compose
 * against the eye-relative metre offset that vp already expects — no
 * rotation term, no world translation. See `composeBodySlabMvp`'s module
 * header. `camPosLocal` (the Minnaert view cosine's camera) uses the SAME
 * `planet.radiusM` the mvp used, so both share one definition of "the frame
 * where this body is the unit sphere".
 *
 * ### When it draws
 *
 * `enabled` gates on the `texturedBodyRenderer` GPU handle (null
 * pre-bootstrap), the shared near-field distance gate
 * (`FOREGROUND_MAX_DISTANCE_MPC`), AND this row's `bodyId` appearing in the
 * partition's `textured` branch. This layer carries no pick aspect of its
 * own — `planetsLayer` is the sole pick site for `flat ∪ textured`.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { BodyTextureId } from '../../../../@types/data/BodyTextureId';
import type { PlanetBody } from '../../../../@types/scene/PlanetBody';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { SCENE_RINGS } from '../../../../data/bodies/sceneRings';
import { LIMB_DARKENING_PARAMS } from '../../../../data/bodies/limbDarkeningParams';
import { composeBodySlabMvp } from '../../../../utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../utils/camera/bodySlabCamLocal';
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
  slab: 'body',
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    // Handle first: the check short-circuits so pre-bootstrap fixtures (null
    // renderer, bare ctx) never touch ctx or the partition inputs.
    if (state.gpu.texturedBodyRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    const bodyId = view.slab.frame.bodyId;
    return sceneBodyPartition(state, ctx).textured.some((b) => b.id === bodyId);
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.texturedBodyRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    const bodyId = view.slab.frame.bodyId;
    const body = sceneBodyPartition(state, ctx).textured.find((b) => b.id === bodyId);
    if (body === undefined) return;
    // The SAME pose-provider closure `deriveSlabs` was fed to build this row's
    // `view.slab.vp` — reading it here instead of re-deriving the pose is what
    // keeps this layer's eyeRelBodyM from ever drifting off that basis.
    const pose = ctx.bodyPose(bodyId);
    if (pose === null) return;

    const bodyState = sceneBodyStates(state, ctx).get(body.id)!;
    const mvp = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, body.radiusM);
    // Rotate the sun direction into the body's local frame (its orientation
    // carries any axial tilt) so the fragment's Lambert term stays a plain
    // co-framed dot product — the same rotate earth/planets do.
    const sun = sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation);
    const { inner, outer } = ringRatios(body);
    // Minnaert limb-darkening: the per-body strength/exponent (identity for a
    // body absent from `LIMB_DARKENING_PARAMS`), plus the camera in the body's
    // local frame the fragment's view cosine needs — the SAME radiusM the mvp
    // above used, so both share one definition of "the unit-sphere frame".
    const { strength, exponent } = limbParams(body);
    const cam = bodySlabCamLocal(pose.eyeRelBodyM, body.radiusM);
    // Narrow here, at the GPU uniform write — composeBodySlabMvp returns f64.
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
  },
};
