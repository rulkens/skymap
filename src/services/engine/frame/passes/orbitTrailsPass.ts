/**
 * orbitTrailsPass — Keplerian orbit trails as additive screen-space conics, drawn through NEAR0
 * because AU-to-lunar orbits sit far inside COSMO's 0.01 Mpc near plane. No pass-level `fade`:
 * each trail group carries its own show key, so one switch cannot hide another group's trails.
 *
 * HARD INVARIANT: `writeOrbitTrailRecord` takes `view.slab.vp`, NOT `view.vp`: its conic is
 * inverted in f64 to resolve the cancellation between the ~1e-12 Mpc centres and the vp's large
 * translation column; fed the f32-narrowed `view.vp` it misplaces a trail by far more than its stroke.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { ORBIT_REACH_BY_REGION } from '../../../../data/bodies/orbitReachByRegion';
import { CULL_PX } from '../../../../data/bodies/orbitTrailConstants';
import { regionRelativeDistanceMpc } from '../../../../utils/regions/regionRelativeDistanceMpc';
import { keplerianPositionMpc } from '../../../../utils/orbit/keplerianPositionMpc';
import { keplerianEllipse } from '../../../../utils/orbit/keplerianEllipse';
import { writeOrbitTrailRecord } from '../../../../utils/orbit/writeOrbitTrailRecord';
import { sampledDepthBinding } from '../sampledDepthBinding';
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

    // One record per VISIBLE conic; the layout lives in `writeOrbitTrailRecord`.
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

        const wrote = writeOrbitTrailRecord(
          {
            slabVp: view.slab.vp,
            viewportPx: view.viewportPx,
            eyeMpc: camPos,
            pxPerRad: ctx.drawPxPerRad,
            centerMpc,
            semiMajorMpc,
            semiMinorMpc,
            eccentricity: orbit.eccentricity,
            meanAnomalyRad: orbit.meanAnomalyRad,
            color: elements.color,
            fade,
          },
          staging,
          count * INSTANCE_FLOATS,
        );
        if (wrote) count++;
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
