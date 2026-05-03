import { describe, it, expect } from 'vitest';
import { parseSixDfgs } from '../../tools/parsers/sixDfgs';
import { Source } from '../../src/data/sources';

const SAMPLE = `# 6dFGS DR3 — col2=RA, col3=Dec, col4=z, col5=q, col7=Kmag
g0001  300.0  -45.0  0.04  4  0.0  10.5
g0002  150.0   -5.0  0.10  3  0.0  11.2
g0003  200.0  -30.0  0.08  4  0.0  12.0
g0004  100.0  -10.0  -0.01 4  0.0  13.5
`;

describe('parseSixDfgs', () => {
  it('keeps q == 4 rows with positive z; skips others', () => {
    const { records, skipped } = parseSixDfgs(SAMPLE);
    expect(skipped).toBe(2);
    expect(records).toHaveLength(2);
    const r0 = records[0]!;
    expect(r0.source).toBe(Source.SixDFGS);
    expect(r0.ra).toBeCloseTo(300);
    expect(r0.dec).toBeCloseTo(-45);
    expect(r0.z).toBeCloseTo(0.04);
    expect(r0.magI).toBeCloseTo(10.5);
    expect(Number.isNaN(r0.magG)).toBe(true);
    expect(Number.isNaN(r0.magR)).toBe(true);
  });
});
