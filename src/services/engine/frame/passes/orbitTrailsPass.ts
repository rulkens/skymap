/**
 * orbitTrailsPass — Keplerian orbit trails as additive screen-space conics, drawn through NEAR0
 * because AU-to-lunar orbits sit far inside COSMO's 0.01 Mpc near plane. No pass-level `fade`:
 * each trail group carries its own show key, so one switch cannot hide another group's trails.
 *
 * HARD INVARIANT: `composeOrbitConic` takes `view.slab.vp`, NOT `view.vp`. It INVERTS the
 * homography in f64 to resolve the cancellation between the ~1e-12 Mpc centres and the vp's large
 * translation column; fed the f32-narrowed `view.vp` it misplaces a trail by far more than its stroke.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { ORBIT_REACH_BY_REGION } from '../../../../data/bodies/orbitReachByRegion';
import { CULL_PX, FULL_PX } from '../../../../data/bodies/orbitTrailConstants';
import { regionRelativeDistanceMpc } from '../../../../utils/regions/regionRelativeDistanceMpc';
import { keplerianPositionMpc } from '../../../../utils/orbit/keplerianPositionMpc';
import { keplerianEllipse } from '../../../../utils/orbit/keplerianEllipse';
import { composeOrbitConic } from '../../../../utils/camera/composeOrbitConic';
import { sampledDepthBinding } from '../sampledDepthBinding';
import { eyeRelativeOrbitBasisKm } from '../../../../utils/orbit/eyeRelativeOrbitBasisKm';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { sceneBodyStates } from '../sceneBodyStates';
import { sceneOccluderSpheres } from '../sceneOccluderSpheres';
import { INSTANCE_FLOATS } from '../../../gpu/renderers/bodies/orbitTrailRenderer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../data/rendering/foregroundMaxDistance';

// Reused across frames; grown on the first frame that needs more room (the roster is composed at boot).
let staging = new Float32Array(0);

export const orbitTrailsPass: ContentPass = {
  name: 'orbit-trails',

  enabled(state, ctx, _view) {
    if (state.gpu.orbitTrailRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    if (state.orbitTrailGroups.every((group) => group.fade(ctx.snapshot) === 0)) return false;
    // Whole-layer cull: `draw`'s CULL_PX test bounded per region at the NEAREST possible distance.
    // Keyed on the eye (`drawCamPos`), NOT `cam.distance`, which measures to the orbit TARGET.
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
        pxPerRad: ctx.drawPxPerRad,
      });
      if (maxDiameterPx >= CULL_PX) return true;
    }
    return false;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.orbitTrailRenderer;
    if (renderer === null) return;
    // The shared snapshot, never a re-derivation, welds each trail to its body's instant.
    const states = sceneBodyStates(state, ctx);
    const groups = state.orbitTrailGroups;
    const limit = groups.reduce((total, group) => total + group.rows.length, 0);
    if (staging.length < limit * INSTANCE_FLOATS) {
      staging = new Float32Array(limit * INSTANCE_FLOATS);
    }
    const camPos = ctx.drawCamPos;

    // One 46-float record per VISIBLE conic; byte offsets must mirror the
    // renderer's INSTANCE_ATTRIBUTES:
    //   floats 0..11  — the three Ginv columns (loc1/2/3 at byte 0/16/32)
    //   floats 12..15 — colour.rgb + eccentricity (loc4 at byte 48)
    //   floats 16..19 — mean anomaly + fade alpha + viewportPx.xy (loc5 at byte 64)
    //   floats 20..31 — clip basis Cc/Ac/Bc (loc6/7/8 at byte 80/96/112)
    //   floats 32..33 — the visible arc eStart/eSpan (loc9 at byte 128)
    //   floats 34..45 — eye-relative 3D basis, km (loc10/11/12 at byte 136/152/168)
    let count = 0;
    for (const group of groups) {
      const fade = group.fade(ctx.snapshot);
      if (fade === 0) continue;
      const rows = group.rows;
      for (let i = 0; i < rows.length; i++) {
        const elements = rows[i]!;
        const body = states.get(elements.id)!;
        // `keplerianEllipse` returns FRESH vectors, so the in-place anchoring below cannot alias
        // across orbits. `deriveBodyStates` sets `orbit` for every element row.
        const orbit = body.orbit!;
        const { centerOffsetMpc, semiMajorMpc, semiMinorMpc } = keplerianEllipse(orbit);
        // Centre = snapshot position - Kepler position + ellipse offset, so the body sits on its trail.
        const bodyMpc = body.positionMpc;
        const keplerMpc = keplerianPositionMpc(orbit);
        const centerMpc = centerOffsetMpc;
        centerMpc[0] += bodyMpc[0] - keplerMpc[0];
        centerMpc[1] += bodyMpc[1] - keplerMpc[1];
        centerMpc[2] += bodyMpc[2] - keplerMpc[2];

        const dx = centerMpc[0] - camPos[0];
        const dy = centerMpc[1] - camPos[1];
        const dz = centerMpc[2] - camPos[2];
        const distanceMpc = Math.hypot(dx, dy, dz);
        const semiMajorLenMpc = Math.hypot(semiMajorMpc[0], semiMajorMpc[1], semiMajorMpc[2]);
        const diameterPx = apparentSizePx({
          diameterKpc: 2 * semiMajorLenMpc * 1000,
          distanceMpc,
          pxPerRad: ctx.drawPxPerRad,
        });
        if (diameterPx < CULL_PX) continue; // deep sub-pixel — do not render
        const alpha = Math.min(1, (diameterPx - CULL_PX) / (FULL_PX - CULL_PX)) * fade;

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
        staging[base + 15] = orbit.eccentricity;
        staging[base + 16] = orbit.meanAnomalyRad;
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
    }
    if (count > 0) {
      // `depth` is the second occluder channel (terrain and meshes), in km like the eye-relative orbit points.
      renderer.draw(pass, {
        instances: staging,
        count,
        occluders: sceneOccluderSpheres(state, ctx),
        depth: sampledDepthBinding(view.sampledDepth, ctx.bodyPose, ctx.snapshot.renderTargets),
        showImpostor: state.settings.debug.overlays['orbit-trail-impostor'],
      });
    }
  },
};
