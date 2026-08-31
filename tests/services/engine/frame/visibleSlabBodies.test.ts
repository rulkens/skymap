/**
 * visibleSlabBodies — which of `[earth, ...planets]` clear the sub-pixel
 * apparent-diameter floor AND the view-frustum angular cull, and so get a
 * body slab row this frame.
 */

import { describe, it, expect } from 'vitest';

import { visibleSlabBodies } from '../../../../src/services/engine/frame/visibleSlabBodies';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
const FORWARD_X: Vec3 = [1, 0, 0];

function makeState(positionMpc: Vec3 = [1000, 0, 0]): BodyState {
  return { positionMpc, orientation: [...IDENTITY], meanAnomalyRad: 0 };
}

/** A body offset `offAxisDeg` from `FORWARD_X`, in the XY plane, at `distanceMpc`. */
function offAxisPositionMpc(offAxisDeg: number, distanceMpc: number): Vec3 {
  const rad = (offAxisDeg * Math.PI) / 180;
  return [Math.cos(rad) * distanceMpc, Math.sin(rad) * distanceMpc, 0];
}

describe('visibleSlabBodies', () => {
  it('drops a body below the sub-pixel floor and keeps one above it', () => {
    // Both bodies sit at distanceMpc = 1000, on-axis, under a 90° vertical FOV
    // and a 1000px-tall viewport, so pxPerRad = 500 and the apparent-diameter
    // formula reduces to diameterPx = diameterKpc·5e-4. radiusM = 3e22 lands
    // just under the 1px floor (≈0.972px); radiusM = 3.2e22 lands just over
    // it (≈1.037px) — see the task-4 report for the derivation.
    const belowFloor: PlanetBody = {
      id: 'below',
      label: 'Below floor',
      radiusM: 3e22,
      albedo: [1, 1, 1],
    };
    const aboveFloor: PlanetBody = {
      id: 'above',
      label: 'Above floor',
      radiusM: 3.2e22,
      albedo: [1, 1, 1],
    };
    const bodyStates = new Map<string, BodyState>([
      ['below', makeState()],
      ['above', makeState()],
    ]);

    const visible = visibleSlabBodies({
      earth: null,
      planets: [belowFloor, aboveFloor],
      bodyStates,
      camPosMpc: [0, 0, 0],
      camForwardMpc: FORWARD_X,
      viewportWidthPx: 1000,
      viewportHeightPx: 1000,
      fovYRad: Math.PI / 2,
    });

    expect(visible.map((body) => body.id)).toEqual(['above']);
  });

  it('includes earth alongside surviving planets, and drops a body missing a bodyState', () => {
    const earth = { id: 'earth', label: 'Earth', radiusM: 6.371e6 };
    const orphan: PlanetBody = {
      id: 'orphan',
      label: 'Orphan',
      radiusM: 3.2e22,
      albedo: [1, 1, 1],
    };
    const bodyStates = new Map<string, BodyState>([['earth', makeState()]]);

    const visible = visibleSlabBodies({
      earth,
      planets: [orphan],
      bodyStates,
      camPosMpc: [1000, 0, 0], // camera AT earth's stored position ⇒ distance 0 ⇒ inside its own shell, always kept
      camForwardMpc: FORWARD_X,
      viewportWidthPx: 1000,
      viewportHeightPx: 1000,
      fovYRad: Math.PI / 2,
    });

    expect(visible.map((body) => body.id)).toEqual(['earth']);
  });

  describe('view-frustum angular cull', () => {
    // Shared FOV for the direct frustum-geometry cases: 90° vertical, square
    // viewport ⇒ half-diagonal ≈ 54.74°, cull threshold ≈ 62.9° (×1.15
    // margin). radiusM = 3.2e22 (the `aboveFloor` fixture) keeps the angular
    // radius negligible (≈0.06°) so these cases isolate the frustum test from
    // the sub-pixel one.
    const wideBody: PlanetBody = {
      id: 'wide',
      label: 'Wide body',
      radiusM: 3.2e22,
      albedo: [1, 1, 1],
    };

    function frustumCase(offAxisDeg: number, distanceMpc = 1000) {
      const bodyStates = new Map<string, BodyState>([
        ['wide', makeState(offAxisPositionMpc(offAxisDeg, distanceMpc))],
      ]);
      return visibleSlabBodies({
        earth: null,
        planets: [wideBody],
        bodyStates,
        camPosMpc: [0, 0, 0],
        camForwardMpc: FORWARD_X,
        viewportWidthPx: 1000,
        viewportHeightPx: 1000,
        fovYRad: Math.PI / 2,
      });
    }

    it('drops a body directly behind the camera (180° off-axis)', () => {
      expect(frustumCase(180).map((b) => b.id)).toEqual([]);
    });

    it('drops a body 90° off-axis', () => {
      expect(frustumCase(90).map((b) => b.id)).toEqual([]);
    });

    it('keeps a body whose disc straddles the frustum edge even though its centre is well outside it', () => {
      // fovYRad=90°, aspect=1 ⇒ threshold ≈ 62.9° (as above). Centre at 80°
      // off-axis is outside that cone on its own — a projected-centre test
      // would cull it. angularRadius=30° exactly (rEffMpc = distanceMpc·sin30°
      // = distanceMpc/2) brings the near limb of the disc to 50° off-axis,
      // inside the cone, so the row must be kept.
      const distanceMpc = 10;
      const rEffMpc = distanceMpc * Math.sin((30 * Math.PI) / 180);
      const rEffM = rEffMpc / SCALE_UNITS.M_TO_MPC;
      // bodyDrawRadiusM(body) = radiusM for an unregistered id (no atmosphere/
      // rings/cloud shell), so rEff = PROXY_SCALE·radiusM — invert for radiusM.
      const radiusM = rEffM / 1.05;
      const straddling: PlanetBody = {
        id: 'straddling',
        label: 'Straddling',
        radiusM,
        albedo: [1, 1, 1],
      };
      const bodyStates = new Map<string, BodyState>([
        ['straddling', makeState(offAxisPositionMpc(80, distanceMpc))],
      ]);

      const visible = visibleSlabBodies({
        earth: null,
        planets: [straddling],
        bodyStates,
        camPosMpc: [0, 0, 0],
        camForwardMpc: FORWARD_X,
        viewportWidthPx: 1000,
        viewportHeightPx: 1000,
        fovYRad: Math.PI / 2,
      });

      expect(visible.map((b) => b.id)).toEqual(['straddling']);
    });

    it('keeps Saturn at its real ring-outer radius, pose-A off-axis geometry (θ≈20.55°, in view)', () => {
      // Regression guard for the saturn-vanish-investigation.md pose A: real
      // Saturn (radiusM 58,232 km, ring outer 140,220 km ⇒ bodyDrawRadiusM
      // wins over the PROXY_SCALE-inflated globe) viewed 20.55° off-axis at
      // Titan-orbit scale (dM ≈ 1.2e9 m), under a 60° FOV / 16:9 viewport
      // (threshold ≈ 57.2°) — well inside the frustum, must never be culled
      // by this gate.
      const saturn = SCENE_PLANETS.find((p) => p.id === 'saturn');
      if (saturn === undefined) throw new Error('SCENE_PLANETS is missing saturn');
      const dMm = 1.2e9;
      const dMpc = dMm * SCALE_UNITS.M_TO_MPC;
      const bodyStates = new Map<string, BodyState>([
        ['saturn', makeState(offAxisPositionMpc(20.55, dMpc))],
      ]);

      const visible = visibleSlabBodies({
        earth: null,
        planets: [saturn],
        bodyStates,
        camPosMpc: [0, 0, 0],
        camForwardMpc: FORWARD_X,
        viewportWidthPx: (1000 * 16) / 9,
        viewportHeightPx: 1000,
        fovYRad: Math.PI / 3,
      });

      expect(visible.map((b) => b.id)).toEqual(['saturn']);
    });
  });
});
