/**
 * earthLayer — the true-scale, Blue-Marble-textured Earth as a content-layer
 * row drawing into the depth-bearing `foreground:0` target.
 *
 * ### What it draws
 *
 * The single seeded `bodies.earth` record, composed as a unit sphere scaled to
 * the body's radius (`radiusKm` → Mpc via `SCALE_UNITS.KM_TO_MPC`) and
 * translated to its `positionMpc`, in the `RENDER_ORIGIN_MPC`-relative frame.
 * `earthRenderer.draw` writes the MVP into its single (non-dynamic) uniform
 * buffer and issues one indexed draw — so this row must draw the Earth AT MOST
 * once per frame (the renderer's own header spells out the `writeBuffer`-vs-
 * `submit` race a second same-frame draw with a different MVP would trigger).
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Like the other sphere-body layers (`starSpheresLayer`, `planetsLayer`),
 * this is a near-field body that reads the slab's `Float64Array`
 * view-projection (`view.slab.vp`) rather than the f32-narrowed
 * `view.vp` every cosmological layer consumes. Earth sits ~1 AU ≈ 4.85e-12 Mpc
 * from the render origin, a tiny number the VP's large translation nearly
 * cancels. `composeBodyMvp` must resolve that cancellation in double precision
 * BEFORE narrowing to f32 — feeding it `view.vp` (already narrowed by
 * `slabViewOf`) would resolve the cancellation after the low-order bits are
 * gone, silently mis-placing Earth by more than its own radius. See
 * `composeBodyMvp`'s module header for the full compose-in-f64-then-narrow
 * argument.
 *
 * ### When it draws
 *
 * `enabled` gates on TWO handles: the `earthRenderer` GPU handle (null in the
 * pre-bootstrap window) AND the seeded `bodies.earth` record (null until the
 * scene-body seed installs it). The `foreground:0` target is a bootstrap-
 * guaranteed `renderTargets` row, so there is no separate offscreen-null gate.
 * `draw` re-checks both so a stale call is a harmless no-op.
 *
 * `RENDER_ORIGIN_MPC` is imported directly as a constant (not threaded through
 * ctx state) — the render origin is fixed at the Sun for the zoom-to-earth
 * fold.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';

export const earthLayer: ContentLayer = {
  name: 'earth',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state) {
    // Both the GPU handle and the seeded body must be present. The target is a
    // bootstrap-guaranteed renderTargets row, so those two are the only gates.
    return state.gpu.earthRenderer !== null && state.data.bodies.earth !== null;
  },

  draw(pass, view, _ctx, state) {
    const renderer = state.gpu.earthRenderer;
    const earth = state.data.bodies.earth;
    if (renderer === null || earth === null) return;

    // Compose the Earth's MVP from the slab's f64 vp — see the module header's
    // "f64 seam" note for why `view.slab.vp` and not `view.vp`. Radius is the
    // authored kilometres resolved into Mpc at the draw site.
    const mvp = composeBodyMvp(
      view.slab.vp,
      earth.positionMpc,
      RENDER_ORIGIN_MPC,
      earth.radiusKm * SCALE_UNITS.KM_TO_MPC,
    );
    renderer.draw(pass, mvp);
  },
};
