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
 * `enabled` gates on the `planetRenderer` GPU handle (null pre-bootstrap),
 * the shared near-field distance gate (`FOREGROUND_MAX_DISTANCE_MPC` —
 * beyond it every planet is a deep-sub-pixel speck, and gating with the
 * NEAR0 siblings lets the executor skip the whole foreground pass group as
 * empty), a non-empty seeded planet list, AND at least one seeded body
 * clearing `SUB_PIXEL_BODY_CULL_PX` from the current camera position — a row
 * whose pack loop would skip every body must not stay in the pass plan just
 * because the loop's own `n > 0` guard makes the eventual draw call a no-op;
 * the executor still opens the render pass and the group-membership check for
 * it. `enabled` and `draw`'s pack loop share ONE per-body predicate
 * (`planetResolvesPx`, below) so the two sites cannot silently disagree about
 * which bodies are sub-pixel. `draw` re-checks the handle so a stale call is
 * a harmless no-op.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { PlanetBody } from '../../../../@types/scene/PlanetBody';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { bodyApparentDiameterPx } from '../../../../utils/scene/bodyApparentDiameterPx';
import { MAX_PLANETS, INSTANCE_FLOATS } from '../../../gpu/renderers/bodies/planetRenderer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { SUB_PIXEL_BODY_CULL_PX } from '../subPixelBodyCullPx';

// Reused across frames — the engine hot path allocates nothing here. Sized for
// the renderer's cap; each planet's 24-float record (MVP + albedo + pad +
// sunDirLocal + pad) is rewritten in place before the single instanced draw.
const staging = new Float32Array(MAX_PLANETS * INSTANCE_FLOATS);

// The single per-body sub-pixel test `enabled` and `draw`'s pack loop both
// call — by construction the two sites cannot drift apart on which bodies
// count as sub-pixel. `bodyApparentDiameterPx` owns the degenerate distance-0
// case (camera INSIDE the body → Infinity → resolved), so this stays a plain
// threshold comparison with no special-case branch.
function planetResolvesPx(
  planet: PlanetBody,
  camPos: Readonly<Vec3>,
  viewportHeightPx: number,
  fovYRad: number,
): boolean {
  const diameterPx = bodyApparentDiameterPx({
    positionMpc: planet.positionMpc,
    radiusKm: planet.radiusKm,
    camPosMpc: camPos,
    viewportHeightPx,
    fovYRad,
  });
  return diameterPx >= SUB_PIXEL_BODY_CULL_PX;
}

export const planetsLayer: ContentLayer = {
  name: 'planets',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx) {
    // Handle first, distance second, bodies last: the handle check
    // short-circuits so pre-bootstrap fixtures (null renderer, bare ctx, no
    // bodies bag) never touch ctx or state.data. The target is a
    // bootstrap-guaranteed renderTargets row.
    if (state.gpu.planetRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    const planets = state.data.bodies.planets;
    if (planets.length === 0) return false;
    // A row that would pack zero bodies must not stay in the pass plan (see
    // the module header): mirror draw's pack loop with the shared predicate,
    // and bail as soon as one body resolves.
    return planets.some((planet) =>
      planetResolvesPx(planet, ctx.drawCamPos, ctx.canvasSize.height, ctx.fovYRad),
    );
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.planetRenderer;
    if (renderer === null) return;
    const planets = state.data.bodies.planets;
    const limit = Math.min(planets.length, MAX_PLANETS);

    // Pack one 24-float instance record per RESOLVED planet: floats 0..15 the
    // MVP composed from the slab's f64 vp (see the module header's "f64 seam"
    // note), 16..18 the albedo, 19 the pad, 20..22 the sun direction rotated
    // into the body's local frame, 23 the pad. Then ONE instanced draw. Bodies
    // under SUB_PIXEL_BODY_CULL_PX apparent diameter are skipped — a
    // sub-pixel sphere adds nothing the star backdrop doesn't (see that
    // constant's docblock) — so `n` counts only the packed records. Unlike
    // earthLayer this cull is per-body, not whole-layer: the planets span
    // AU-to-lunar distances, so one resolving while another is sub-pixel is
    // the normal case, and a whole-layer test would either draw all or cull
    // all.
    let n = 0;
    for (let i = 0; i < limit; i++) {
      const planet = planets[i]!;
      if (!planetResolvesPx(planet, ctx.drawCamPos, view.viewportPx[1], ctx.fovYRad)) continue;
      const mvp = composeBodyMvp(
        view.slab.vp,
        planet.positionMpc,
        RENDER_ORIGIN_MPC,
        planet.radiusKm * SCALE_UNITS.KM_TO_MPC,
        planet.orientation,
      );
      // Rotate the sun direction into the body's local frame (its baked
      // orientation carries any axial tilt) so the fragment's Lambert term
      // stays a plain co-framed dot product — same rotate earthLayer does.
      const sun = sunDirLocal(planet.positionMpc, RENDER_ORIGIN_MPC, planet.orientation);
      const base = n * INSTANCE_FLOATS;
      staging.set(mvp, base);
      staging[base + 16] = planet.albedo[0];
      staging[base + 17] = planet.albedo[1];
      staging[base + 18] = planet.albedo[2];
      staging[base + 19] = 0; // albedo pad — kept zeroed across frames
      staging[base + 20] = sun[0];
      staging[base + 21] = sun[1];
      staging[base + 22] = sun[2];
      staging[base + 23] = 0; // sunDir pad — kept zeroed across frames
      n++;
    }
    if (n > 0) renderer.draw(pass, staging, n);
  },
};
