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
 * orbit paints only its (possibly huge) arc, never a filled blob.
 *
 * ### Conics re-derive at the frame instant
 *
 * The trails are NOT a baked table: each drawn frame re-derives every orbit at
 * `ctx.simDays` — `keplerianEllipse(propagateElements(elements, simDays))` gives
 * the focus-relative shape, and the absolute centre folds in the focus. A
 * heliocentric orbit's focus is the render origin (the Sun); a moon's focus is
 * its parent's LIVE position, read from the per-frame body snapshot
 * (`sceneBodyStates`) so a moon's trail rides its moving parent. The falloff
 * anchor is the body's PROPAGATED mean anomaly, also read from that one snapshot
 * — so trail and drawn body can never disagree. The derivation is cheap and only
 * runs inside the near-field gate, so it re-runs every frame rather than caching.
 * `ORBITAL_ELEMENTS` is a compile-time table, always present, so there is still
 * no data gate.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { ORBITAL_ELEMENTS, elementsById } from '../../../../data/bodies/orbitalElements';
import type { OrbitalElements } from '../../../../@types/scene/OrbitalElements';
import { propagateElements } from '../../../../utils/orbit/propagateElements';
import { keplerianEllipse } from '../../../../utils/orbit/keplerianEllipse';
import { composeOrbitConic } from '../../../../utils/camera/composeOrbitConic';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { sceneBodyStates } from '../sceneBodyStates';
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
// for the renderer's cap; each conic's 28-float record (three Ginv columns +
// colour/eccentricity + mean anomaly + the two gradient-minor triples) is
// rewritten in place before the single instanced draw.
const staging = new Float32Array(MAX_ORBITS * INSTANCE_FLOATS);

// The system's reach from the heliocentric origin: the farthest any orbit
// point can lie from the origin, over ALL clock times — a TIME-INVARIANT outer
// envelope. A bound orbit's farthest point from its focus is its apoapsis
// a·(1+e); a heliocentric orbit's focus IS the origin, so its reach is a·(1+e).
// A moon's focus rides its parent, whose world position never exceeds the
// parent's own heliocentric apoapsis, so the moon's reach is bounded by
// (parent apoapsis + moon apoapsis) — a value the moon orbit stays inside for
// every t (worst case: both bodies at apoapsis, aligned through the origin).
// Sourced from the static ORBITAL_ELEMENTS a/e, NOT the conic CENTRES: once a
// clock animates the trails a moon centre rides its moving parent, so a
// centre-derived bound would go stale, whereas this element-derived envelope
// holds for every t. Precomputed once so `enabled` bounds EVERY orbit's
// apparent size with one comparison instead of walking the table per frame.
// The bound is conservative (never drops a visible orbit) and only ever ≥ the
// old centre-based value — the intended slight extra slack for moving centres.
function apoapsisMpc(elements: OrbitalElements): number {
  return elements.semiMajorMpc * (1 + elements.eccentricity);
}
function maxHeliocentricReachMpc(elements: OrbitalElements): number {
  const own = apoapsisMpc(elements);
  // Every moon parent is itself heliocentric, so one hop resolves the focus.
  return elements.parentId === null ? own : apoapsisMpc(elementsById(elements.parentId)) + own;
}
const MAX_ORBIT_EXTENT_MPC = Math.max(...ORBITAL_ELEMENTS.map(maxHeliocentricReachMpc));

