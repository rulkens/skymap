/**
 * foregroundLabelsLayer — name captions for the true-scale foreground bodies.
 *
 * A near-field sibling of `labelsLayer` that draws a SECOND MSDF label
 * renderer (`state.gpu.foregroundLabelRenderer`) holding the Sun/Earth
 * captions. It exists as its own row because the two label sets can't share
 * one draw call: one renderer draws with one view-projection, and these two
 * project through different slabs.
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
 * ### Why gated on camera distance
 *
 * The captions are navigation aids for the final descent toward the Sun. Above
 * galaxy scale the two bodies are an irrelevant speck at the galactic centre,
 * and a permanent floating 'Sun'/'Earth' caption there would just clutter the
 * normal view — so the row stays dark until the camera has zoomed well past
 * galaxy scale.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';

/**
 * Show the Sun/Earth captions only once the camera is closer than a
 * kiloparsec — by then the user has zoomed far past the galaxy and is clearly
 * heading for the solar system. Generous on purpose: it turns the captions on
 * for the last several decades of zoom, where the bodies are still sub-pixel
 * and hardest to find.
 */
export const SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC = 1e-3;

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
    // `view.vp` is the near0 slab's f64 vp already narrowed to f32 by
    // `slabViewOf` — and f32 is amply precise for a caption anchor at the
    // zooms where this gate opens (the camera is ~1 AU away), so this row
    // consumes the narrowed vp rather than the f64 seam `debugSpheresLayer`
    // needs for sub-radius body placement.
    state.gpu.foregroundLabelRenderer!.draw(pass, view.vp, view.viewportPx);
  },
};
