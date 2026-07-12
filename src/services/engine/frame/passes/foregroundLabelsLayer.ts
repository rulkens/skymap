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
 * ### Why a SECOND marker-line renderer for the leader lines
 *
 * Each caption hangs off its body on a short leader line — the famous-galaxy
 * treatment (`liftedLabelPlacement`), brought to the foreground so a scene-body
 * name reads like a nearby galaxy label instead of a tiny tag painted over the
 * body. Those connectors draw through `state.gpu.foregroundMarkerLineRenderer`,
 * a SEPARATE `createMarkerLineRenderer` instance from the director's
 * `markerLineRenderer` — for the identical reason the captions use a second
 * label renderer. The director's lines project through the galaxy-scale COSMO
 * `vp`, whose 10-kpc near plane clips the AU-scale bodies away; these connectors
 * must project through the NEAR0 slab so they track the bodies, and one renderer
 * draws with one view-projection. So the split is the same slab tension, not a
 * duplicated concern. Both foreground renderers are driven from THIS layer's
 * one draw (connectors first so the glyphs composite over them), sharing a
 * single placement pass so the caption anchor and its connector can never drift.
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
 * The leader-line connectors ride the SAME rebase. Their geometry is derived
 * (`liftedLabelPlacement`) from the already-rebased anchor and `rebasedVp`, so
 * both endpoints come back camera-relative in that same frame — they are handed
 * to `foregroundMarkerLineRenderer.draw` with `rebasedVp`, never re-projected
 * from a raw ~1-AU world point. Feeding the renderer the un-rebased anchors
 * would reintroduce exactly the origin-distance cancellation the captions dodge.
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
import type { MarkerLine } from '../../../../@types/rendering/MarkerLine';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import type { SceneBodyLabel } from '../../presentation/sceneBodyLabels';
import { sceneBodyLabels } from '../../presentation/sceneBodyLabels';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { liftedLabelPlacement } from '../../presentation/liftedLabelPlacement';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { FAMOUS_LABEL_STYLE } from '../../presentation/famousLabelStyle';

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
 * The narrowed `SceneBodyLabel` element type carries the producer's guarantee
 * that colour / em / clamps are always authored, so the loop below hands them
 * to `liftedLabelPlacement` (which requires plain numbers) without defensive
 * fallbacks.
 */
const BASE_LABELS: readonly SceneBodyLabel[] = sceneBodyLabels();

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

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.foregroundLabelRenderer;
    if (renderer === null) return;
    const lineRenderer = state.gpu.foregroundMarkerLineRenderer;

    // Rebase into the camera-relative frame in f64 so the f32 upload carries no
    // catastrophic cancellation — see the module header's "f64 seam" note.
    // `view.camPos` is the origin-relative eye (the same frame `view.slab.vp`
    // and the base anchors are built in), so subtracting it here zeroes the
    // view translation `rebaseViewProj` folds into the vp.
    const camPos = view.camPos;
    const viewportPx = view.viewportPx;

    // Fold the eye offset into the vp ONCE. Uses the slab's f64 `vp`, NOT the
    // f32-narrowed `view.vp`. Reused as the projection for the leader-line
    // placement AND for both renderers' draw, so the captions and their
    // connectors share one frame.
    const rebasedVp = rebaseViewProj(view.slab.vp, camPos);

    const liftedLabels: Label[] = [];
    const lines: MarkerLine[] = [];

    for (const label of BASE_LABELS) {
      // Re-express the anchor as a small camera-relative vector. The
      // subtraction is done on the f64 JS numbers before the renderer narrows
      // to f32; storing the raw ~1-AU anchor would already have lost the
      // low-order bits.
      const anchor: Vec3 = [
        label.worldPos[0] - camPos[0],
        label.worldPos[1] - camPos[1],
        label.worldPos[2] - camPos[2],
      ];

      // The body's apparent on-screen size drives the proportional lift, same
      // as a famous galaxy's apparent diameter. The em height is the body's
      // radius in Mpc (`sceneBodyLabels`), so its diameter is `2 · worldEmMpc`.
      const distanceMpc = Math.hypot(anchor[0], anchor[1], anchor[2]);
      const subjectSizePx = apparentSizePx({
        diameterKpc: (2 * label.worldEmMpc) / SCALE_UNITS.KPC_TO_MPC,
        distanceMpc,
        viewportHeightPx: viewportPx[1],
        fovYRad: ctx.fovYRad,
      });

      // The single lifted-label chain (see `liftedLabelPlacement`) — identical
      // to the famous + Milky-Way producers: screen-space proportional lift
      // with the MIN_LABEL_CLEARANCE_PX ink-bottom guarantee (load-bearing for
      // the top-aligned sun/moon captions, whose glyph block hangs below the
      // anchor), connector top derived from the measured text bottom minus the
      // shared padding. Projecting through the already-rebased anchor + `rebasedVp`
      // means both endpoints come back in the SAME camera-relative frame, so
      // they pair with `rebasedVp` at draw with no second rebase.
      const placement = liftedLabelPlacement({
        anchorWorldPos: anchor,
        vp: rebasedVp,
        viewportPx,
        subjectSizePx,
        textBbox: renderer.measure(label),
        worldEmMpc: label.worldEmMpc,
        minPixelSize: label.minPixelSize,
        maxPixelSize: label.maxPixelSize,
      });

      // Behind the camera the projection is undefined. Keep the caption in the
      // set at its unlifted anchor (the shader clips it anyway) rather than
      // dropping it, so `glyphCount()` stays constant and the layer's
      // `enabled` gate — which reads the last-set glyph count — never latches
      // off. There is no valid projection to derive a connector from, so none
      // is emitted for it.
      if (placement === null) {
        liftedLabels.push({ ...label, worldPos: anchor });
        continue;
      }

      liftedLabels.push({ ...label, worldPos: placement.labelWorldPos });
      if (placement.line !== null) {
        lines.push({
          id: `${label.id}-anchor`,
          fromWorld: placement.line.fromWorld,
          toWorld: placement.line.toWorld,
          // Adopt the famous connector width for parity; tint the line with the
          // caption's own colour so each connector reads as part of its body's
          // caption (straight RGBA == premultiplied at the captions' constant
          // alpha 1).
          pixelWidth: FAMOUS_LABEL_STYLE.pixelWidth,
          color: [...label.color],
        });
      }
    }

    renderer.setLabels(liftedLabels);

    // Draw the connectors BEFORE the captions so the glyphs composite OVER the
    // line where they meet — the same ordering `markerLinesLayer` keeps ahead
    // of `labelsLayer`. Both renderers target the swap chain, so the two draws
    // share this one render pass. The line renderer is null-checked: it is an
    // optional bootstrap resource like the caption renderer, and a null handle
    // just skips the connectors while the captions still draw.
    if (lineRenderer !== null) {
      lineRenderer.setLines(lines);
      lineRenderer.draw(pass, rebasedVp, viewportPx);
    }
    renderer.draw(pass, rebasedVp, viewportPx);
  },
};
