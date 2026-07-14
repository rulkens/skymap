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
 * `enabled` gates on TWO handles — the `earthRenderer` GPU handle (null in the
 * pre-bootstrap window) AND the seeded `bodies.earth` record (null until the
 * scene-body seed installs it) — plus the shared near-field distance gate
 * (`FOREGROUND_MAX_DISTANCE_MPC`): beyond it Earth is a deep-sub-pixel speck
 * at the galactic centre, and gating here (with every NEAR0 sibling) lets the
 * executor skip the whole foreground pass group as empty. Inside that gate a
 * sub-pixel cull (`SUB_PIXEL_BODY_CULL_PX`) still applies: Earth spends most
 * of the descent under a pixel across, where the sphere draw adds nothing the
 * star-point backdrop doesn't already show. The `foreground:0` target is a
 * bootstrap-guaranteed `renderTargets` row, so there is no separate
 * offscreen-null gate. `draw` re-checks both handles so a stale call is a
 * harmless no-op.
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
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { SUB_PIXEL_BODY_CULL_PX } from '../subPixelBodyCullPx';

export const earthLayer: ContentLayer = {
  name: 'earth',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx) {
    // Handle first (pre-bootstrap fixtures carry a bare ctx), then the shared
    // near-field distance gate, then the seeded body. The target is a
    // bootstrap-guaranteed renderTargets row.
    if (state.gpu.earthRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    const earth = state.data.bodies.earth;
    if (earth === null) return false;
    // Sub-pixel cull: below SUB_PIXEL_BODY_CULL_PX apparent diameter the
    // sphere cannot resolve, so drop the layer from the pass plan entirely
    // (see that constant's docblock). Earth is the layer's only body, so the
    // whole-layer gate is exact — unlike planetsLayer, whose per-body cull
    // lives in its pack loop. A zero camera-to-centre distance means the
    // camera is INSIDE the body — apparentSizePx defensively returns 0
    // there, which would read as sub-pixel, so treat it as resolved.
    const dx = earth.positionMpc[0] - ctx.drawCamPos[0];
    const dy = earth.positionMpc[1] - ctx.drawCamPos[1];
    const dz = earth.positionMpc[2] - ctx.drawCamPos[2];
    const distanceMpc = Math.hypot(dx, dy, dz);
    if (distanceMpc === 0) return true;
    const diameterPx = apparentSizePx({
      diameterKpc: (2 * earth.radiusKm * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC,
      distanceMpc,
      viewportHeightPx: ctx.canvasSize.height,
      fovYRad: ctx.fovYRad,
    });
    return diameterPx >= SUB_PIXEL_BODY_CULL_PX;
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
