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

import { pivotRadiusMpc } from '../../../../src/services/engine/camera/pivotRadiusMpc';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { makeGalaxyRow } from '../../../fixtures/makeGalaxyRow';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';

const EARTH_ROW: SelectionRow = {
  type: 'body',
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0],
  radiusKm: 6371,
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
      radiusKm: 696340,
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
