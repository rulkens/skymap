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
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { sceneBodyPartition } from '../sceneBodyPartition';
import { bodyApparentDiameterPx } from '../../../../utils/scene/bodyApparentDiameterPx';
import { bodyGlintBrightness } from '../../../../utils/scene/bodyGlintBrightness';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../presentation/scaleFadeBands';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { MAX_GLINTS, INSTANCE_FLOATS } from '../../../gpu/renderers/bodies/bodyGlintRenderer';

// Reused across frames — the engine hot path allocates nothing here. Sized for
// the renderer's cap; each glint's 7-float record (camera-relative position +
// albedo tint + brightness) is rewritten in place before the single draw.
const staging = new Float32Array(MAX_GLINTS * INSTANCE_FLOATS);

// A glint whose final brightness is at or below this rounds to nothing in the
// HDR accumulation — skip its draw (the opacity-0 house rule).
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
};
