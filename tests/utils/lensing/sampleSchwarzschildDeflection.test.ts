import { describe, it, expect } from 'vitest';

import { buildSchwarzschildDeflectionLut } from '../../../src/utils/lensing/buildSchwarzschildDeflectionLut';
import { sampleSchwarzschildDeflection } from '../../../src/utils/lensing/sampleSchwarzschildDeflection';
import { CRITICAL_IMPACT_PARAM_RS } from '../../../src/utils/lensing/criticalImpactParamRs';

const LUT = buildSchwarzschildDeflectionLut(4096);
const alpha = (impactParamRs: number) => sampleSchwarzschildDeflection(LUT, impactParamRs);

describe('sampleSchwarzschildDeflection', () => {
  it('crosses the captured boundary without ever producing NaN', () => {
    // The cell straddling b_c holds one Infinity end, and a plain lerp turns
    // that into NaN (Infinity * 0) exactly at the finite end — a value that
    // would silently poison a root solve rather than reading as "captured".
    for (let i = 0; i <= 400; i++) {
      const impactParamRs = CRITICAL_IMPACT_PARAM_RS * (0.9 + (0.4 * i) / 400);
      const value = alpha(impactParamRs);
      expect(Number.isNaN(value)).toBe(false);
      expect(value).toBeGreaterThan(0);
    }
    expect(alpha(CRITICAL_IMPACT_PARAM_RS)).toBe(Infinity);
  });

  it('continues past the table as a 1/b tail pinned to its endpoint', () => {
    // The fragment shader extends the domain the same way; a drift here would
    // put an S-star image and the lensed sky behind it at different angles.
    const endpoint = LUT.samples[LUT.samples.length - 1]!;
    expect(alpha(LUT.maxImpactParamRs)).toBeCloseTo(endpoint, 12);
    expect(alpha(LUT.maxImpactParamRs * (1 + 1e-9))).toBeCloseTo(endpoint, 8);
    expect(alpha(LUT.maxImpactParamRs * 10)).toBeCloseTo(endpoint / 10, 12);
  });
});
