/**
 * bodyGlintsLayer — the `glints` branch of the per-frame body partition as
 * brightness-scaled additive point sprites in the depthless HDR accumulation.
 *
 * ### What it draws — the sub-pixel bodies
 *
 * The `glints` branch of `sceneBodyPartition` — every seeded body whose apparent
 * diameter stays below `BODY_GLINT_MAX_PX`. Its siblings `planetsLayer` /
 * `texturedBodiesLayer` draw the `flat` / `textured` branches of the SAME
 * partition, so a body is a glint XOR a mesh by construction — the interim gap
 * where sub-pixel bodies simply vanished (the mesh culled them and nothing drew
 * the glint) is closed here.
 *
 * ### Brightness = apparent size x albedo x phase, then the cross-fade
 *
 * Each glint's stored `brightness` is `bodyGlintBrightness` (apparent size x
 * albedo luminance x illuminated fraction — a crescent Venus dims, a gibbous
 * Moon brightens; the unlit far side adds nothing) MULTIPLIED by the `bodyGlint`
 * `fadeBand`, keyed on the apparent diameter in px. The band is a RECEDE fade —
 * full at/below 1 px, gone at/above 3 px — so the glint fades IN over 3->1 px
 * while the mesh still draws: at 3 px the glint is ~0 (the mesh carries), by 1 px
 * it is full (the mesh is about to cull at `SUB_PIXEL_BODY_CULL_PX`), a popless
 * handoff. `color` is the body's albedo tint (the shader premultiplies it by
 * brightness).
 *
 * ### The zero-brightness skip (`feedback_opacity_zero_no_render`)
 *
 * A glint whose `brightness * fadeBand` rounds to 0 — fully faded near the 3 px
 * crossover, OR turned to its unlit far side — contributes no light, so it is
 * NOT packed into the instance batch and never submitted. Gating at the pack
 * boundary (not inside the draw) keeps the additive pass free of no-op draws.
 *
 * ### The odd row out: `hdr` target, NEAR0 slab — and the f64 rebase seam
 *
 * Like `starPointsLayer`, this projects through NEAR0 (COSMO's fixed near plane
 * would clip the AU-scale body anchors) while accumulating into the HDR target
 * so the glints ride the galaxies' tone-map. And like `starPointsLayer` it hands
 * the renderer CAMERA-RELATIVE anchors (`pos - camPos`, in f64) paired with the
 * REBASED view-projection (`rebaseViewProj(view.slab.vp, camPos)`), so the f32
 * upload carries no catastrophic cancellation as the camera closes on a body —
 * see that layer's f64-seam note.
 *
 * ### When it draws
 *
 * `enabled` gates on the `bodyGlintRenderer` GPU handle (null pre-bootstrap),
 * the shared near-field distance gate (`FOREGROUND_MAX_DISTANCE_MPC` — nothing
 * changes at galaxy scale), AND a non-empty `glints` branch — the same partition
 * `draw` consumes, so the enable gate and the packed set cannot disagree. The
 * handle check short-circuits first (so pre-bootstrap fixtures with a null
 * renderer and no bodies bag never touch `state.data` or the partition);
 * `draw` re-checks the handle so a stale call is a harmless no-op.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { BodyPointPick } from '../../../../@types/rendering/BodyPickRenderer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { Source } from '../../../../data/sources';
import { SCENE_PLANETS } from '../../../../data/bodies/scenePlanets';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { sceneBodyPartition } from '../sceneBodyPartition';
import { seedIndexOfBody } from './seedIndexOfBody';
import { glintBandClass } from './glintBandClass';
import { bodyApparentDiameterPx } from '../../../../utils/scene/bodyApparentDiameterPx';
import { bodyGlintBrightness } from '../../../../utils/scene/bodyGlintBrightness';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../presentation/scaleFadeBands';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../solarSystemLabelMaxDistance';
import { MAX_GLINTS, INSTANCE_FLOATS } from '../../../gpu/renderers/bodies/bodyGlintRenderer';

// Reused across frames — the engine hot path allocates nothing here. Sized for
// the renderer's cap; each glint's 7-float record (camera-relative position +
// albedo tint + brightness) is rewritten in place before the single draw.
const staging = new Float32Array(MAX_GLINTS * INSTANCE_FLOATS);

// A glint whose final brightness (phase x cross-fade) is at or below this rounds
// to nothing in the HDR accumulation — it contributes no pixels. Both sites read
// this ONE constant so their skip thresholds cannot drift: `draw` always omits
// the instance, and `drawPick` omits the pick footprint only BEYOND the caption
// range (within it the label carries the click — see `drawPick`). The opacity-0
// house rule, deferred to the label where a label still invites the click.
const GLINT_MIN_BRIGHTNESS = 1e-4;

export const bodyGlintsLayer: ContentLayer = {
  name: 'body-glints',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    // Handle first (short-circuits before any ctx / state.data read — matches
    // starPointsLayer), distance second, partition last.
    if (state.gpu.bodyGlintRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    return sceneBodyPartition(state, ctx).glints.length > 0;
  },

  // Pick gate — WIDER than `enabled`: this layer also carries Earth's caption-
  // range pick stamp (see `drawPick`), which lives on `bodies.earth` rather than
  // the glints partition. So the pick pass must admit the row whenever the Earth
  // caption invites a click, EVEN with an empty `glints` branch — otherwise a
  // sub-pixel Earth with a visible label but no other glints would drop out of
  // the pick pass entirely. `enabled` stays glints-only so a caption-range frame
  // with no glints leaves no zero-glint row in the VISUAL pass plan. Same Earth
  // gate `drawPick` uses. See `ContentLayer.pickEnabled`.
  pickEnabled(state, ctx) {
    if (state.gpu.bodyGlintRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    if (sceneBodyPartition(state, ctx).glints.length > 0) return true;
    return (
      state.data.bodies.earth !== null &&
      ctx.cam.distance < SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC
    );
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.bodyGlintRenderer;
    if (renderer === null) return;

    const { glints } = sceneBodyPartition(state, ctx);

    // Rebase into the camera-relative frame in f64 so the f32 upload carries no
    // catastrophic cancellation — see the module header's f64-seam note.
    // `view.camPos` is the origin-relative eye (the frame `view.slab.vp` and the
    // body anchors live in), which coincides with `ctx.drawCamPos` because the
    // render origin is the heliocentric [0,0,0].
    const camPos = view.camPos;

    // Pack one 7-float record per glint whose brightness survives the phase +
    // cross-fade, skipping the rest (the opacity-0 house rule). `count` tracks
    // the packed subset — a skipped body leaves a hole no record fills.
    let count = 0;
    for (const body of glints) {
      if (count >= MAX_GLINTS) break;
      const diameterPx = bodyApparentDiameterPx({
        positionMpc: body.positionMpc,
        radiusKm: body.radiusKm,
        camPosMpc: camPos,
        viewportHeightPx: view.viewportPx[1],
        fovYRad: ctx.fovYRad,
      });
      // brightness (size x albedo x phase) x the descent cross-fade band.
      const raw = bodyGlintBrightness({
        albedo: body.albedo,
        positionMpc: body.positionMpc,
        camPosMpc: camPos,
        renderOriginMpc: RENDER_ORIGIN_MPC,
        apparentDiameterPx: diameterPx,
      });
      const brightness = raw * fadeBand(SCALE_FADE_BANDS.bodyGlint, diameterPx);
      if (brightness <= GLINT_MIN_BRIGHTNESS) continue;

      // Camera-relative anchor (pos - camPos), computed in f64 before the
      // renderer narrows to f32 — narrowing the raw AU-scale anchor would have
      // already lost the low bits.
      const base = count * INSTANCE_FLOATS;
      staging[base + 0] = body.positionMpc[0] - camPos[0];
      staging[base + 1] = body.positionMpc[1] - camPos[1];
      staging[base + 2] = body.positionMpc[2] - camPos[2];
      staging[base + 3] = body.albedo[0];
      staging[base + 4] = body.albedo[1];
      staging[base + 5] = body.albedo[2];
      staging[base + 6] = brightness;
      count++;
    }
    if (count === 0) return;

    // Fold the eye offset into the vp so it pairs with the camera-relative
    // anchors. Uses the slab's f64 `vp`, NOT the f32-narrowed `view.vp` —
    // narrowed HERE, at the GPU-upload boundary.
    const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));
    renderer.draw(pass, staging, count, rebasedVp, view.viewportPx);
  },

  // Pick aspect — stamps the sub-pixel `glints` bodies into the NEAR0 r32uint pick
  // pass as ONE instanced pick-billboard draw (each expanded to the same generous
  // clickable footprint the scene-star points get in `bodyPickRenderer.drawPoints`
  // — these seeded solar-system bodies are sparse, labelled, click-invited
  // targets), so a sub-pixel planet stays easily pickable at its true screen
  // position. The set is the SAME `sceneBodyPartition(state, ctx).glints` branch
  // `draw` packs — a body is pickable-as-a-glint exactly when it draws as one; its
  // resolved complement (`flat` ∪ `textured`) rides `planetsLayer`'s sphere pick.
  //
  // The per-body `brightness` term (phase x cross-fade) is mirrored here — but
  // only BEYOND the caption range. Pick follows the visible AFFORDANCE: within
  // SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC the affordance is the body's foreground
  // LABEL, so pick follows the label and a near-invisible glint (a new-phase
  // Venus, or one fully faded at the 3 px crossover) stays clickable. Beyond that
  // gate no label invites the click, so pick reverts to following the glint's own
  // brightness: a glint whose `brightness · fadeBand(apparentPx)` drops to
  // `GLINT_MIN_BRIGHTNESS` renders NO pixels in `draw` and must not claim an ~18 px
  // pick footprint. The skip recomputes `draw`'s EXACT brightness from the same
  // inputs against the shared `GLINT_MIN_BRIGHTNESS`, ANDed with the caption gate,
  // so within the gate the pick set is wider than the drawn set and beyond it the
  // two match. The `enabled` gate already drops the whole layer above the
  // foreground distance.
  //
  // Each body's packed id carries its STABLE `SCENE_PLANETS` index (the same seed
  // table + `Source.Planet` code `planetsLayer`'s sphere pick stamps, so a body
  // round-trips to the SAME selection whether it is picked as a glint or a sphere),
  // NOT its slot in the glints partition (which shifts as a body crosses
  // `BODY_GLINT_MAX_PX` — see `seedIndexOfBody`); a body id absent from the seed
  // table returns −1 and is dropped (a packed id from −1 would alias body 0). Earth
  // is not in this partition (it rides its own `bodies.earth` / `earthLayer`), but
  // its glint-scale pick footprint IS emitted here as a `Source.Earth` stamp (see
  // the Earth-stamp note in the body). Anchors are rebased into the camera-relative
  // frame in f64 before narrowing, the SAME seam `draw` uses.
  //
  // Each point also carries a glint priority CLASS (`glintBandClass`: 0 earth, 1
  // planet, 2 moon) which the `'glint'` variant maps to its own pick-depth band —
  // so earth-over-planet-over-moon is an unconditional depth win and the ORDER the
  // points appear in this list carries no priority. See `starPointPick.wesl`.
  //
  // `bodyPickRenderer.drawPoints` is safe to call once per caller per pass (it
  // claims its own per-pass slot of buffers); this layer and `starPointsLayer` are
  // its two callers, each calling exactly once per `drawPick`.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.bodyPickRenderer;
    if (pickRenderer === null) return;

    const { glints } = sceneBodyPartition(state, ctx);

    const camPos = view.camPos;
    const pickPoints: BodyPointPick[] = [];

    // Emit the Earth glint stamp with the EARTH priority class (0), the shallowest
    // glint band, so Earth out-picks the Moon and every planet at glint scale
    // regardless of nearness or list position (the class, not draw order, decides —
    // see the `'glint'` variant below and `lib/pickDepthBands.wesl`). Earth is not
    // in `sceneBodyPartition` (it rides `bodies.earth` / `earthLayer`), so without
    // this stamp its only glint-scale pick coverage is its sub-pixel sphere — the
    // Moon's 18 px footprint would own the area and steal the click.
    //
    // Gate on the CAPTION range, not `earthLayer.enabled`: pick follows the
    // visible AFFORDANCE, and the affordance inviting the click here is Earth's
    // foreground LABEL, which stays on out to SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC.
    // `earthLayer.enabled` dies ten orders of magnitude earlier — at the
    // SUB_PIXEL_BODY_CULL_PX 1 px cull — so gating on it strands the click for the
    // whole zoom range where the label still shows (the famous-star enlarged-
    // footprint precedent). The caption range strictly contains the sphere-visible
    // range, so nothing narrows; when Earth is resolved and large the extra 18 px
    // point overlapping the sphere pick is harmless — it writes the SAME
    // `Source.Earth` id `earthLayer`'s sphere pick writes. This also drops v2's
    // cross-layer coupling to `earthLayer`. Unlike the per-body glint brightness
    // skip below, the Earth stamp is NOT brightness-gated (it is not a partition
    // glint).
    const earth = state.data.bodies.earth;
    if (earth !== null && ctx.cam.distance < SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC) {
      pickPoints.push({
        posRelCamMpc: [
          earth.positionMpc[0] - camPos[0],
          earth.positionMpc[1] - camPos[1],
          earth.positionMpc[2] - camPos[2],
        ] as Vec3,
        packedId: packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET),
        bandClass: glintBandClass('earth'),
      });
    }

    for (const body of glints) {
      const seedIndex = seedIndexOfBody(body.id, SCENE_PLANETS);
      if (seedIndex < 0) continue; // unknown id: a packed id from −1 would alias body 0.

      // Per-body visibility skip — but only BEYOND the caption range. Within it
      // the visible affordance is the body's LABEL (which stays on out to
      // SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC), so pick follows the label and a
      // near-invisible glint stays clickable — a new-phase Venus with a visible
      // name must still be pickable. Beyond the caption gate no label invites the
      // click, so the old pick-follows-glint-visibility rule holds: a glint that
      // renders no pixels (unlit far side, or fully faded at the 3 px crossover)
      // must not claim a pick footprint. `draw` recomputes the same brightness
      // from the same inputs against the same `GLINT_MIN_BRIGHTNESS`, so within
      // the gate the pick set is WIDER than the drawn set and beyond it they match.
      const diameterPx = bodyApparentDiameterPx({
        positionMpc: body.positionMpc,
        radiusKm: body.radiusKm,
        camPosMpc: camPos,
        viewportHeightPx: view.viewportPx[1],
        fovYRad: ctx.fovYRad,
      });
      const brightness =
        bodyGlintBrightness({
          albedo: body.albedo,
          positionMpc: body.positionMpc,
          camPosMpc: camPos,
          renderOriginMpc: RENDER_ORIGIN_MPC,
          apparentDiameterPx: diameterPx,
        }) * fadeBand(SCALE_FADE_BANDS.bodyGlint, diameterPx);
      if (
        brightness <= GLINT_MIN_BRIGHTNESS &&
        ctx.cam.distance >= SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC
      )
        continue;

      pickPoints.push({
        posRelCamMpc: [
          body.positionMpc[0] - camPos[0],
          body.positionMpc[1] - camPos[1],
          body.positionMpc[2] - camPos[2],
        ] as Vec3,
        packedId: packSelection(Source.Planet, seedIndex + PICK_SENTINEL_OFFSET),
        // Priority class from the element table: 1 (heliocentric planet) or 2
        // (satellite moon), so a planet out-picks its own moons unconditionally.
        bandClass: glintBandClass(body.id),
      });
    }

    // Fold the eye offset into the vp so it pairs with the camera-relative
    // anchors — narrowed at the GPU-upload boundary, exactly as `draw` does.
    const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));
    pickRenderer.drawPoints(pass, {
      vp: rebasedVp,
      viewportPx: view.viewportPx,
      points: pickPoints,
      // The glint depth variant: every point forces its per-instance CLASS band
      // (`bandClass` above), so importance (not nearness, not list order) decides —
      // Earth out-picks planets out-pick their moons, unconditionally.
      variant: 'glint',
    });
  },
};
