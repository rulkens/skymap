/**
 * planetsLayer — the seeded planets (Moon, Jupiter) as true-scale, flat-lit
 * albedo spheres in the depth-bearing `foreground:0` target.
 *
 * ### What it draws
 *
 * One sphere per entry in `state.data.bodies.planets`, composed as a unit
 * sphere scaled to the body's radius (`radiusKm` → Mpc via
 * `SCALE_UNITS.KM_TO_MPC`) and translated to its `positionMpc`, in the
 * `RENDER_ORIGIN_MPC`-relative frame, tinted by its flat `albedo`.
 *
 * ### Why one renderer instance PER planet
 *
 * `planetRenderer.draw` writes MVP+albedo into a single non-dynamic uniform
 * buffer, so two same-frame draws through one instance would race
 * `queue.writeBuffer` against the pending submit — both planets would render
 * with the LAST-written matrix (the documented writeBuffer-vs-submit
 * landmine). `state.gpu.planetRenderers` therefore holds one instance per
 * seeded planet, index-aligned with `bodies.planets`: `initGpu` maps the
 * seeded list to renderers at construction, and this layer draws body `i`
 * through `renderers[i]`. The `Math.min` bound below keeps a hypothetical
 * later re-seed from indexing past either list; the aligned lengths are the
 * construction-time contract.
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Same seam as `earthLayer` / `starSpheresLayer`: near-field sphere bodies
 * sit AU-to-parsec distances from the render origin — tiny Mpc numbers the
 * VP's large translation nearly cancels. `composeBodyMvp` resolves that
 * cancellation in double precision BEFORE narrowing to f32; feeding it the
 * already-narrowed `view.vp` would misplace a body by more than its radius.
 * See `composeBodyMvp`'s module header.
 *
 * ### When it draws
 *
 * `enabled` gates on the `planetRenderers` GPU handle (null pre-bootstrap)
 * AND a non-empty seeded planet list. The `foreground:0` target is a
 * bootstrap-guaranteed `renderTargets` row, so those are the only gates;
 * `draw` re-checks the handle so a stale call is a harmless no-op.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';

export const planetsLayer: ContentLayer = {
  name: 'planets',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state) {
    // Handle first, bodies second: the handle check short-circuits so
    // pre-bootstrap fixtures (null renderers, no bodies bag) never touch
    // state.data. The target is a bootstrap-guaranteed renderTargets row.
    const renderers = state.gpu.planetRenderers;
    return renderers !== null && renderers.length > 0 && state.data.bodies.planets.length > 0;
  },

  draw(pass, view, _ctx, state) {
    const renderers = state.gpu.planetRenderers;
    if (renderers === null) return;
    const planets = state.data.bodies.planets;

    // Compose each planet's MVP from the slab's f64 vp — see the module
    // header's "f64 seam" note — and draw body i through ITS OWN renderer
    // instance (the per-planet-instance contract in the header).
    const count = Math.min(renderers.length, planets.length);
    for (let i = 0; i < count; i++) {
      const planet = planets[i]!;
      const mvp = composeBodyMvp(
        view.slab.vp,
        planet.positionMpc,
        RENDER_ORIGIN_MPC,
        planet.radiusKm * SCALE_UNITS.KM_TO_MPC,
      );
      renderers[i]!.draw(pass, mvp, planet.albedo);
    }
  },
};
