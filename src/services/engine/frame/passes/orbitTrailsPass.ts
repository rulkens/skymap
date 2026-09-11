/**
 * orbitTrailsPass — Keplerian orbit trails (Earth / Jupiter / Moon) as additive
 * screen-space conics. Drawn through NEAR0 because AU-to-lunar orbits sit far
 * inside COSMO's 0.01 Mpc near plane, while still accumulating into HDR.
 *
 * HARD INVARIANT: `composeOrbitConic` takes `view.slab.vp`, NOT `view.vp`. It
 * assembles and INVERTS the homography in f64 to resolve the cancellation between
 * the ~1e-12 Mpc centres and the vp's large translation column; fed the narrowed
 * `view.vp` it misplaces a trail by far more than its stroke width.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { TRAIL_ELEMENTS } from '../../../../data/bodies/trailElements';
import { ORBIT_REACH_BY_REGION } from '../../../../data/bodies/orbitReachByRegion';
import { CULL_PX, FULL_PX } from '../../../../data/bodies/orbitTrailConstants';
import { regionRelativeDistanceMpc } from '../../../../utils/scene/regionRelativeDistanceMpc';
import { propagateElements } from '../../../../utils/orbit/propagateElements';
import { keplerianEllipse } from '../../../../utils/orbit/keplerianEllipse';
import { composeOrbitConic } from '../../../../utils/camera/composeOrbitConic';
import { eyeRelativeOrbitBasisKm } from '../../../../utils/orbit/eyeRelativeOrbitBasisKm';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { sceneBodyStates } from '../sceneBodyStates';
import { sceneOccluderSpheres } from '../sceneOccluderSpheres';
import { INSTANCE_FLOATS } from '../../../gpu/renderers/bodies/orbitTrailRenderer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { resolveLayerOpacity } from '../../presentation/focusRecession';

// Reused across frames so the hot path allocates nothing. Sized from the
// compile-time elements table — a fixed size, not a cap.
const staging = new Float32Array(TRAIL_ELEMENTS.length * INSTANCE_FLOATS);

export const orbitTrailsPass: ContentPass = {
  name: 'orbit-trails',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',
  // After the opaque body composite, so a satellite's near arc draws OVER
  // its host (the fragment hides the far arc itself). This is also after
  // the black-hole lens, which keeps the S-star trails unwarped on top of
  // it rather than sampled by it.
  hdrPhase: 'post-foreground',

  enabled(state, ctx, _view) {
    if (state.gpu.orbitTrailRenderer === null) return false;
    // Toggle off AND the fade fully receded means truly hidden, so the whole
    // (hdr, NEAR0) pass drops — opacity 0 ⇒ no render.
    if (
      !state.settings.orbitTrails.enabled &&
      state.subsystems.fades.opacityOf({ kind: 'orbitTrails' }, ctx.nowMs) <= 0
    ) {
      return false;
    }
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    // Whole-layer sub-pixel cull: the per-orbit CULL_PX test in `draw`, bounded
    // once per region at the camera's NEAREST possible distance to any of that
    // region's orbit points. Keyed on the eye (`drawCamPos`), NOT `cam.distance`,
    // which measures to the orbit TARGET. Failing here lets the executor skip the
    // whole (hdr, NEAR0) step instead of packing zero records.
    const states = sceneBodyStates(state, ctx);
    for (const [region, reachMpc] of ORBIT_REACH_BY_REGION) {
      const nearestMpc = Math.max(
        regionRelativeDistanceMpc(ctx.drawCamPos, region, states) - reachMpc,
        0,
      );
      if (nearestMpc === 0) return true;
      const maxDiameterPx = apparentSizePx({
        diameterKpc: 2 * reachMpc * 1000,
        distanceMpc: nearestMpc,
        viewportHeightPx: ctx.canvasSize.height,
        fovYRad: ctx.fovYRad,
      });
      if (maxDiameterPx >= CULL_PX) return true;
    }
    return false;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.orbitTrailRenderer;
    if (renderer === null) return;
    // Reading the shared snapshot — never re-deriving — is what welds each trail
    // to the exact instant its body is drawn at.
    const states = sceneBodyStates(state, ctx);
    const limit = TRAIL_ELEMENTS.length;
    const camPos = ctx.drawCamPos;
    const viewportHeightPx = view.viewportPx[1];

    // Multiplied into every orbit's apparent-size alpha below, so a hide dissolves
    // the layer rather than popping it.
    const layerOpacity = resolveLayerOpacity(state, ctx, { kind: 'orbitTrails' });

    // One 46-float record per VISIBLE conic; byte offsets must mirror the
    // renderer's INSTANCE_ATTRIBUTES:
    //   floats 0..11  — the three Ginv columns (loc1/2/3 at byte 0/16/32)
    //   floats 12..15 — colour.rgb + eccentricity (loc4 at byte 48)
    //   floats 16..19 — mean anomaly + fade alpha + viewportPx.xy (loc5 at byte 64)
    //   floats 20..31 — clip basis Cc/Ac/Bc (loc6/7/8 at byte 80/96/112)
    //   floats 32..33 — the visible arc eStart/eSpan (loc9 at byte 128)
    //   floats 34..45 — eye-relative 3D basis, km (loc10/11/12 at byte 136/152/168)
    let count = 0;
    for (let i = 0; i < limit; i++) {
      const elements = TRAIL_ELEMENTS[i]!;
      // Re-derived at the frame instant, never baked. `keplerianEllipse` returns
      // FRESH vectors per call, so the in-place focus fold below cannot alias a
      // shared scratch across orbits.
      const propagated = propagateElements(elements, ctx.simDays);
      const { centerOffsetMpc, semiMajorMpc, semiMinorMpc } = keplerianEllipse(propagated);
      // The snapshot seeds anchors (the Sun) alongside every element row, so a
      // heliocentric focus and a moving parent are the same lookup.
      const focus = states.get(elements.focusId)!.positionMpc;
      const centerMpc = centerOffsetMpc;
      centerMpc[0] += focus[0];
      centerMpc[1] += focus[1];
      centerMpc[2] += focus[2];

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
      const alpha = Math.min(1, (diameterPx - CULL_PX) / (FULL_PX - CULL_PX)) * layerOpacity;

      const { ginv, clipBasis, arc } = composeOrbitConic(
        view.slab.vp,
        centerMpc,
        semiMajorMpc,
        semiMinorMpc,
        view.viewportPx,
        RENDER_ORIGIN_MPC,
      );
      if (arc[1] <= 0) continue; // whole orbit behind the camera — no geometry
      const base = count++ * INSTANCE_FLOATS;
      staging.set(ginv, base); // Ginv columns → floats 0..11
      staging[base + 12] = elements.color[0];
      staging[base + 13] = elements.color[1];
      staging[base + 14] = elements.color[2];
      staging[base + 15] = propagated.eccentricity;
      // Falloff anchor: the PROPAGATED mean anomaly, so the trail fades behind
      // where the body actually is at `t`.
      staging[base + 16] = states.get(elements.id)!.meanAnomalyRad;
      staging[base + 17] = alpha;
      staging[base + 18] = view.viewportPx[0]; // ribbon vertex stage's divisor
      staging[base + 19] = view.viewportPx[1];
      staging.set(clipBasis[0], base + 20); // clip basis Cc → floats 20..23
      staging.set(clipBasis[1], base + 24); // clip basis Ac → floats 24..27
      staging.set(clipBasis[2], base + 28); // clip basis Bc → floats 28..31
      staging[base + 32] = arc[0]; // visible arc eStart → float 32
      staging[base + 33] = arc[1]; // visible arc eSpan → float 33
      eyeRelativeOrbitBasisKm(
        { eyeMpc: camPos, centerMpc, semiMajorMpc, semiMinorMpc },
        staging,
        base + 34,
      );
    }
    if (count > 0) {
      renderer.draw(
        pass,
        staging,
        count,
        sceneOccluderSpheres(state, ctx),
        state.settings.debug.overlays['orbit-trail-impostor'],
      );
    }
  },
};
