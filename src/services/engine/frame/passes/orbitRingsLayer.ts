/**
 * orbitRingsLayer — the debug orbit rings (Earth / Jupiter / Moon) as
 * additive SDF annuli in the depthless HDR accumulation.
 *
 * ### Row shape: (hdr, NEAR0), additive — like star-points
 *
 * The orbits live at AU-to-lunar scale, far inside COSMO's 0.01 Mpc near
 * plane, so this row projects through NEAR0 (whose near/far track the
 * camera's orbit distance) while still accumulating into the HDR target so
 * the rings ride the same tone-map as everything else. The frame program's
 * existing `(hdr, NEAR0)` render step drives it — same group as
 * `starPointsLayer`, no new program step.
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Same seam as `planetsLayer`: the ring centres sit AU-to-lunar distances
 * from the render origin — tiny Mpc numbers the VP's large translation
 * nearly cancels. `composeOrbitMvp` resolves that cancellation in double
 * precision BEFORE narrowing to f32; feeding it the already-narrowed
 * `view.vp` would misplace a ring by far more than its stroke width. This
 * is a HARD INVARIANT — see `composeOrbitMvp`'s module header.
 *
 * ### When it draws
 *
 * `enabled` gates on the `orbitRingRenderer` GPU handle alone (null in the
 * pre-bootstrap window): the orbits are static module-level seeds
 * (`SCENE_ORBITS` always holds the three rings), so there is no data gate.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCENE_ORBITS } from '../../../../data/bodies/sceneOrbits';
import { composeOrbitMvp } from '../../../../utils/camera/composeOrbitMvp';
import { MAX_ORBITS, INSTANCE_FLOATS } from '../../../gpu/renderers/orbitRingRenderer';

// Reused across frames — the engine hot path allocates nothing here. Sized
// for the renderer's cap; each ring's 20-float record (MVP + colour + pad) is
// rewritten in place before the single instanced draw.
const staging = new Float32Array(MAX_ORBITS * INSTANCE_FLOATS);

export const orbitRingsLayer: ContentLayer = {
  name: 'orbit-rings',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state) {
    // Handle-only gate: SCENE_ORBITS is a static module-level table (always
    // three rings), so the renderer's presence is the whole condition.
    return state.gpu.orbitRingRenderer !== null;
  },

  draw(pass, view, _ctx, state) {
    const renderer = state.gpu.orbitRingRenderer;
    if (renderer === null) return;
    const n = Math.min(SCENE_ORBITS.length, MAX_ORBITS);

    // Pack one 20-float instance record per orbit: floats 0..15 the MVP
    // composed from the slab's f64 vp (the hard invariant in the module
    // header), 16..18 the tint, 19 the pad. Then ONE instanced draw.
    for (let i = 0; i < n; i++) {
      const orbit = SCENE_ORBITS[i]!;
      const mvp = composeOrbitMvp(
        view.slab.vp,
        orbit.centerMpc,
        orbit.uAxis,
        orbit.vAxis,
        orbit.radiusMpc,
        RENDER_ORIGIN_MPC,
      );
      const base = i * INSTANCE_FLOATS;
      staging.set(mvp, base);
      staging[base + 16] = orbit.color[0];
      staging[base + 17] = orbit.color[1];
      staging[base + 18] = orbit.color[2];
      staging[base + 19] = 0; // trailing pad — kept zeroed across frames
    }
    renderer.draw(pass, staging, n);
  },
};
