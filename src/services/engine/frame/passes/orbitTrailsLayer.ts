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
 * skip the whole `(hdr, NEAR0)` render step as empty. That distance gate is
 * the coarse OUTER cull. On top of it the draw loop applies a per-orbit CPU
 * `orbitTrailFade`: it also culls the orbits the camera is INSIDE of (whose
 * projected conic degenerates into a screen-filling wedge) and the ones that
 * are sub-pixel, and it hands the surviving orbits a smooth fade so they
 * appear/disappear instead of popping. The orbits are static module-level
 * seeds (`SCENE_ORBIT_CONICS`, derived once from the orbital elements), so
 * there is no data gate.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCENE_ORBIT_CONICS } from '../../../../data/bodies/sceneOrbitConics';
import { composeOrbitConic } from '../../../../utils/camera/composeOrbitConic';
import { orbitTrailFade } from '../../../../utils/camera/orbitTrailFade';
import { MAX_ORBITS, INSTANCE_FLOATS } from '../../../gpu/renderers/orbitTrailRenderer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';

// Reused across frames — the engine hot path allocates nothing here. Sized
// for the renderer's cap; each conic's 20-float record (three Ginv columns +
// colour/eccentricity + mean anomaly + fade) is rewritten in place before the
// single instanced draw.
const staging = new Float32Array(MAX_ORBITS * INSTANCE_FLOATS);

// Below this the per-orbit fade is effectively zero — the orbit is either
// sub-pixel or the camera is inside it. Skip composing/uploading a degenerate
// Ginv for one rather than draw an invisible (or screen-filling) instance.
const FADE_EPSILON = 1e-3;

export const orbitTrailsLayer: ContentLayer = {
  name: 'orbit-trails',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    // Handle first (pre-bootstrap fixtures carry a bare ctx), then the shared
    // near-field distance gate. SCENE_ORBIT_CONICS is a static module-level
    // table (derived once from the elements), so there is no data condition.
    return state.gpu.orbitTrailRenderer !== null && ctx.cam.distance < FOREGROUND_MAX_DISTANCE_MPC;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.orbitTrailRenderer;
    if (renderer === null) return;
    const n = Math.min(SCENE_ORBIT_CONICS.length, MAX_ORBITS);

    // Pack one 20-float instance record per DRAWN conic (byte offsets mirror
    // the renderer's INSTANCE_ATTRIBUTES):
    //   floats 0..11  — the three Ginv columns (loc1/2/3 at byte 0/16/32),
    //                    composed from the slab's f64 vp (the hard invariant
    //                    in the module header),
    //   floats 12..15 — colour.rgb + eccentricity (loc4 at byte 48),
    //   floats 16..19 — mean anomaly + fade + pad×2 (loc5 at byte 64);
    //                    float 17 is the per-orbit visibility fade (was pad).
    // The fade is computed FIRST from camera-to-orbit geometry: orbits below
    // the floor (camera inside → degenerate conic, or sub-pixel) are skipped
    // entirely so we never compose/upload a degenerate Ginv, and a running
    // write index keeps the packed count equal to the number actually drawn.
    // Then ONE instanced draw.
    let count = 0;
    for (let i = 0; i < n; i++) {
      const conic = SCENE_ORBIT_CONICS[i]!;
      const fade = orbitTrailFade(
        view.camPos,
        conic.centerMpc,
        conic.semiMajorMpc,
        RENDER_ORIGIN_MPC,
        ctx.drawPxPerRad,
      );
      // Below the floor the orbit is either sub-pixel or the camera is inside
      // it — a degenerate, screen-filling homography. Skip it: never compose/
      // upload a Ginv for one, and don't count it toward the instanced draw.
      if (fade <= FADE_EPSILON) continue;

      const ginv = composeOrbitConic(
        view.slab.vp,
        conic.centerMpc,
        conic.semiMajorMpc,
        conic.semiMinorMpc,
        view.viewportPx,
        RENDER_ORIGIN_MPC,
      );
      const base = count * INSTANCE_FLOATS;
      staging.set(ginv, base); // Ginv columns → floats 0..11
      staging[base + 12] = conic.color[0];
      staging[base + 13] = conic.color[1];
      staging[base + 14] = conic.color[2];
      staging[base + 15] = conic.eccentricity;
      staging[base + 16] = conic.meanAnomalyRad;
      staging[base + 17] = fade; // → phase.y → in.fade (was pad)
      staging[base + 18] = 0;
      staging[base + 19] = 0;
      count++;
    }
    if (count > 0) renderer.draw(pass, staging, count);
  },
};
