/**
 * foregroundLabelsPass — name captions for the true-scale foreground bodies.
 *
 * A sibling of `labelsPass` that draws a SECOND label renderer
 * (`state.gpu.foregroundLabelRenderer`) holding the Sun/Earth captions.  It
 * exists separately because the two label sets can't share one draw call:
 *
 *   - Main labels (galaxies, structures, Milky Way) project with `ctx.vp`,
 *     the galaxy-scale view-projection whose near plane is pinned at
 *     0.01 Mpc.
 *   - The Sun and Earth sit ~1e-13 Mpc from the camera at solar-system
 *     zoom, inside that near plane, so they must project with
 *     `ctx.foregroundVp` — whose near plane is proportional to
 *     `cam.distance` and so always contains them.
 *
 * One renderer draws with one view-projection, so a separate renderer +
 * pass is the natural split.  Both live in `UI_PASSES`, drawn after
 * tone-map onto the swap chain.
 *
 * ### Why gated on camera distance
 *
 * The captions are navigation aids for the final descent toward the Sun.
 * Above galaxy scale the two bodies are an irrelevant speck at the galactic
 * centre, and a permanent floating 'Sun'/'Earth' caption there would just
 * clutter the normal view — so the pass stays dark until the camera has
 * zoomed well past galaxy scale.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';

/**
 * Show the Sun/Earth captions only once the camera is closer than a
 * kiloparsec — by then the user has zoomed far past the galaxy and is
 * clearly heading for the solar system.  Generous on purpose: it turns the
 * captions on for the last several decades of zoom, where the bodies are
 * still sub-pixel and hardest to find.
 */
const SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC = 1e-3;

export const foregroundLabelsPass: Pass = {
  name: 'foreground-labels',

  enabled(state, ctx) {
    const renderer = state.gpu.foregroundLabelRenderer;
    if (renderer === null || renderer.glyphCount() === 0) return false;
    return ctx.cam.distance < SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC;
  },

  draw(pass, ctx, state, _deps) {
    // narrowMat4 drops the f64 foreground view-projection to the f32 the
    // label vertex shader consumes.  At the zoom where the user is hunting
    // for these bodies the camera is ~1 AU away, where f32 is amply precise
    // for a caption anchor (see composeBodyMvp's precision rationale).
    state.gpu.foregroundLabelRenderer!.draw(pass, narrowMat4(ctx.foregroundVp), [
      ctx.canvasSize.width,
      ctx.canvasSize.height,
    ]);
  },
};
