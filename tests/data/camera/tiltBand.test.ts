/**
 * The cross-record invariant: `zeroHR ≤ SURFACE_REGIME.disengageHR`. Two
 * records with two write paths, and only one of them owns the edge the cap is
 * measured against — so a disengage that moves without dragging `zeroHR` down
 * leaves the blend still non-zero where the arm flips, which is a tilt pop no
 * unit test of either record alone would see.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { setSurfaceBand, SURFACE_REGIME } from '../../../src/data/camera/surfaceRegime';
import { setTiltBand, TILT_BAND } from '../../../src/data/camera/tiltBand';

const REGIME_AT_LOAD = {
  engageHR: SURFACE_REGIME.engageHR,
  disengageHR: SURFACE_REGIME.disengageHR,
};
const TILT_AT_LOAD = { fullHR: TILT_BAND.fullHR, zeroHR: TILT_BAND.zeroHR };

afterEach(() => {
  setSurfaceBand(REGIME_AT_LOAD);
  setTiltBand(TILT_AT_LOAD);
});

describe('setSurfaceBand ↔ TILT_BAND', () => {
  it('lowering disengage below the tilt band drags zeroHR down with it', () => {
    const below = TILT_BAND.zeroHR / 2;
    setSurfaceBand({ disengageHR: below });

    expect(SURFACE_REGIME.disengageHR).toBe(below);
    expect(TILT_BAND.zeroHR).toBe(below);
    // The window floor still holds after the drag, so the blend keeps a band
    // to run over rather than collapsing to a step.
    expect(TILT_BAND.zeroHR).toBeGreaterThanOrEqual(TILT_BAND.fullHR * 1.1 - 1e-12);
  });

  it('the cap outranks the window floor: zeroHR never passes disengage', () => {
    setSurfaceBand({ engageHR: 0.2, disengageHR: 0.3 });
    // Pushing fullHR up would normally raise zeroHR to fullHR × 1.1 (0.33);
    // the cap refuses, and fullHR is what yields.
    const moved = setTiltBand({ fullHR: 0.3 });

    expect(TILT_BAND.zeroHR).toBeLessThanOrEqual(SURFACE_REGIME.disengageHR);
    expect(moved).toBe('full');
  });
});
