/**
 * orbitTrailsPass — Keplerian orbit trails as additive screen-space conics, drawn through NEAR0
 * because AU-to-lunar orbits sit far inside COSMO's 0.01 Mpc near plane. No pass-level `fade`:
 * each trail group carries its own show key, so one switch cannot hide another group's trails.
 * Each group's value carries its entry's distance band, so the pass is off past the foreground gate.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { ORBIT_REACH_BY_REGION } from '../../../../data/bodies/orbitReachByRegion';
import { CULL_PX } from '../../../../data/bodies/orbitTrailConstants';
import { regionRelativeDistanceMpc } from '../../../../utils/regions/regionRelativeDistanceMpc';
import { keplerianPositionMpc } from '../../../../utils/orbit/keplerianPositionMpc';
import { keplerianEllipse } from '../../../../utils/orbit/keplerianEllipse';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { sceneBodyStates } from '../sceneBodyStates';
import { drawOrbitConics } from '../drawOrbitConics';
import { orbitTrailView } from '../orbitTrailView';
import { isKind } from '../../../../utils/selection/isKind';
import type { OrbitTrail } from '../../../../@types/rendering/orbitTrailRenderer/OrbitTrail';
import type { BodyRef } from '../../../../@types/engine/selection/BodyRef';

export const orbitTrailsPass: ContentPass = {
  name: 'orbit-trails',

  enabled(state, ctx, _view) {
    if (state.gpu.orbitTrailRenderer === null) return false;
    if (state.orbitTrailGroups.every((group) => group.fade(ctx) === 0)) return false;
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
    const { select, focus } = state.selection;

    const trails: OrbitTrail[] = [];
    for (const group of state.orbitTrailGroups) {
      const fade = group.fade(ctx);
      if (fade === 0) continue;
      for (const elements of group.rows) {
        if (
          group.selectedOnly?.includes(elements.id) &&
          !(isKind<BodyRef>(select, 'body') && select.id === elements.id) &&
          !(isKind<BodyRef>(focus, 'body') && focus.id === elements.id)
        ) {
          continue;
        }
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
        trails.push({
          centerMpc,
          semiMajorMpc,
          semiMinorMpc,
          eccentricity: orbit.eccentricity,
          meanAnomalyRad: orbit.meanAnomalyRad,
          color: elements.color,
          fade,
        });
      }
    }
    drawOrbitConics(pass, renderer, trails, orbitTrailView(view, ctx, state));
  },
};
