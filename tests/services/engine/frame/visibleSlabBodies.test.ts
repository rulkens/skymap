/**
 * visibleSlabBodies — which of `rows` clear the sub-pixel apparent-diameter
 * floor AND the view-frustum angular cull, and so get a body slab row this
 * frame. Store bodies reach it through `bodySlabRowOf`, as in `deriveView`.
 */

import { describe, it, expect } from 'vitest';

import { visibleSlabBodies } from '../../../../src/services/engine/frame/visibleSlabBodies';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { blackHoleSlabRow } from '../../../../src/layers/blackHoles/present/blackHoleSlabRow';
import { BLACK_HOLES } from '../../../../src/layers/blackHoles/data/blackHoles';
import { GALACTIC_CENTRE_ANCHOR } from '../../../../src/data/places/galacticCentre';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { PROXY_SCALE } from '../../../../src/utils/scene/proxyScale';
import { bodySlabRowOf } from '../../../../src/utils/scene/bodySlabRowOf';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { symmetricFrustum } from '../../../../src/utils/camera/symmetricFrustum';

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
const FORWARD_X: Vec3 = [1, 0, 0];
const SQUARE_90 = symmetricFrustum(Math.PI / 2, 1);
// pxPerRad = viewportHeightPx / (tanUp − tanDown), the canonical form
// `visibleSlabBodies` reads directly off the view.
const PX_PER_RAD_90 = 1000 / (SQUARE_90.tanUp - SQUARE_90.tanDown);
const FRUSTUM_60_16_9 = symmetricFrustum(Math.PI / 3, 16 / 9);
const PX_PER_RAD_60 = 1000 / (FRUSTUM_60_16_9.tanUp - FRUSTUM_60_16_9.tanDown);

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
    // formula reduces to diameterPx = diameterKpc·5e-4. The pixel floor keys
    // on rEffM = PROXY_SCALE·outerBoundRadiusM for a shell-less body (radar
    // frame finding 2 — same basis the frustum cull already used), so the
    // outer bound is pre-divided by PROXY_SCALE here: rEffM lands at 3e22
    // (≈0.972px, just under the 1px floor) and 3.2e22 (≈1.037px, just over
    // it) — see the task-4 report for that derivation.
    const belowFloor: PlanetBody = {
      id: 'below',
      label: 'Below floor',
      surface: { datumRadiusM: 3e22 / PROXY_SCALE, reliefM: [0, 0] },
      albedo: [1, 1, 1],
    };
    const aboveFloor: PlanetBody = {
      id: 'above',
      label: 'Above floor',
      surface: { datumRadiusM: 3.2e22 / PROXY_SCALE, reliefM: [0, 0] },
      albedo: [1, 1, 1],
    };
    const bodyStates = new Map<string, BodyState>([
      ['below', makeState()],
      ['above', makeState()],
    ]);

    const visible = visibleSlabBodies({
      rows: [belowFloor, aboveFloor].map(bodySlabRowOf),
      bodyStates,
      camPosMpc: [0, 0, 0],
      camForwardMpc: FORWARD_X,
      frustum: SQUARE_90,
      pxPerRad: PX_PER_RAD_90,
    });

    expect(visible.map((row) => row.anchorId)).toEqual(['above']);
  });

  it('includes earth alongside surviving planets, and drops a body missing a bodyState', () => {
    const earth = {
      id: 'earth',
      label: 'Earth',
      surface: { datumRadiusM: 6.371e6, reliefM: [0, 0] as const },
    };
    const orphan: PlanetBody = {
      id: 'orphan',
      label: 'Orphan',
      surface: { datumRadiusM: 3.2e22, reliefM: [0, 0] },
      albedo: [1, 1, 1],
    };
    const bodyStates = new Map<string, BodyState>([['earth', makeState()]]);

    const visible = visibleSlabBodies({
      rows: [earth, orphan].map(bodySlabRowOf),
      bodyStates,
      camPosMpc: [1000, 0, 0], // camera AT earth's stored position ⇒ distance 0 ⇒ inside its own shell, always kept
      camForwardMpc: FORWARD_X,
      frustum: SQUARE_90,
      pxPerRad: PX_PER_RAD_90,
    });

    expect(visible.map((row) => row.anchorId)).toEqual(['earth']);
  });

  it('keeps a ringed body once the ring, not the bare disc, clears the pixel floor', () => {
    // Radar frame finding 2: the pixel floor used to key on the body's outer
    // bound alone while the frustum cull (below) already used the ring-inclusive
    // bodyDrawRadiusM — a ring could still be several px across while the
    // bare globe was sub-pixel, and the roster gate dropped the row before
    // any per-layer gate (e.g. ringsPass's own outer-diameter cull) got a
    // chance to disagree. Real Saturn at 1.2e11 m, on-axis: bare disc
    // ≈0.49px (sub-pixel), ring-inclusive rEff ≈1.17px (clears the floor).
    const saturn = SCENE_PLANETS.find((p) => p.id === 'saturn');
    if (saturn === undefined) throw new Error('SCENE_PLANETS is missing saturn');
    const dMm = 1.2e11;
    const dMpc = dMm * SCALE_UNITS.M_TO_MPC;
    const bodyStates = new Map<string, BodyState>([['saturn', makeState([dMpc, 0, 0])]]);

    const visible = visibleSlabBodies({
      rows: [saturn].map(bodySlabRowOf),
      bodyStates,
      camPosMpc: [0, 0, 0],
      camForwardMpc: FORWARD_X,
      frustum: SQUARE_90,
      pxPerRad: PX_PER_RAD_90,
    });

    expect(visible.map((row) => row.anchorId)).toEqual(['saturn']);
  });

  describe('view-frustum angular cull', () => {
    // Shared FOV for the direct frustum-geometry cases: 90° vertical, square
    // viewport ⇒ half-diagonal ≈ 54.74°, cull threshold ≈ 62.9° (×1.15
    // margin). A 3.2e22 m datum (the `aboveFloor` fixture) keeps the angular
    // radius negligible (≈0.06°) so these cases isolate the frustum test from
    // the sub-pixel one.
    const wideBody: PlanetBody = {
      id: 'wide',
      label: 'Wide body',
      surface: { datumRadiusM: 3.2e22, reliefM: [0, 0] },
      albedo: [1, 1, 1],
    };

    function frustumCase(offAxisDeg: number, distanceMpc = 1000) {
      const bodyStates = new Map<string, BodyState>([
        ['wide', makeState(offAxisPositionMpc(offAxisDeg, distanceMpc))],
      ]);
      return visibleSlabBodies({
        rows: [wideBody].map(bodySlabRowOf),
        bodyStates,
        camPosMpc: [0, 0, 0],
        camForwardMpc: FORWARD_X,
        frustum: SQUARE_90,
        pxPerRad: PX_PER_RAD_90,
      });
    }

    it('drops a body directly behind the camera (180° off-axis)', () => {
      expect(frustumCase(180).map((row) => row.anchorId)).toEqual([]);
    });

    it('drops a body 90° off-axis', () => {
      expect(frustumCase(90).map((row) => row.anchorId)).toEqual([]);
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
      // bodyDrawRadiusM(body) = the outer bound for an unregistered id (no
      // atmosphere/rings/cloud shell), so rEff = PROXY_SCALE·outer bound —
      // invert for the datum.
      const datumRadiusM = rEffM / 1.05;
      const straddling: PlanetBody = {
        id: 'straddling',
        label: 'Straddling',
        surface: { datumRadiusM, reliefM: [0, 0] },
        albedo: [1, 1, 1],
      };
      const bodyStates = new Map<string, BodyState>([
        ['straddling', makeState(offAxisPositionMpc(80, distanceMpc))],
      ]);

      const visible = visibleSlabBodies({
        rows: [straddling].map(bodySlabRowOf),
        bodyStates,
        camPosMpc: [0, 0, 0],
        camForwardMpc: FORWARD_X,
        frustum: SQUARE_90,
        pxPerRad: PX_PER_RAD_90,
      });

      expect(visible.map((row) => row.anchorId)).toEqual(['straddling']);
    });

    it('keeps Saturn at its real ring-outer radius, pose-A off-axis geometry (θ≈20.55°, in view)', () => {
      // Regression guard for the saturn-vanish-investigation.md pose A: real
      // Saturn (datum 58,232 km, ring outer 140,220 km ⇒ bodyDrawRadiusM
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
        rows: [saturn].map(bodySlabRowOf),
        bodyStates,
        camPosMpc: [0, 0, 0],
        camForwardMpc: FORWARD_X,
        frustum: FRUSTUM_60_16_9,
        pxPerRad: PX_PER_RAD_60,
      });

      expect(visible.map((row) => row.anchorId)).toEqual(['saturn']);
    });

    it('keeps a body just inside the long edge of an off-axis frustum', () => {
      // tanRight = 3 puts the right edge at atan(3) ≈ 71.6° off-axis. A
      // symmetric reading of the same fovY/aspect (90°, 1.5) culls past
      // ≈ 70.1°; the far-edge half-diagonal (≈ 72.5°, ×1.15) keeps it.
      const bodyStates = new Map<string, BodyState>([
        ['wide', makeState(offAxisPositionMpc(71, 1000))],
      ]);
      const visible = visibleSlabBodies({
        rows: [wideBody].map(bodySlabRowOf),
        bodyStates,
        camPosMpc: [0, 0, 0],
        camForwardMpc: FORWARD_X,
        frustum: { tanLeft: 0, tanRight: 3, tanDown: -1, tanUp: 1 },
        pxPerRad: PX_PER_RAD_90,
      });
      expect(visible.map((row) => row.anchorId)).toEqual(['wide']);
    });
  });

  describe("Sgr A*'s lens envelope, not a bypass", () => {
    // Both culls read the lens row's `drawRadiusM` like any other row's
    // shell, so candidacy tracks where the LENSED SPHERE actually reaches
    // rather than bypassing for any position inside the band, which would
    // keep a hole directly behind the camera.
    const lensRow = BLACK_HOLES.map(blackHoleSlabRow).find(
      (row) => row.anchorId === GALACTIC_CENTRE_ANCHOR.id,
    );
    if (lensRow === undefined) throw new Error('BLACK_HOLES carries no galactic-centre row');
    const insideBandMpc = 400 * SCALE_UNITS.AU_TO_MPC; // < goneAt (500 AU)
    const outsideBandMpc = 600 * SCALE_UNITS.AU_TO_MPC; // > goneAt

    it('keeps the lens inside the band, 30° off-axis (well within the frustum cull threshold)', () => {
      const bodyStates = new Map<string, BodyState>([
        [GALACTIC_CENTRE_ANCHOR.id, makeState(offAxisPositionMpc(30, insideBandMpc))],
      ]);
      const visible = visibleSlabBodies({
        rows: [lensRow],
        bodyStates,
        camPosMpc: [0, 0, 0],
        camForwardMpc: FORWARD_X,
        frustum: SQUARE_90,
        pxPerRad: PX_PER_RAD_90,
      });
      expect(visible.map((row) => row.anchorId)).toEqual([GALACTIC_CENTRE_ANCHOR.id]);
    });

    it('drops the lens inside the band but 180° behind the camera — the envelope does not reach that far', () => {
      const bodyStates = new Map<string, BodyState>([
        [GALACTIC_CENTRE_ANCHOR.id, makeState(offAxisPositionMpc(180, insideBandMpc))],
      ]);
      const visible = visibleSlabBodies({
        rows: [lensRow],
        bodyStates,
        camPosMpc: [0, 0, 0],
        camForwardMpc: FORWARD_X,
        frustum: SQUARE_90,
        pxPerRad: PX_PER_RAD_90,
      });
      expect(visible.map((row) => row.anchorId)).toEqual([]);
    });

    it('drops the lens outside the band, where the envelope is 0', () => {
      const bodyStates = new Map<string, BodyState>([
        [GALACTIC_CENTRE_ANCHOR.id, makeState(offAxisPositionMpc(0, outsideBandMpc))],
      ]);
      const visible = visibleSlabBodies({
        rows: [lensRow],
        bodyStates,
        camPosMpc: [0, 0, 0],
        camForwardMpc: FORWARD_X,
        frustum: SQUARE_90,
        pxPerRad: PX_PER_RAD_90,
      });
      expect(visible.map((row) => row.anchorId)).toEqual([]);
    });
  });
});
