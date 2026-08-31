/**
 * planetsLayer — the `flat` branch of the per-frame body partition as
 * true-scale, flat-lit albedo spheres in the depth-bearing `foreground:0`
 * target.
 *
 * ### What it draws
 *
 * One sphere per body in `sceneBodyPartition`'s `flat` branch (resolved bodies
 * whose surface texture is not resident), composed as a unit sphere scaled to
 * the body's radius (`radiusM` → Mpc via `SCALE_UNITS.M_TO_MPC`) and
 * translated to its `positionMpc`, in the `RENDER_ORIGIN_MPC`-relative frame,
 * tinted by its flat `albedo`. A body with a resident texture is `textured`
 * (drawn by `texturedBodiesLayer`), and a sub-pixel body is a `glint` — so this
 * layer never draws either, and the two opaque `foreground:0` sphere layers
 * cannot z-fight over one body.
 *
 * ### Why one renderer with one instanced draw
 *
 * A single `planetRenderer` draws every flat planet in ONE instanced
 * `drawIndexed`. That batching is also why the record carries a per-body
 * `camPosLocal`: the renderer ray-traces its silhouette analytically, and one
 * draw cannot carry N ray origins on a uniform. This layer packs each body's
 * MVP + albedo + sun direction + local camera into a reused module-level
 * staging array (no per-frame allocation on the engine hot path)
 * and hands the whole batch to `draw`, which uploads it with one
 * `queue.writeBuffer`. Each planet reads its own baked record via the instance
 * step, so nothing races `queue.writeBuffer` against submit — the alternative
 * of a shared per-draw uniform would collapse every planet onto the last one
 * (the writeBuffer-vs-submit landmine). See `planetRenderer`'s header.
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Same seam as `earthLayer` / `starSpheresLayer`: near-field sphere bodies
 * sit AU-to-parsec distances from the render origin — tiny Mpc numbers the
 * VP's large translation nearly cancels. `composeBodyMvp` resolves that
 * cancellation in double precision BEFORE narrowing to f32; feeding it the
 * already-narrowed `view.vp` would misplace a body by more than its radius.
 * See `composeBodyMvp`'s module header.
 *
 * ### When it draws — the partition's flat branch
 *
 * `enabled` gates on the `planetRenderer` GPU handle (null pre-bootstrap),
 * the shared near-field distance gate (`FOREGROUND_MAX_DISTANCE_MPC` —
 * beyond it every planet is a deep-sub-pixel speck, and gating with the
 * NEAR0 siblings lets the executor skip the whole foreground pass group as
 * empty), AND a non-empty `flat` branch of `sceneBodyPartition`. The partition
 * splits the seeded bodies into `{ glints, flat, textured }` once per frame;
 * this layer draws the `flat` array — bodies resolved past the glint threshold
 * whose surface texture is NOT resident (its sibling `texturedBodiesLayer`
 * takes the `textured` array, so a resolved body is flat XOR textured and the
 * two opaque `foreground:0` layers can never z-fight over the same sphere).
 * Sub-pixel bodies land in `glints`, not `flat`, so they are dropped here with
 * no per-body cull of this layer's own — the partition owns that boundary. A
 * row whose `flat` branch is empty must not stay in the pass plan just because
 * the eventual instanced draw would be a no-op; `enabled` and `draw` read ONE
 * partition, so the two sites cannot disagree about which bodies are flat.
 * `draw` re-checks the handle so a stale call is a harmless no-op.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { Source } from '../../../../data/sources';
import { SCENE_PLANETS } from '../../../../data/bodies/scenePlanets';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { camPosLocal } from '../../../../utils/camera/camPosLocal';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { sceneBodyPartition } from '../sceneBodyPartition';
import { sceneBodyStates } from '../sceneBodyStates';
import { INSTANCE_FLOATS } from '../../../gpu/renderers/bodies/planetRenderer';
import { seedIndexOfBody } from './seedIndexOfBody';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { drawFlooredSpherePick } from '../../helpers/drawFlooredSpherePick';

// Reused across frames — the engine hot path allocates nothing here. Sized
// for the live SCENE_PLANETS table (a compile-time constant, so this is a
// fixed size, not a cap — the renderer itself carries no upper bound, and the
// `flat` branch drawn below is always a subset of this same table); each
// planet's `INSTANCE_FLOATS`-long record is rewritten in place before the
// single instanced draw.
const staging = new Float32Array(SCENE_PLANETS.length * INSTANCE_FLOATS);

export const planetsLayer: ContentLayer = {
  name: 'planets',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx) {
    // Handle first, distance second, partition last: the handle check
    // short-circuits so pre-bootstrap fixtures (null renderer, bare ctx, no
    // bodies bag) never touch ctx or state.data. The target is a
    // bootstrap-guaranteed renderTargets row.
    if (state.gpu.planetRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    // A row that would draw zero bodies must leave the pass plan (see header):
    // mirror draw's branch with the SAME partition.
    return sceneBodyPartition(state, ctx).flat.length > 0;
  },

  // Pick gate — WIDER than `enabled`: this layer is the sole pick site for the
  // whole planet source (`flat ∪ textured`; `texturedBodiesLayer` carries no
  // pick aspect — see `drawPick`'s header), so the pick pass must admit the row
  // whenever EITHER partition branch is non-empty. `enabled` stays flat-only so
  // a textured-only frame (a lone textured Saturn before its untextured moons
  // resolve into `flat`) leaves no zero-body row in the VISUAL pass plan while
  // its sphere stays clickable. Handle + distance gates match `enabled`; only
  // the partition predicate differs. See `ContentLayer.pickEnabled`.
  pickEnabled(state, ctx) {
    // Short-circuits on the DRAW handle (`planetRenderer`), not the pick handle
    // (`bodyPickRenderer` — which `drawPick` re-checks): the two GPU resources
    // bootstrap together, so the draw handle is a sound pre-bootstrap proxy, and
    // gating on it keeps `pickEnabled` reading the same fixtures `enabled` does.
    if (state.gpu.planetRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    const { flat, textured } = sceneBodyPartition(state, ctx);
    return flat.length + textured.length > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.planetRenderer;
    if (renderer === null) return;
    const flat = sceneBodyPartition(state, ctx).flat;
    // Live position + orientation from the per-frame snapshot (keyed by id),
    // resolved ONCE for the whole pack loop — not the baked record fields.
    const states = sceneBodyStates(state, ctx);
    const limit = flat.length;

    // Pack one 28-float instance record per FLAT planet: floats 0..15 the MVP
    // composed from the slab's f64 vp (see the module header's "f64 seam"
    // note), 16..18 the albedo, 19 the pad, 20..22 the sun direction rotated
    // into the body's local frame, 23 the pad, 24..26 the camera in that same
    // local frame, 27 the pad. Then ONE instanced draw. The partition already
    // dropped sub-pixel bodies to `glints` and resident-texture bodies to
    // `textured`, so this loop packs exactly the flat-lit set with no per-body
    // test of its own.
    for (let i = 0; i < limit; i++) {
      const planet = flat[i]!;
      const bodyState = states.get(planet.id)!;
      const radiusMpc = planet.radiusM * SCALE_UNITS.M_TO_MPC;
      const mvp = composeBodyMvp(
        view.slab.vp,
        bodyState.positionMpc,
        RENDER_ORIGIN_MPC,
        radiusMpc,
        bodyState.orientation,
      );
      // Rotate the sun direction into the body's local frame (its orientation
      // carries any axial tilt) so the fragment's Lambert term stays a plain
      // co-framed dot product — same rotate earthLayer does.
      const sun = sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation);
      // The analytic ray's ORIGIN, in the frame where this body is the unit
      // sphere. It is a PAIR with the mvp above and must be built from the same
      // `radiusMpc` — the mvp's model scale is what defines that frame, so a
      // camera divided by a different radius puts the ray origin somewhere the
      // vertex stage never went. Same call `texturedBodiesLayer` makes.
      const cam = camPosLocal(view.camPos, bodyState.positionMpc, radiusMpc, bodyState.orientation);
      const base = i * INSTANCE_FLOATS;
      // Narrow here, at the staging-buffer write — composeBodyMvp returns f64.
      staging.set(narrowMat4(mvp), base);
      staging[base + 16] = planet.albedo[0];
      staging[base + 17] = planet.albedo[1];
      staging[base + 18] = planet.albedo[2];
      staging[base + 19] = 0; // albedo pad — kept zeroed across frames
      staging[base + 20] = sun[0];
      staging[base + 21] = sun[1];
      staging[base + 22] = sun[2];
      staging[base + 23] = 0; // sunDir pad — kept zeroed across frames
      staging[base + 24] = cam[0];
      staging[base + 25] = cam[1];
      staging[base + 26] = cam[2];
      staging[base + 27] = 0; // camPosLocal pad — kept zeroed across frames
    }
    if (limit > 0) renderer.draw(pass, staging, limit);
  },

  // Pick aspect — stamps one packed identity per RESOLVED planet-source body into
  // the NEAR0 r32uint pick pass, one `drawSphere` per body (each carries its own
  // MVP + packed id, so the sphere picks never collapse onto the last body — the
  // writeBuffer-vs-submit race `bodyPickRenderer` guards with per-draw dynamic
  // offsets).
  //
  // This is the SOLE pick site for the whole planet source: the two opaque
  // foreground sphere layers split the resolved bodies across `planetsLayer`
  // (the `flat` branch) and `texturedBodiesLayer` (the `textured` branch, which
  // carries no pick aspect of its own), so the pick set here is the UNION of both
  // partition branches — a body is pickable-as-a-sphere exactly when it draws as
  // one, flat or textured alike. Sub-pixel `glints` are additive points, not
  // spheres, so they stay unpickable (the same set the pre-partition resolution
  // cull selected). The partition is the SAME per-frame `sceneBodyPartition`
  // split `draw` consumes, so the pick and draw sets cannot disagree.
  //
  // The packed id carries each planet's STABLE `SCENE_PLANETS` index, NOT its
  // slot in the resolved subset (which shifts as planets enter/leave the cull or
  // cross the texture-residency boundary — see `seedIndexOfBody`). A planet id
  // absent from the seed table returns −1 and is skipped: a packed id from −1
  // would alias body 0. The MVP folds `orientation` the same way `draw` does, so
  // the pick silhouette matches the drawn sphere.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.bodyPickRenderer;
    if (pickRenderer === null) return;

    const { flat, textured } = sceneBodyPartition(state, ctx);
    // Live position + orientation from the per-frame snapshot (keyed by id),
    // resolved ONCE for the whole pick loop — not the baked record fields.
    const states = sceneBodyStates(state, ctx);

    for (const planet of [...flat, ...textured]) {
      const seedIndex = seedIndexOfBody(planet.id, SCENE_PLANETS);
      if (seedIndex < 0) continue; // unknown id: a packed id from −1 would alias body 0.
      const bodyState = states.get(planet.id)!;
      // Floor the PICK radius to the shared min footprint (visual sphere
      // untouched) via the shared `drawFlooredSpherePick` recipe: a resolved-but-
      // small planet near the foreground far edge can project to a couple of
      // pixels, too small to click. Each body folds its snapshot orientation and
      // its stable seed-index identity.
      drawFlooredSpherePick(pickRenderer, pass, {
        vp: view.slab.vp,
        positionMpc: bodyState.positionMpc,
        radiusMpc: planet.radiusM * SCALE_UNITS.M_TO_MPC,
        camPosMpc: view.camPos,
        drawPxPerRad: ctx.drawPxPerRad,
        orientation: bodyState.orientation,
        packedId: packSelection(Source.Planet, seedIndex + PICK_SENTINEL_OFFSET),
      });
    }
  },
};
