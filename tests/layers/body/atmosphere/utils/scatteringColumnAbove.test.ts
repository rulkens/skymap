/**
 * scatteringColumnAbove — the share of a body's scattering column above an eye, which sets how
 * adapted that eye is to a bright sky. Read off each row's own constituents, so a body's
 * falloff follows its own scale heights (Earth's molecules, Mars' dust) with no tuned constant.
 */
import { describe, expect, it } from 'vitest';
import { scatteringColumnAbove } from '../../../../../src/layers/body/atmosphere/utils/scatteringColumnAbove';
import { ATMOSPHERE_PARAMS } from '../../../../../src/layers/body/atmosphere/data/atmosphereParams';

const earth = ATMOSPHERE_PARAMS.earth!.constituents;
const mars = ATMOSPHERE_PARAMS.mars!.constituents;

describe('scatteringColumnAbove', () => {
  it('is the whole column at the floor and none from orbit', () => {
    expect(scatteringColumnAbove(earth, 0)).toBe(1);
    expect(scatteringColumnAbove(earth, 400)).toBeLessThan(1e-6);
  });

  it("follows each body's own scale heights", () => {
    // One molecular scale height up Earth (8 km) leaves ~1/e; Mars' 13 km dust leaves more.
    expect(scatteringColumnAbove(earth, 8)).toBeCloseTo(Math.exp(-1), 1);
    expect(scatteringColumnAbove(mars, 8)).toBeGreaterThan(scatteringColumnAbove(earth, 8));
  });

  it('ignores a constituent that only absorbs (ozone)', () => {
    const ozoneOnly = earth.filter((c) => c.profile.kind === 'tent');
    expect(scatteringColumnAbove([...ozoneOnly, earth[0]!], 8)).toBeCloseTo(Math.exp(-1), 6);
  });
});
