/**
 * foregroundLabelsLayer — name captions for the true-scale foreground bodies.
 *
 * A near-field sibling of `labelsLayer` that draws a SECOND MSDF label
 * renderer (`state.gpu.foregroundLabelRenderer`) holding the scene-body
 * captions (`sceneBodyLabels` — Earth, the local star map, the planets). It
 * exists as its own row because the two label sets can't share one draw
 * call: one renderer draws with one view-projection, and these two project
 * through different slabs.
 *
 *   - The main labels (galaxies, structures, Milky Way) project through the
 *     COSMO slab, whose near plane sits at 10 kpc — so the Sun and Earth, which
 *     sit ~1 AU from the camera at solar-system zoom, fall inside it and get
 *     clipped away entirely.
 *   - These captions project through the NEAR0 slab, whose near/far track the
 *     camera's orbit distance, so the bodies are always comfortably in range.
 *
 * Both target the swap chain with premultiplied-OVER blending (UI overlay,
 * drawn post-tone-map) — the ONLY axis on which this row differs from
 * `labelsLayer` is its slab, which is exactly why it's a separate row rather
 * than a branch inside one.
 *
 * ### Why the f64 seam — the caption anchors need double precision too
 *
 * The label shader projects each anchor as `clip = viewProj · vec4(pos, 1)` in
 * f32. At solar-system zoom the anchors (Earth at 1 AU ≈ 4.85×10⁻¹² Mpc) AND
 * the NEAR0 vp's view translation (≈ −4.85×10⁻¹²) are BOTH ~1 AU from the
 * render origin. Their f32 subtraction cancels to ~4 digits, quantising the
 * camera-relative anchor onto a ~13 km grid — so the caption visibly hops
 * (~1 px at cam.distance 1e-15, ~24 px at the 1e-17 deepZoom floor) as the
 * camera moves. The precision killer is each term's distance FROM THE ORIGIN,
 * not the (tiny) camera-to-anchor distance: two points metres apart but 1 AU
 * from the origin still cancel. Consuming the f32-narrowed `view.vp` — whose
 * translation bits are already gone — cannot fix this.
 *
 * The fix mirrors the sphere-body layers' `composeBodyMvp` seam, adapted for a
 * shared-vp label pass: each frame we rebase both operands into a camera-
 * relative frame in f64 before narrowing. `rebaseViewProj(view.slab.vp,
 * camPos)` folds the eye offset into the vp — zeroing the large view
 * translation — and the anchors are re-expressed as `pos − camPos` (small
 * camera-relative vectors). Neither operand the f32 shader multiplies carries a
 * large-number-cancellation hazard, and the shader itself is untouched. Only
 * this FOREGROUND renderer instance is rebased; the galaxy-label renderer
 * (`labelsLayer`, Mpc-scale anchors) keeps its set-once path.
 *
 * ### Why gated on camera distance
 *
 * The captions are navigation aids for the final descent into the solar
 * system — one per seeded scene body (Earth, the Moon, Jupiter, the local
 * star map). Above galaxy scale those bodies are an irrelevant speck at the
 * galactic centre, and a permanent field of floating captions there would
 * just clutter the normal view — so the row stays dark until the camera has
 * zoomed well past galaxy scale.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Label } from '../../../../@types/rendering/Label';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { sceneBodyLabels } from '../../presentation/sceneBodyLabels';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';

/**
 * Show the Sun/Earth captions only once the camera is closer than a
 * kiloparsec — by then the user has zoomed far past the galaxy and is clearly
 * heading for the solar system. Generous on purpose: it turns the captions on
 * for the last several decades of zoom, where the bodies are still sub-pixel
 * and hardest to find.
 */
export const SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC = 1e-3;

/**
 * The render-origin-relative caption set, built once. `sceneBodyLabels` reads
 * only static seed data, so the anchors never change frame-to-frame — `draw`
 * only rebases them into the current camera-relative frame. Cached at module
 * load rather than rebuilt per frame because the base positions are constant.
 */
const BASE_LABELS: readonly Label[] = sceneBodyLabels();

export const foregroundLabelsLayer: ContentLayer = {
  name: 'foreground-labels',
  slab: NEAR0,
  target: 'swap',
  blend: 'over',

  enabled(state, ctx) {
    const renderer = state.gpu.foregroundLabelRenderer;
    if (renderer === null || renderer.glyphCount() === 0) return false;
    return ctx.cam.distance < SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC;
  },

  draw(pass, view, _ctx, state) {
    const renderer = state.gpu.foregroundLabelRenderer;
    if (renderer === null) return;

    // Rebase into the camera-relative frame in f64 so the f32 upload carries no
    // catastrophic cancellation — see the module header's "f64 seam" note.
    // `view.camPos` is the origin-relative eye (the same frame `view.slab.vp`
    // and the base anchors are built in), so subtracting it here zeroes the
    // view translation `rebaseViewProj` folds into the vp.
    const camPos = view.camPos;

    // Re-express each anchor as a small camera-relative vector. The subtraction
    // is done on the f64 JS numbers before the renderer narrows to f32; storing
    // the raw ~1-AU anchor would already have lost the low-order bits.
    const rebasedLabels = BASE_LABELS.map((label) => ({
      ...label,
      worldPos: [
        label.worldPos[0] - camPos[0],
        label.worldPos[1] - camPos[1],
        label.worldPos[2] - camPos[2],
      ] as Vec3,
    }));
    renderer.setLabels(rebasedLabels);

    // Fold the eye offset into the vp so it pairs with the camera-relative
    // anchors. Uses the slab's f64 `vp`, NOT the f32-narrowed `view.vp`.
    const rebasedVp = rebaseViewProj(view.slab.vp, camPos);
    renderer.draw(pass, rebasedVp, view.viewportPx);
  },
};
