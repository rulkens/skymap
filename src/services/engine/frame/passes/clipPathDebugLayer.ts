/**
 * clipPathDebugLayer — draws the clip-path inspector overlay (the precomputed
 * speed-coloured eye route + the scrub-instant camera gizmo).
 *
 * A swap-target layer, drawn post-tone-map onto the swap chain via the shared
 * swap render step — same family as `markerLinesLayer`, but fed by the
 * dedicated `debugLineRenderer` (no label-director coupling). The geometry is
 * NOT in Redux: the snapshot is held by the `clipPathInspector` subsystem
 * (precomputed once on the debug panel's "Calculate"), and only the scalar
 * `scrubT` rides on `state.settings.debug.clipPathInspect`. Each frame this
 * layer rebuilds the `DebugLine[]` from (snapshot, scrubT, view) and uploads
 * it wholesale — cheap for a few hundred lines, and keeps the overlay live to
 * scrubbing without any per-frame compute.
 *
 * ### Why NEAR0, not COSMO — the overlay must span every clip's scale
 *
 * A clip's route can live at ANY scale: a cosmic flythrough frames galaxies at
 * Mpc distances, but a near-field clip can fly the solar neighbourhood, its
 * whole path spanning Earth's surface (~1e-16 Mpc) out to a few parsecs
 * (~4e-4 Mpc) — entirely INSIDE COSMO's fixed 10 kpc near plane.
 * Projected through COSMO the parsec-scale route is wholly near-clipped and the
 * inspector shows nothing. So the overlay projects through the NEAR0 slab, whose
 * adaptive near/far bracket (`foregroundFrustum`) reaches down to Earth's
 * surface AND whose reversed-Z / infinite-far projection, with the marker-line
 * shader's clip-z clamp, never near- or far-clips content at any depth. A cosmic
 * route renders identically here — the XY projection is the same camera, and the
 * overlay is a depthless OVER composite, so the differing depth convention is
 * unobserved. This is the same slab choice `near0SelectionRingLayer` makes for a
 * picked star's halo, and for the same reason.
 *
 * ### The f64 rebase seam — camera-relative lines + a rebased vp
 *
 * At parsec scale the NEAR0 vp's view translation and the route coordinates are
 * both tiny magnitudes measured from the render origin; their f32 subtraction
 * cancels catastrophically and the route hops by pixels. So, like every NEAR0
 * layer, this rebases into a camera-relative frame in f64 BEFORE narrowing:
 * `rebaseViewProj(view.slab.vp, view.camPos)` folds the eye offset into the vp
 * (zeroing the large view translation), and every line endpoint is re-expressed
 * as `world − view.camPos` (a small camera-relative vector). The dedicated
 * `debugLineRenderer` is reused unchanged — only what this layer hands it changes.
 *
 * ### When it draws
 *
 *   1. `state.gpu.debugLineRenderer` is non-null (built in `initGpu`).
 *   2. `subsystems.clipPathInspector.current()` is non-null — the user has
 *      clicked "Calculate" and a snapshot is held. "Clear" drops it and this
 *      layer goes quiet.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { DebugLine } from '../../../../@types/rendering/DebugLine';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { buildClipPathLines } from '../../presentation/buildClipPathLines';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';

export const clipPathDebugLayer: ContentLayer = {
  name: 'clip-path-debug',
  slab: NEAR0,
  target: 'swap',
  blend: 'over',

  enabled(state, _ctx, _view) {
    if (state.gpu.debugLineRenderer === null) return false;
    return state.subsystems.clipPathInspector.current() !== null;
  },

  draw(pass, view, ctx, state) {
    // `enabled()` proved both are non-null; the framework only calls draw then.
    const snapshot = state.subsystems.clipPathInspector.current()!;
    const aspect = view.viewportPx[0] / view.viewportPx[1];
    const lines = buildClipPathLines(snapshot, state.settings.debug.clipPathInspect.scrub01, {
      fovYRad: ctx.fovYRad,
      aspect,
    });

    // Re-express every endpoint as a small camera-relative vector in f64 before
    // the renderer narrows to f32 — the NEAR0 rebase seam (see the header).
    const cam = view.camPos;
    const rebased: DebugLine[] = lines.map((line) => ({
      ...line,
      from: [line.from[0] - cam[0], line.from[1] - cam[1], line.from[2] - cam[2]] as Vec3,
      to: [line.to[0] - cam[0], line.to[1] - cam[1], line.to[2] - cam[2]] as Vec3,
    }));

    // Fold the eye offset into the vp so it pairs with the camera-relative
    // endpoints. Uses the slab's f64 `vp`, narrowed HERE at the upload boundary.
    const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, view.camPos));

    const renderer = state.gpu.debugLineRenderer!;
    renderer.setLines(rebased);
    renderer.draw(pass, rebasedVp, view.viewportPx);
  },
};
