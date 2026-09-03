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
    setSurfaceBand({ disengageHR: 1.5 });
    expect(SURFACE_REGIME.disengageHR).toBe(1.5);
    expect(SURFACE_REGIME.engageHR).toBeCloseTo(1.5 / 1.1, 12);
    expect(SURFACE_REGIME.disengageHR).toBeGreaterThanOrEqual(
      SURFACE_REGIME.engageHR * 1.1 - 1e-12,
    );
  });

  it('pushing engage up drags disengage ahead of it', () => {
    setSurfaceBand({ disengageHR: 1.5 }); // park the window low first
    setSurfaceBand({ engageHR: 3.0 });
    expect(SURFACE_REGIME.engageHR).toBe(3.0);
    expect(SURFACE_REGIME.disengageHR).toBeCloseTo(3.0 * 1.1, 12);
  });

  it('clamps both knobs to their slider ranges', () => {
    setSurfaceBand({ engageHR: 0.2, disengageHR: 99 });
    expect(SURFACE_REGIME.engageHR).toBe(1.05);
    expect(SURFACE_REGIME.disengageHR).toBe(6.0);
  });
});
