/**
 * pivotRadiusMpc — which focus rows give the zoom clamp a surface to stand off.
 *
 * The split is the point: a body / star is a surface the camera can crash into,
 * so it yields a radius; a galaxy, structure, or the Milky Way is a volume the
 * camera flies INTO, so it must yield `null` and leave the focus tween on the
 * absolute floor. Getting the galaxy arm wrong would ratchet every galaxy focus
 * outward by its own half-diameter — the invariant `clampDistance`'s docblock
 * exists to protect.
 */

import { describe, it, expect } from 'vitest';

import {
  pivotRadiusMpc,
  pivotFraming,
} from '../../../../src/services/engine/camera/pivotRadiusMpc';
import {
  MIN_DISTANCE_MPC,
  SURFACE_STANDOFF_RADII,
} from '../../../../src/utils/camera/clampDistance';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { makeGalaxyRow } from '../../../fixtures/makeGalaxyRow';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';

const EARTH_ROW: SelectionRow = {
  type: 'body',
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0],
  radiusM: 6371000,
};

describe('pivotRadiusMpc', () => {
  it('converts a body row’s radius to Mpc', () => {
    expect(pivotRadiusMpc(EARTH_ROW)).toBeCloseTo(6371 * SCALE_UNITS.KM_TO_MPC, 30);
  });

  it('gives a star row its stamped radius too — same near-field discrete case', () => {
    const star: SelectionRow = {
      type: 'star',
      index: 7,
      positionMpc: [1, 2, 3],
      absMag: 4,
      bpRp: 0.6,
      radiusM: 696340000,
    };
    expect(pivotRadiusMpc(star)).toBeCloseTo(696340 * SCALE_UNITS.KM_TO_MPC, 30);
  });

  it('yields null for a galaxy — a volume flown into, never a floor', () => {
    // A galaxy's half-diameter is Mpc-scale; treating it as a standoff radius
    // would push every galaxy focus tween back out past its own end distance.
    expect(pivotRadiusMpc(makeGalaxyRow({ diameterKpc: 30 }))).toBeNull();
  });

  it('yields null for the Milky Way and for no focus at all', () => {
    expect(pivotRadiusMpc({ type: 'milkyWay' })).toBeNull();
    expect(pivotRadiusMpc(null)).toBeNull();
  });
});

describe('pivotFraming', () => {
  it('floors a body row at the global ratio when it carries no override', () => {
    expect(pivotFraming(EARTH_ROW).floorMpc).toBeCloseTo(
      6371 * SCALE_UNITS.KM_TO_MPC * SURFACE_STANDOFF_RADII,
      30,
    );
  });

  it('floors a body row at its own override — Sgr A’s Q10 descent floor (2 r_s)', () => {
    // Far outside the Earth-tuned global ratio, so a body that opts in must be
    // floored at ITS OWN multiple, not the shared constant.
    const sgrAStar: SelectionRow = {
      type: 'body',
      id: 'sgr-a-star',
      label: 'Sagittarius A*',
      positionMpc: [0, 0, 0],
      radiusM: 1.269e10,
      standoffRadii: 2.0,
    };
    const radiusMpc = 1.269e10 * SCALE_UNITS.M_TO_MPC;
    expect(pivotFraming(sgrAStar)).toEqual({ radiusMpc, floorMpc: radiusMpc * 2.0 });
  });

  it('a body smaller than the absolute floor still gets the absolute floor', () => {
    // A 10 km moonlet's own standoff (~10.2 km) is far below MIN_DISTANCE_MPC
    // (~309 km), where the near-plane ratio stops being well conditioned. The
    // floor is a max of the two, so the absolute floor wins for tiny pivots.
    const moonlet: SelectionRow = {
      type: 'body',
      id: 'moonlet',
      label: 'Moonlet',
      positionMpc: [0, 0, 0],
      radiusM: 10000,
    };
    expect(pivotFraming(moonlet).floorMpc).toBe(MIN_DISTANCE_MPC);
  });

  it('falls through to the global ratio for a star, and to the absolute floor for a galaxy / no focus', () => {
    const star: SelectionRow = {
      type: 'star',
      index: 7,
      positionMpc: [1, 2, 3],
      absMag: 4,
      bpRp: 0.6,
      radiusM: 696340000,
    };
    expect(pivotFraming(star).floorMpc).toBeCloseTo(
      696340 * SCALE_UNITS.KM_TO_MPC * SURFACE_STANDOFF_RADII,
      30,
    );
    expect(pivotFraming(makeGalaxyRow({ diameterKpc: 30 }))).toEqual({
      radiusMpc: null,
      floorMpc: MIN_DISTANCE_MPC,
    });
    expect(pivotFraming(null)).toEqual({ radiusMpc: null, floorMpc: MIN_DISTANCE_MPC });
  });
});