export const orbitTrailsLayer: ContentLayer = {
  name: 'orbit-trails',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    // Handle first (pre-bootstrap fixtures carry a bare ctx), then the shared
    // near-field distance gate. `ORBITAL_ELEMENTS` is a compile-time table
    // (always present), so there is no data condition — and the apoapsis-derived
    // MAX_ORBIT_EXTENT_MPC bound below is TIME-INVARIANT, so this gate needs no
    // per-frame derivation even though the drawn conics do.
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
    // The per-frame body snapshot (memoized on `ctx.simDays`, shared with the
    // planet/textured-body layers): the source of every moon's parent centre and
    // every trail's mean-anomaly falloff anchor. Reading it — never re-deriving —
    // is what welds each trail to the exact instant its body is drawn at.
    const states = sceneBodyStates(state, ctx);
    const limit = Math.min(ORBITAL_ELEMENTS.length, MAX_ORBITS);
    const camPos = ctx.drawCamPos;
    const viewportHeightPx = view.viewportPx[1];

    // Pack one 28-float instance record per VISIBLE conic (byte offsets mirror
    // the renderer's INSTANCE_ATTRIBUTES):
    //   floats 0..11  — the three Ginv columns (loc1/2/3 at byte 0/16/32),
    //                    composed from the slab's f64 vp (the hard invariant
    //                    in the module header),
    //   floats 12..15 — colour.rgb + eccentricity (loc4 at byte 48),
    //   floats 16..19 — mean anomaly + fade alpha + pad×2 (loc5 at byte 64),
    //   floats 20..23 — gradient minors M1/M2/M3 + pad (loc6 at byte 80),
    //   floats 24..27 — gradient minors M4/M5/M6 + pad (loc7 at byte 96).
    // The minors are the CPU-f64 hoist that keeps the fragment's Sampson
    // gradient affine (no f32 difference-of-products cancellation).
    // Orbits below the apparent-size cull threshold are skipped entirely (not
    // drawn), so `n` counts only the packed records; the rest fade in via the
    // alpha the fragment multiplies through. The fragment's Newton horizon
    // rejection is what keeps a near-edge-on orbit a thin line, not a blob.
    let n = 0;
    for (let i = 0; i < limit; i++) {
      const elements = ORBITAL_ELEMENTS[i]!;
      // Re-derive the conic AT the frame instant: propagate the elements to
      // `ctx.simDays`, then image the unit circle. `keplerianEllipse` returns
      // three FRESH focus-relative vectors per call — the same per-conic distinct
      // arrays the static table used to hold, so composeOrbitConic still receives
      // a distinct centre per orbit (nothing aliases a shared scratch).
      const propagated = propagateElements(elements, ctx.simDays);
      const { centerOffsetMpc, semiMajorMpc, semiMinorMpc } = keplerianEllipse(propagated);
      // Fold the focus into an absolute-world centre, in place on the fresh
      // offset array (no extra allocation): a heliocentric orbit's focus is the
      // render origin (the Sun); a moon's focus is its parent's LIVE snapshot
      // position, so its trail rides the moving parent.
      const focus =
        elements.parentId === null
          ? RENDER_ORIGIN_MPC
          : states.get(elements.parentId)!.positionMpc;
      const centerMpc = centerOffsetMpc;
      centerMpc[0] += focus[0];
      centerMpc[1] += focus[1];
      centerMpc[2] += focus[2];

      // Apparent on-screen diameter: 2·|semiMajor| across, at the camera's
      // distance to the ellipse centre.
      const dx = centerMpc[0] - camPos[0];
      const dy = centerMpc[1] - camPos[1];
      const dz = centerMpc[2] - camPos[2];
      const distanceMpc = Math.hypot(dx, dy, dz);
      const semiMajorLenMpc = Math.hypot(semiMajorMpc[0], semiMajorMpc[1], semiMajorMpc[2]);
      const diameterPx = apparentSizePx({
        diameterKpc: 2 * semiMajorLenMpc * 1000,
        distanceMpc,
        viewportHeightPx,
        fovYRad: ctx.fovYRad,
      });
      if (diameterPx < CULL_PX) continue; // deep sub-pixel — do not render
      const alpha = Math.min(1, (diameterPx - CULL_PX) / (FULL_PX - CULL_PX));

      const { ginv, minorS, minorT } = composeOrbitConic(
        view.slab.vp,
        centerMpc,
        semiMajorMpc,
        semiMinorMpc,
        view.viewportPx,
        RENDER_ORIGIN_MPC,
      );
      const base = n * INSTANCE_FLOATS;
      staging.set(ginv, base); // Ginv columns → floats 0..11
      staging[base + 12] = elements.color[0];
      staging[base + 13] = elements.color[1];
      staging[base + 14] = elements.color[2];
      staging[base + 15] = propagated.eccentricity;
      // Falloff anchor: the body's PROPAGATED mean anomaly from the snapshot —
      // where the body actually is at `t`, so the trail fades behind IT.
      staging[base + 16] = states.get(elements.id)!.meanAnomalyRad;
      staging[base + 17] = alpha;
      staging[base + 18] = 0; // trailing pad — kept zeroed across frames
      staging[base + 19] = 0;
      staging.set(minorS, base + 20); // gradient minors M1/M2/M3 + pad → floats 20..23
      staging.set(minorT, base + 24); // gradient minors M4/M5/M6 + pad → floats 24..27
      n++;
    }
    if (n > 0) renderer.draw(pass, staging, n);
  },
};
