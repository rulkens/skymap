/**
 * debugSpheresLayer — the true-scale near-field bodies (Sun, Earth) as a
 * content-layer row drawing into the depth-bearing `foreground:0` target.
 *
 * ### What it draws
 *
 * One UV sphere per entry in `DEBUG_SPHERE_BODIES`, composed as a unit sphere
 * scaled to the body's `radiusMpc` and translated to its `positionMpc`, in the
 * `RENDER_ORIGIN_MPC`-relative frame. `debugSphereRenderer.draw` writes each
 * body's MVP into its own dynamic-offset uniform slot so all spheres render
 * with their own matrix in a single submit.
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * This is the ONE layer that reads the slab's `Float64Array` view-projection
 * (`view.slab.vp`) rather than the f32-narrowed `view.vp` every other layer
 * consumes — `SlabView.slab` exists precisely for this rare f64 consumer.
 *
 * Earth sits ~1 AU ≈ 4.85e-12 Mpc from the Sun, a tiny number the VP's large
 * translation nearly cancels. `composeBodyMvp` must resolve that cancellation
 * in double precision BEFORE narrowing to f32 — so it needs the f64 vp.
 * Feeding it `view.vp` (already narrowed by `slabViewOf`) would resolve the
 * cancellation after the low-order bits are gone, silently mis-placing Earth
 * by more than its own radius. See `composeBodyMvp`'s module header for the
 * full compose-in-f64-then-narrow argument.
 *
 * ### When it draws
 *
 * `enabled` gates on the renderer handle alone: the target is a
 * `renderTargets` row (bootstrap-guaranteed behind the ready gate), so there
 * is no separate offscreen-null gate. The handle is null only in the
 * pre-bootstrap window, which `draw` also guards.
 *
 * `RENDER_ORIGIN_MPC` is imported directly as a constant (not threaded through
 * ctx state) — the render origin is fixed at the Sun for the zoom-to-earth
 * fold.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { DEBUG_SPHERE_BODIES } from '../../../../data/bodies/debugSphereBody';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';

export const debugSpheresLayer: ContentLayer = {
  name: 'debug-spheres',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state) {
    // The target is a bootstrap-guaranteed renderTargets row, so the renderer
    // handle is the only gate — non-null once initGpu has run.
    return state.gpu.debugSphereRenderer !== null;
  },

  draw(pass, view, _ctx, state) {
    const renderer = state.gpu.debugSphereRenderer;
    if (renderer === null) return;

    // Compose each body's MVP from the slab's f64 vp — see the module header's
    // "f64 seam" note for why `view.slab.vp` and not `view.vp`.
    const mvps = DEBUG_SPHERE_BODIES.map((body) =>
      composeBodyMvp(view.slab.vp, body.positionMpc, RENDER_ORIGIN_MPC, body.radiusMpc),
    );
    renderer.draw(pass, mvps);
  },
};
