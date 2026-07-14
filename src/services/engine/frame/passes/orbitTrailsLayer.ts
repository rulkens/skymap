/**
 * orbitTrailsLayer — the accurate Keplerian orbit trails (Earth / Jupiter /
 * Moon) as additive screen-space conics in the depthless HDR accumulation.
 * The conic orbit-trail content-layer row (spec §6).
 *
 * ### Row shape: (hdr, NEAR0), additive — like star-points
 *
 * The orbits live at AU-to-lunar scale, far inside COSMO's 0.01 Mpc near
 * plane, so this row projects through NEAR0 (whose near/far track the
 * camera's orbit distance) while still accumulating into the HDR target so
 * the trails ride the same tone-map as everything else. The frame program's
 * existing `(hdr, NEAR0)` render step drives it — same group as
 * `starPointsLayer`, no new program step.
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Same seam as `planetsLayer` and the ring twin: the ellipse centres sit
 * AU-to-lunar distances (~1e-12 Mpc) from the render origin — tiny numbers
 * the VP's large translation column nearly cancels. `composeOrbitConic`
 * resolves that cancellation in double precision (it assembles and INVERTS
 * the full homography in f64) BEFORE narrowing to f32; feeding it the
 * already-narrowed `view.vp` would misplace a trail by far more than its
 * stroke width. This is a HARD INVARIANT — see `composeOrbitConic`'s module
 * header.
 *
 * ### When it draws
 *
 * `enabled` gates on the `orbitTrailRenderer` GPU handle (null in the
 * pre-bootstrap window) AND the shared near-field distance gate
 * (`FOREGROUND_MAX_DISTANCE_MPC`) — beyond it every AU-to-lunar-scale trail
 * is deep sub-pixel, and gating with the NEAR0 siblings lets the executor
 * skip the whole `(hdr, NEAR0)` render step as empty. Within that gate, each
 * orbit is culled or faded PER-ORBIT by its apparent on-screen diameter: below
 * `CULL_PX` it is skipped from the draw entirely (deep sub-pixel aliasing, not
 * a legible path), and from there up to `FULL_PX` its brightness ramps in so it
 * does not pop. The degenerate case (camera on/inside an orbit, so the
 * projected conic fills the viewport) is handled in the fragment, which
 * discards every off-stroke, horizon, and non-finite pixel, so a degenerate
 * orbit paints only its (possibly huge) arc, never a filled blob. The orbits
 * are static module-level seeds (`SCENE_ORBIT_CONICS`, derived once from the
 * orbital elements), so there is no data gate.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCENE_ORBIT_CONICS } from '../../../../data/bodies/sceneOrbitConics';
import { composeOrbitConic } from '../../../../utils/camera/composeOrbitConic';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { MAX_ORBITS, INSTANCE_FLOATS } from '../../../gpu/renderers/bodies/orbitTrailRenderer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';

// Apparent-size fade band, in on-screen orbit DIAMETER pixels. Below CULL_PX an
// orbit is deep sub-pixel noise (aliasing, not a legible path), so it is dropped
// from the draw entirely; from CULL_PX up to FULL_PX its brightness ramps in, so
// it does not pop into existence. Kpc because apparentSizePx wants a kpc diameter
// (1 Mpc = 1000 kpc).
const CULL_PX = 10;
const FULL_PX = 20;

// Reused across frames — the engine hot path allocates nothing here. Sized
// for the renderer's cap; each conic's 20-float record (three Ginv columns +
// colour/eccentricity + mean anomaly) is rewritten in place before the single
// instanced draw.
const staging = new Float32Array(MAX_ORBITS * INSTANCE_FLOATS);

// The system's reach from the heliocentric origin: the farthest any orbit
// extends is its centre offset plus its semi-major axis. Precomputed once
// (the conic table is static) so `enabled` can bound EVERY orbit's apparent
// size with one comparison instead of walking the table per frame.
const MAX_ORBIT_EXTENT_MPC = Math.max(
  ...SCENE_ORBIT_CONICS.map(
    (conic) =>
      Math.hypot(conic.centerMpc[0], conic.centerMpc[1], conic.centerMpc[2]) +
      Math.hypot(conic.semiMajorMpc[0], conic.semiMajorMpc[1], conic.semiMajorMpc[2]),
  ),
);

export const orbitTrailsLayer: ContentLayer = {
  name: 'orbit-trails',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    // Handle first (pre-bootstrap fixtures carry a bare ctx), then the shared
    // near-field distance gate. SCENE_ORBIT_CONICS is a static module-level
    // table (derived once from the elements), so there is no data condition.
    if (state.gpu.orbitTrailRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    // Whole-layer sub-pixel cull, the conservative bound of the per-orbit
    // CULL_PX loop in `draw`: at the camera's NEAREST possible distance to
    // any orbit point (origin distance minus the system's reach — clamped to
    // 0 when the camera is at/inside the reach, which always stays enabled),
    // even the LARGEST orbit's apparent diameter is an upper bound for every
    // orbit. Below CULL_PX for that bound, the draw loop would cull every
    // conic anyway — gating here lets the executor drop the layer instead of
    // packing zero records.
    const nearestMpc = Math.max(
      Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]) - MAX_ORBIT_EXTENT_MPC,
      0,
    );
    if (nearestMpc > 0) {
      const maxDiameterPx = apparentSizePx({
        diameterKpc: 2 * MAX_ORBIT_EXTENT_MPC * 1000,
        distanceMpc: nearestMpc,
        viewportHeightPx: ctx.canvasSize.height,
        fovYRad: ctx.fovYRad,
      });
      if (maxDiameterPx < CULL_PX) return false;
    }
    return true;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.orbitTrailRenderer;
    if (renderer === null) return;
    const limit = Math.min(SCENE_ORBIT_CONICS.length, MAX_ORBITS);
    const camPos = ctx.drawCamPos;
    const viewportHeightPx = view.viewportPx[1];

    // Pack one 20-float instance record per VISIBLE conic (byte offsets mirror
    // the renderer's INSTANCE_ATTRIBUTES):
    //   floats 0..11  — the three Ginv columns (loc1/2/3 at byte 0/16/32),
    //                    composed from the slab's f64 vp (the hard invariant
    //                    in the module header),
    //   floats 12..15 — colour.rgb + eccentricity (loc4 at byte 48),
    //   floats 16..19 — mean anomaly + fade alpha + pad×2 (loc5 at byte 64).
    // Orbits below the apparent-size cull threshold are skipped entirely (not
    // drawn), so `n` counts only the packed records; the rest fade in via the
    // alpha the fragment multiplies through. The fragment's Newton horizon
    // rejection is what keeps a near-edge-on orbit a thin line, not a blob.
    let n = 0;
    for (let i = 0; i < limit; i++) {
      const conic = SCENE_ORBIT_CONICS[i]!;
      // Apparent on-screen diameter: 2·|semiMajor| across, at the camera's
      // distance to the ellipse centre.
      const dx = conic.centerMpc[0] - camPos[0];
      const dy = conic.centerMpc[1] - camPos[1];
      const dz = conic.centerMpc[2] - camPos[2];
      const distanceMpc = Math.hypot(dx, dy, dz);
      const semiMajorMpc = Math.hypot(
        conic.semiMajorMpc[0],
        conic.semiMajorMpc[1],
        conic.semiMajorMpc[2],
      );
      const diameterPx = apparentSizePx({
        diameterKpc: 2 * semiMajorMpc * 1000,
        distanceMpc,
        viewportHeightPx,
        fovYRad: ctx.fovYRad,
      });
      if (diameterPx < CULL_PX) continue; // deep sub-pixel — do not render
      const alpha = Math.min(1, (diameterPx - CULL_PX) / (FULL_PX - CULL_PX));

      const ginv = composeOrbitConic(
        view.slab.vp,
        conic.centerMpc,
        conic.semiMajorMpc,
        conic.semiMinorMpc,
        view.viewportPx,
        RENDER_ORIGIN_MPC,
      );
      const base = n * INSTANCE_FLOATS;
      staging.set(ginv, base); // Ginv columns → floats 0..11
      staging[base + 12] = conic.color[0];
      staging[base + 13] = conic.color[1];
      staging[base + 14] = conic.color[2];
      staging[base + 15] = conic.eccentricity;
      staging[base + 16] = conic.meanAnomalyRad;
      staging[base + 17] = alpha;
      staging[base + 18] = 0; // trailing pad — kept zeroed across frames
      staging[base + 19] = 0;
      n++;
    }
    if (n > 0) renderer.draw(pass, staging, n);
  },
};
