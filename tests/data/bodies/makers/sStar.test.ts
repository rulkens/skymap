import { describe, it, expect } from 'vitest';
import { sStar, GALACTIC_CENTRE_SKY_FRAME } from '../../../../src/data/bodies/makers/sStar';
import { S_STAR_SEEDS } from '../../../../src/data/bodies/sStarElements';
import { keplerianEllipse } from '../../../../src/utils/orbit/keplerianEllipse';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { SStarSeed } from '../../../../src/@types/scene/SStarSeed';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('sStar()', () => {
  it("S2's semi-major axis converts to 1026 AU", () => {
    // Hand-computed from the published angular axis and R₀: 0.1255″ × 8178 AU/″
    // = 1026.339 AU. Pins the arcsec → AU → Mpc leg, which nothing else checks.
    const s2 = sStar(S_STAR_SEEDS.find((seed) => seed.id === 's2')!);
    expect(s2.semiMajorMpc / SCALE_UNITS.AU_TO_MPC).toBeCloseTo(1026.339, 3);
  });

  it('a face-on prograde orbit starts due North and moves East', () => {
    // The mirror gate. Thiele-Innes, not our maker, is the oracle: with
    // (i, Ω, ω) = (0, 0, 0) the star sits at North at E = 0 and moves toward
    // East, so P̂ = +North and Q̂ = +East. keplerianEllipse returns WORLD
    // vectors, hence the projection onto the frame basis rather than reading
    // components. Drop the i flip and Q̂ lands on −xAxis (West) while P̂ is
    // unchanged — the semi-minor sign is the single discriminating bit.
    const faceOn: SStarSeed = {
      id: 'synthetic-face-on',
      label: 'synthetic',
      semiMajorArcsec: 0.5,
      eccentricity: 0.5,
      inclinationDeg: 0,
      ascendingNodeDeg: 0,
      argPeriapsisDeg: 0,
      periapsisEpochYr: 2000,
      periodYr: 100,
      kMag: 15,
      spectralClass: 'early',
    };

    const { semiMajorMpc, semiMinorMpc } = keplerianEllipse(sStar(faceOn));

    expect(dot(semiMajorMpc, GALACTIC_CENTRE_SKY_FRAME.yAxis)).toBeGreaterThan(0);
    expect(dot(semiMinorMpc, GALACTIC_CENTRE_SKY_FRAME.xAxis)).toBeGreaterThan(0);
  });

  it('every S-star focuses on sgr-a-star', () => {
    for (const seed of S_STAR_SEEDS) {
      expect(sStar(seed).focusId).toBe('sgr-a-star');
    }
  });

  it('trails carry their own star’s hue — late-type warm, early-type cool', () => {
    // The point of deriving the tint rather than flattening all 39 to one blue.
    // Asserted as a SIGN on (red − blue), not as tint values: the bin
    // temperatures are tuning knobs, but "a red giant's trail is not blue" is
    // the property, and it fails the moment the derivation drops the class
    // flag or reverts to a constant.
    for (const seed of S_STAR_SEEDS) {
      const [r, , b] = sStar(seed).color;
      if (seed.spectralClass === 'early') expect(b).toBeGreaterThan(r);
      if (seed.spectralClass === 'late') expect(r).toBeGreaterThan(b);
    }
  });

  it('no trail tint exceeds the additive-HDR ceiling', () => {
    // `temperatureToLinearRgb` returns a PURE hue with its brightest channel
    // pinned to 1.0. Handing that straight to the additive trail draw blows
    // out; `palette.ts` states the ≲ 0.5 ceiling every hand-authored trail
    // tint honours, and a derived one has to honour it too.
    for (const seed of S_STAR_SEEDS) {
      expect(Math.max(...sStar(seed).color)).toBeLessThanOrEqual(0.5);
    }
  });
});
