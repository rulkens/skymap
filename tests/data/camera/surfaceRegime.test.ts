/**
 * setSurfaceBand — the round-9 slider write path into the ONE regime/band
 * home (ruling 11). What can break: the hysteresis collapsing (disengage
 * must stay ≥ engage × the ratio, with the knob the user moved winning and
 * the other yielding) and values escaping the slider ranges.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { setSurfaceBand, SURFACE_REGIME } from '../../../src/data/camera/surfaceRegime';

const BAND_AT_LOAD = {
  engageHR: SURFACE_REGIME.engageHR,
  disengageHR: SURFACE_REGIME.disengageHR,
};

afterEach(() => {
  setSurfaceBand(BAND_AT_LOAD);
});

describe('setSurfaceBand', () => {
  it('pulling disengage down drags engage below it — hysteresis never collapses', () => {
    // Ruling 19 dropped engageHR's default to 0.2, flush against disengageMin
    // (0.2) — the window that still clears the disengage floor while landing
    // inside engage × minRatio (0.22) is now this narrow, not the old 1.5.
    const moved = setSurfaceBand({ disengageHR: 0.21 });
    expect(SURFACE_REGIME.disengageHR).toBe(0.21);
    expect(SURFACE_REGIME.engageHR).toBeCloseTo(0.21 / 1.1, 12);
    expect(SURFACE_REGIME.disengageHR).toBeGreaterThanOrEqual(
      SURFACE_REGIME.engageHR * 1.1 - 1e-12,
    );
    expect(moved).toBe('engage'); // the OTHER knob than the one patched
  });

  it('pushing engage up drags disengage ahead of it', () => {
    const first = setSurfaceBand({ disengageHR: 1.5 }); // park the window low first
    expect(first).toBeNull(); // clears engage × minRatio unaided
    const second = setSurfaceBand({ engageHR: 3.0 });
    expect(SURFACE_REGIME.engageHR).toBe(3.0);
    expect(SURFACE_REGIME.disengageHR).toBeCloseTo(3.0 * 1.1, 12);
    expect(second).toBe('disengage');
  });

  it('clamps both knobs to their slider ranges', () => {
    const moved = setSurfaceBand({ engageHR: 0.01, disengageHR: 99 });
    expect(SURFACE_REGIME.engageHR).toBe(0.1);
    expect(SURFACE_REGIME.disengageHR).toBe(6.0);
    expect(moved).toBeNull(); // range clamp, not the hysteresis floor
  });
});
