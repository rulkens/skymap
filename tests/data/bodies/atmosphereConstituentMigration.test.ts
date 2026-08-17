/**
 * Stage-1 migration gate: the constituent lists must reproduce the pre-refactor
 * coefficients exactly, for every row.
 *
 * END OF LIFE — delete this file at the start of stage 2, when six rows are
 * deliberately recalibrated onto physical channels and `LEGACY_ROWS` stops
 * describing anything true. It exists to catch a transcription slip among ~80
 * hand-moved numbers: a wrong coefficient on Saturn renders subtly wrong and
 * silently, which no other test or compiler check catches.
 */

import { describe, it, expect } from 'vitest';
import { ATMOSPHERE_PARAMS } from '../../../src/data/bodies/atmosphereParams';

type LegacyRow = {
  rayleighScatter: [number, number, number];
  rayleighScaleHeightKm: number;
  mieScatter: [number, number, number];
  mieAbsorption: number;
  mieScaleHeightKm: number;
  miePhaseG: number;
  ozoneAbsorption: [number, number, number];
  ozoneCenterKm: number;
  ozoneWidthKm: number;
};

// Frozen snapshot of `atmosphereParams.ts` at c25c84558 — the values the
// constituent lists must reproduce.
const LEGACY_ROWS: Record<string, LegacyRow> = {
  earth: {
    rayleighScatter: [5.8e-3, 13.6e-3, 33.1e-3],
    rayleighScaleHeightKm: 8,
    mieScatter: [3.9e-3, 3.9e-3, 3.9e-3],
    mieAbsorption: 4.4e-3,
    mieScaleHeightKm: 1.2,
    miePhaseG: 0.8,
    ozoneAbsorption: [0.65e-3, 1.881e-3, 0.085e-3],
    ozoneCenterKm: 25,
    ozoneWidthKm: 15,
  },
  venus: {
    rayleighScatter: [12e-3, 10e-3, 7e-3],
    rayleighScaleHeightKm: 15.9,
    mieScatter: [25e-3, 25e-3, 25e-3],
    mieAbsorption: 2e-3,
    mieScaleHeightKm: 5,
    miePhaseG: 0.7,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
  mars: {
    rayleighScatter: [8e-3, 5e-3, 3e-3],
    rayleighScaleHeightKm: 11.1,
    mieScatter: [10e-3, 10e-3, 10e-3],
    mieAbsorption: 4e-3,
    mieScaleHeightKm: 8,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
  jupiter: {
    rayleighScatter: [4e-3, 4e-3, 5e-3],
    rayleighScaleHeightKm: 27,
    mieScatter: [3e-3, 3e-3, 3e-3],
    mieAbsorption: 1e-3,
    mieScaleHeightKm: 12,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
  saturn: {
    rayleighScatter: [4e-3, 4e-3, 4e-3],
    rayleighScaleHeightKm: 59.5,
    mieScatter: [3e-3, 3e-3, 3e-3],
    mieAbsorption: 1e-3,
    mieScaleHeightKm: 25,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
  uranus: {
    rayleighScatter: [4e-3, 10e-3, 20e-3],
    rayleighScaleHeightKm: 27.7,
    mieScatter: [2e-3, 2e-3, 2e-3],
    mieAbsorption: 1e-3,
    mieScaleHeightKm: 12,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
  neptune: {
    rayleighScatter: [4e-3, 9e-3, 22e-3],
    rayleighScaleHeightKm: 20,
    mieScatter: [2e-3, 2e-3, 2e-3],
    mieAbsorption: 1e-3,
    mieScaleHeightKm: 10,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
  pluto: {
    rayleighScatter: [4.5e-7, 1.06e-6, 2.59e-6],
    rayleighScaleHeightKm: 50,
    mieScatter: [1.85e-4, 3.83e-4, 8.25e-4],
    mieAbsorption: 9.6e-6,
    mieScaleHeightKm: 50,
    miePhaseG: 0.5,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
  },
};

describe('atmosphere constituent migration', () => {
  it('covers every authored row', () => {
    expect(Object.keys(ATMOSPHERE_PARAMS).sort()).toEqual(Object.keys(LEGACY_ROWS).sort());
  });

  for (const [id, legacy] of Object.entries(LEGACY_ROWS)) {
    it(`${id} reproduces its pre-refactor coefficients`, () => {
      const row = ATMOSPHERE_PARAMS[id];
      if (row === undefined) throw new Error(`no authored row for '${id}'`);
      const cs = row.constituents;
      // A zero-width tent contributed nothing, so those rows drop the term
      // outright rather than carrying a sentinel.
      const hasOzone = legacy.ozoneWidthKm > 0;
      expect(cs.length).toBe(hasOzone ? 3 : 2);

      expect(cs[0]).toEqual({
        scatter: legacy.rayleighScatter,
        absorb: [0, 0, 0],
        profile: { kind: 'exponential', scaleHeightKm: legacy.rayleighScaleHeightKm },
        phase: { kind: 'rayleigh' },
      });

      expect(cs[1]).toEqual({
        scatter: legacy.mieScatter,
        absorb: [legacy.mieAbsorption, legacy.mieAbsorption, legacy.mieAbsorption],
        profile: { kind: 'exponential', scaleHeightKm: legacy.mieScaleHeightKm },
        phase: { kind: 'henyeyGreenstein', g: legacy.miePhaseG },
      });

      if (hasOzone) {
        expect(cs[2]).toEqual({
          scatter: [0, 0, 0],
          absorb: legacy.ozoneAbsorption,
          profile: { kind: 'tent', centerKm: legacy.ozoneCenterKm, widthKm: legacy.ozoneWidthKm },
          phase: { kind: 'rayleigh' },
        });
      }
    });
  }
});
