import { describe, expect, it } from 'vitest';
import { structureApparentRadiusFade } from '../../../../src/layers/structure/present/structureApparentRadiusFade';

const style = {
  markerMaxApparentRadiusPx: 700,
  markerMaxApparentFadeBandPx: 400,
  markerMinApparentRadiusPx: 5,
  markerMinApparentFadeBandPx: 4,
};

describe('structureApparentRadiusFade', () => {
  it('is 1 between the two thresholds', () => {
    expect(structureApparentRadiusFade(style, 300)).toBe(1);
  });

  it('fades out past the close-approach threshold', () => {
    // t = (800 − 700) / 400 = 0.25; smoothstep = 0.25² · (3 − 0.5) = 0.15625
    expect(structureApparentRadiusFade(style, 800)).toBe(0.84375);
  });

  it('is 0 past the close-approach band', () => {
    expect(structureApparentRadiusFade(style, 1500)).toBe(0);
  });

  it('fades in above the far threshold', () => {
    // t = (6 − 5) / 4 = 0.25
    expect(structureApparentRadiusFade(style, 6)).toBe(0.15625);
  });

  it('is 0 below the far threshold', () => {
    expect(structureApparentRadiusFade(style, 3)).toBe(0);
  });
});
