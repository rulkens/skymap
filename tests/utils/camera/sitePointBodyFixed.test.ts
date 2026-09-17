/**
 * sitePointBodyFixed — the hand-computed point, and the cross-file contract with
 * the placement in `deriveBodyStates`: camera and rover must read the same row,
 * the same ground radius and the same altitude, or the rover drifts in frame.
 */

import { describe, it, expect } from 'vitest';

import { sitePointBodyFixed } from '../../../src/utils/camera/sitePointBodyFixed';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { SURFACE_FIXED_SITES } from '../../../src/data/bodies/surfaceFixedSites';
import { SCENE_CELESTIAL_BODIES } from '../../../src/data/bodies/sceneCelestialBodies';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { rotateVec3ByTightMat3 } from '../../../src/utils/math/rotateVec3ByTightMat3';
import type { SurfaceFixedSite } from '../../../src/@types/scene/SurfaceFixedSite';

describe('sitePointBodyFixed', () => {
  it('returns the hand-computed point for a fixture site', () => {
    const site: SurfaceFixedSite = {
      id: 'fixture',
      hostId: 'fixture-host',
      latDeg: 30,
      lonDeg: 60,
      altitudeM: 100,
    };
    // r = 1000 + 100 = 1100. ring = 1100·cos30 = 550√3, so
    // x = 550√3·cos60 = 275√3, y = 550√3·sin60 = 550·3/2 = 825, z = 1100·sin30 = 550.
    const p = sitePointBodyFixed(site, 1000);
    expect(p[0]).toBeCloseTo(275 * Math.sqrt(3), 9);
    expect(p[1]).toBeCloseTo(825, 9);
    expect(p[2]).toBeCloseTo(550, 9);
  });

  it('sits at datum + terrain + wheel lift, not one or the other (F3a)', () => {
    const site: SurfaceFixedSite = {
      id: 'fixture',
      hostId: 'fixture-host',
      latDeg: 0,
      lonDeg: 0,
      altitudeM: 100,
    };
    const TERRAIN_M = 50;
    const p = sitePointBodyFixed(site, 1000, () => TERRAIN_M);
    const magM = Math.hypot(p[0], p[1], p[2]);
    // 1150, not 1100 (terrain dropped) and not 1050 (lift dropped).
    expect(magM).toBeCloseTo(1000 + TERRAIN_M + site.altitudeM, 9);
  });

  it('is the point deriveBodyStates places the rover at, terrain term included', () => {
    const site = SURFACE_FIXED_SITES.find((s) => s.id === 'curiosity')!;
    const mars = SCENE_CELESTIAL_BODIES.find((b) => b.id === 'mars')!;
    // Non-zero on both sides (Fix 2): a lookup only one reader adds now fails this test.
    const terrainHeightAt = () => 1234;
    const states = deriveBodyStates(0, terrainHeightAt);
    const hostState = states.get('mars')!;
    const roverState = states.get('curiosity')!;

    const r = roverState.positionMpc;
    const h = hostState.positionMpc;
    const placedM = [
      (r[0] - h[0]) * SCALE_UNITS.MPC_TO_M,
      (r[1] - h[1]) * SCALE_UNITS.MPC_TO_M,
      (r[2] - h[2]) * SCALE_UNITS.MPC_TO_M,
    ];
    const cameraM = rotateVec3ByTightMat3(
      sitePointBodyFixed(site, mars.surface.datumRadiusM, terrainHeightAt),
      hostState.orientation,
    );

    // 1 mm, well inside the ~0.1 mm the au-scale Mpc subtraction above costs.
    expect(cameraM[0]).toBeCloseTo(placedM[0]!, 3);
    expect(cameraM[1]).toBeCloseTo(placedM[1]!, 3);
    expect(cameraM[2]).toBeCloseTo(placedM[2]!, 3);
  });
});
