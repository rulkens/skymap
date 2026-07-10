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
 * ### Why one renderer with one instanced draw
 *
 * A single `planetRenderer` draws every seeded planet in ONE instanced
 * `drawIndexed`. This layer packs each body's MVP + albedo into a reused
 * module-level staging array (no per-frame allocation on the engine hot path)
 * and hands the whole batch to `draw`, which uploads it with one
 * `queue.writeBuffer`. Each planet reads its own baked record via the instance
 * step, so nothing races `queue.writeBuffer` against submit — the alternative
 * of a shared per-draw uniform would collapse every planet onto the last one
 * (the writeBuffer-vs-submit landmine). See `planetRenderer`'s header.
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
 * `enabled` gates on the `planetRenderer` GPU handle (null pre-bootstrap)
 * AND a non-empty seeded planet list. The `foreground:0` target is a
 * bootstrap-guaranteed `renderTargets` row, so those are the only gates;
 * `draw` re-checks the handle so a stale call is a harmless no-op.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { MAX_PLANETS, INSTANCE_FLOATS } from '../../../gpu/renderers/planetRenderer';

// Reused across frames — the engine hot path allocates nothing here. Sized for
// the renderer's cap; each planet's 20-float record (MVP + albedo + pad) is
// rewritten in place before the single instanced draw.
const staging = new Float32Array(MAX_PLANETS * INSTANCE_FLOATS);

export const planetsLayer: ContentLayer = {
  name: 'planets',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state) {
    // Handle first, bodies second: the handle check short-circuits so
    // pre-bootstrap fixtures (null renderer, no bodies bag) never touch
    // state.data. The target is a bootstrap-guaranteed renderTargets row.
    return state.gpu.planetRenderer !== null && state.data.bodies.planets.length > 0;
  },

  draw(pass, view, _ctx, state) {
    const renderer = state.gpu.planetRenderer;
    if (renderer === null) return;
    const planets = state.data.bodies.planets;
    const n = Math.min(planets.length, MAX_PLANETS);

    // Pack one 20-float instance record per planet: floats 0..15 the MVP
    // composed from the slab's f64 vp (see the module header's "f64 seam"
    // note), 16..18 the albedo, 19 the pad. Then ONE instanced draw.
    for (let i = 0; i < n; i++) {
      const planet = planets[i]!;
      const mvp = composeBodyMvp(
        view.slab.vp,
        planet.positionMpc,
        RENDER_ORIGIN_MPC,
        planet.radiusKm * SCALE_UNITS.KM_TO_MPC,
      );
      const base = i * INSTANCE_FLOATS;
      staging.set(mvp, base);
      staging[base + 16] = planet.albedo[0];
      staging[base + 17] = planet.albedo[1];
      staging[base + 18] = planet.albedo[2];
      staging[base + 19] = 0; // trailing pad — kept zeroed across frames
    }
    renderer.draw(pass, staging, n);
  },
};
