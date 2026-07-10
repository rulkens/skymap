/**
 * starSpheresLayer — the near-partition stars (today: the Sun alone) as
 * true-scale, flat-emissive spheres in the depth-bearing `foreground:0`
 * target.
 *
 * ### What it draws
 *
 * Every seeded star `isNearStar` admits, composed as a unit sphere scaled to
 * the body's radius (`radiusKm` → Mpc via `SCALE_UNITS.KM_TO_MPC`) and
 * translated to its `positionMpc`, in the `RENDER_ORIGIN_MPC`-relative frame,
 * tinted by its spectral-class colour. The partition threshold (one parsec —
 * see `isNearStar`) admits ONLY the Sun from the seed table, which is
 * load-bearing: `starRenderer.draw` writes MVP+colour into a single
 * non-dynamic uniform buffer, so a second same-frame draw would race
 * `queue.writeBuffer` against the pending submit. Plan 03's apparent-size
 * promotion must bring a dynamic-offset (or per-star-instance) upgrade
 * before more than one star can resolve to a sphere.
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Like `earthLayer`, this is a near-field sphere body that reads the slab's
 * `Float64Array` view-projection (`view.slab.vp`) rather than the
 * f32-narrowed `view.vp` every cosmological layer consumes. A sphere placed
 * parsecs (or, for the Sun, zero) from the render origin sits where the VP's
 * large translation nearly cancels the tiny position — `composeBodyMvp` must
 * resolve that cancellation in double precision BEFORE narrowing to f32, or
 * the body lands off by more than its own radius. See `composeBodyMvp`'s
 * module header for the full compose-in-f64-then-narrow argument.
 *
 * ### When it draws
 *
 * `enabled` gates on the `starRenderer` GPU handle (null in the
 * pre-bootstrap window) AND a non-empty near partition of the seeded stars.
 * The `foreground:0` target is a bootstrap-guaranteed `renderTargets` row,
 * so those two are the only gates; `draw` re-checks the handle so a stale
 * call is a harmless no-op.
 *
 * `RENDER_ORIGIN_MPC` is imported directly as a constant (not threaded
 * through ctx state) — the render origin is fixed at the Sun for the
 * zoom-to-earth fold.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { isNearStar } from '../../../../utils/scene/isNearStar';

export const starSpheresLayer: ContentLayer = {
  name: 'star-spheres',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state) {
    // Handle first, partition second: the handle check short-circuits so
    // pre-bootstrap fixtures (null renderer, no bodies bag) never touch
    // state.data. The target is a bootstrap-guaranteed renderTargets row.
    return state.gpu.starRenderer !== null && state.data.bodies.stars.some(isNearStar);
  },

  draw(pass, view, _ctx, state) {
    const renderer = state.gpu.starRenderer;
    if (renderer === null) return;

    // Compose each near star's MVP from the slab's f64 vp — see the module
    // header's "f64 seam" note for why `view.slab.vp` and not `view.vp`.
    // Radius is the authored kilometres resolved into Mpc at the draw site.
    // The one-parsec partition admits only the Sun, so this loop issues at
    // most one draw — the renderer's single-uniform-buffer precondition.
    for (const star of state.data.bodies.stars) {
      if (!isNearStar(star)) continue;
      const mvp = composeBodyMvp(
        view.slab.vp,
        star.positionMpc,
        RENDER_ORIGIN_MPC,
        star.radiusKm * SCALE_UNITS.KM_TO_MPC,
      );
      renderer.draw(pass, mvp, star.color);
    }
  },
};
