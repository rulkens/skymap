/**
 * planetsLayer — the `flat` branch of the per-frame body partition as a
 * true-scale, flat-lit albedo sphere, one `'body'`-slab content row per body.
 *
 * ### What it draws
 *
 * The frame program expands a `'body'` layer into one render step per body-m
 * slab row (Task 7); `enabled`/`draw` are therefore called once PER BODY,
 * gated on `view.slab.frame.bodyId` filtered to the `flat` branch of
 * `sceneBodyPartition` — the resolved body whose surface texture is not
 * resident. A body with a resident texture is `textured` (drawn by
 * `texturedBodiesLayer`), and a sub-pixel body is a `glint` (`bodyGlintsLayer`,
 * untouched) — so a given bodyId matches at most one of these branches, and
 * the two opaque `foreground:0` sphere layers can never z-fight over one body.
 *
 * ### Why a single-instance draw, not the old N-body batch
 *
 * Pre-body-slabs, one `planetRenderer` instanced draw painted every flat
 * planet in a shared NEAR0 frame. Under `'body'` slabs each body owns its OWN
 * `view.slab.vp` (a distinct near-field projection about that body's eye-
 * relative pose — see `bodySlabRow`), so there is no longer one shared vp to
 * batch multiple bodies against. `renderer.draw` still takes an instance
 * array + count, but this layer now calls it once per row with `count = 1`;
 * the renderer's instancing machinery is unchanged (and still the right shape
 * for the multi-body world-mpc case it was built for), only this caller's
 * batch width changed.
 *
 * ### The f64 seam — `ctx.bodyPose`, not a re-derived camera basis
 *
 * Same seam as `earthLayer`/`atmosphereShellLayer`: this row's `pose =
 * ctx.bodyPose(bodyId)` is the SAME closure `deriveSlabs` built this row's
 * `view.slab.vp` from, so `composeBodySlabMvp`/`bodySlabCamLocal` compose
 * against the eye-relative metre offset that vp already expects — no
 * rotation term (the pose already rotated the offset into the body's fixed
 * axes), no world translation. See `composeBodySlabMvp`'s module header.
 *
 * ### When it draws — the partition's flat branch, this row's body only
 *
 * `enabled` gates on the `planetRenderer` GPU handle (null pre-bootstrap),
 * the shared near-field distance gate (`FOREGROUND_MAX_DISTANCE_MPC`), AND
 * this row's `bodyId` appearing in the partition's `flat` branch.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { Source } from '../../../../data/sources';
import { SCENE_PLANETS } from '../../../../data/bodies/scenePlanets';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { composeBodySlabMvp } from '../../../../utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../utils/camera/bodySlabCamLocal';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { sceneBodyPartition } from '../sceneBodyPartition';
import { sceneBodyStates } from '../sceneBodyStates';
import { INSTANCE_FLOATS } from '../../../gpu/renderers/bodies/planetRenderer';
import { seedIndexOfBody } from './seedIndexOfBody';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { BODY_PICK_MIN_RADIUS_PX } from '../../helpers/minPickRadiusMpc';

// One instance record, reused across draws — a `'body'` row draws at most one
// planet, so this needs no per-body indexing (unlike the retired N-planet
// staging array).
const staging = new Float32Array(INSTANCE_FLOATS);

export const planetsLayer: ContentLayer = {
  name: 'planets',
  slab: 'body',
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    // Handle first, distance second, partition last: the handle check
    // short-circuits so pre-bootstrap fixtures (null renderer, bare ctx, no
    // bodies bag) never touch ctx or state.data.
    if (state.gpu.planetRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    const bodyId = view.slab.frame.bodyId;
    return sceneBodyPartition(state, ctx).flat.some((p) => p.id === bodyId);
  },

  // Pick gate — WIDER than `enabled`: this layer is the sole pick site for the
  // whole planet source (`flat ∪ textured`; `texturedBodiesLayer` carries no
  // pick aspect — see `drawPick`'s header), so a textured-only row (a lone
  // textured Saturn before its untextured moons resolve into `flat`) must stay
  // pickable while its visual row leaves the pass plan. See `ContentLayer.pickEnabled`.
  pickEnabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    if (state.gpu.planetRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    const bodyId = view.slab.frame.bodyId;
    const { flat, textured } = sceneBodyPartition(state, ctx);
    return flat.some((p) => p.id === bodyId) || textured.some((p) => p.id === bodyId);
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.planetRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    const bodyId = view.slab.frame.bodyId;
    const planet = sceneBodyPartition(state, ctx).flat.find((p) => p.id === bodyId);
    if (planet === undefined) return;
    // The SAME pose-provider closure `deriveSlabs` was fed to build this row's
    // `view.slab.vp` — reading it here instead of re-deriving the pose is what
    // keeps this layer's eyeRelBodyM from ever drifting off that basis.
    const pose = ctx.bodyPose(bodyId);
    if (pose === null) return;

    // Live position + orientation from the per-frame snapshot (keyed by id) —
    // sunDirLocal still reads Mpc/orientation directly; only the mvp/camLocal
    // seam moved to the metre-native body-slab primitives.
    const bodyState = sceneBodyStates(state, ctx).get(planet.id)!;
    const mvp = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, planet.radiusM);
    const sun = sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation);
    // The analytic ray's ORIGIN, in the frame where this body is the unit
    // sphere — a PAIR with the mvp above, both built from the same radiusM.
    const cam = bodySlabCamLocal(pose.eyeRelBodyM, planet.radiusM);

    // Narrow here, at the staging-buffer write — composeBodySlabMvp returns f64.
    staging.set(narrowMat4(mvp), 0);
    staging[16] = planet.albedo[0];
    staging[17] = planet.albedo[1];
    staging[18] = planet.albedo[2];
    staging[19] = 0; // albedo pad — kept zeroed across frames
    staging[20] = sun[0];
    staging[21] = sun[1];
    staging[22] = sun[2];
    staging[23] = 0; // sunDir pad — kept zeroed across frames
    staging[24] = cam[0];
    staging[25] = cam[1];
    staging[26] = cam[2];
    staging[27] = 0; // camPosLocal pad — kept zeroed across frames
    renderer.draw(pass, staging, 1);
  },

  // Pick aspect — stamps this row's body into the r32uint pick pass when it is
  // EITHER flat or textured (the union `pickEnabled` admits). The packed id
  // carries the body's STABLE `SCENE_PLANETS` index, NOT its slot in any
  // resolved subset — see `seedIndexOfBody`. A planet id absent from the seed
  // table returns −1 and is skipped: a packed id from −1 would alias body 0.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.bodyPickRenderer;
    if (pickRenderer === null || view.slab.frame.kind !== 'body-m') return;
    const bodyId = view.slab.frame.bodyId;
    const { flat, textured } = sceneBodyPartition(state, ctx);
    const planet = flat.find((p) => p.id === bodyId) ?? textured.find((p) => p.id === bodyId);
    if (planet === undefined) return;
    const seedIndex = seedIndexOfBody(planet.id, SCENE_PLANETS);
    if (seedIndex < 0) return; // unknown id: a packed id from −1 would alias body 0.
    const pose = ctx.bodyPose(bodyId);
    if (pose === null) return;

    // Floor the pick radius (BODY_PICK_MIN_RADIUS_PX) so a far-edge planet
    // projecting to a couple of pixels stays clickable — the same recipe
    // `earthLayer.drawPick` uses, composed metre-native rather than through
    // the Mpc-based `drawFlooredSpherePick` helper: `view.slab.vp` is
    // eye-relative metres here, not that helper's Mpc/world-relative frame.
    const dM = Math.hypot(pose.eyeRelBodyM[0], pose.eyeRelBodyM[1], pose.eyeRelBodyM[2]);
    const pickRadiusM = Math.max(planet.radiusM, (BODY_PICK_MIN_RADIUS_PX / ctx.drawPxPerRad) * dM);
    // Same pickRadiusM feeds both calls — the mvp's model scale defines the
    // frame camPosLocal is measured in, so both must come from the one radius.
    const mvp = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, pickRadiusM);
    const pickCamLocal = bodySlabCamLocal(pose.eyeRelBodyM, pickRadiusM);

    pickRenderer.drawSphere(pass, {
      mvp: narrowMat4(mvp),
      camPosLocal: pickCamLocal,
      packedId: packSelection(Source.Planet, seedIndex + PICK_SENTINEL_OFFSET),
    });
  },
};
