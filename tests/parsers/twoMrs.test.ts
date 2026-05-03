import { describe, it, expect } from 'vitest';
import { parseTwoMrs } from '../../tools/parsers/twoMrs';
import { Source } from '../../src/data/sources';

const SAMPLE = [
  '12345678+1234567   180.000000 +30.000000 12.345 11.567 10.789                                                                                  3000.0',
  '23456789+0234567   200.000000 -10.000000  9.876  9.123  8.456                                                                                  6000.0',
  '34567890-1234567   100.000000 -20.000000 14.000 13.500 13.000                                                                                       0',
].join('\n');

describe('parseTwoMrs', () => {
  it('parses RA, Dec, mags, and converts cz → z', () => {
    const { records, skipped } = parseTwoMrs(SAMPLE);
    expect(skipped).toBe(1);
    expect(records).toHaveLength(2);
    const r0 = records[0]!;
    expect(r0.source).toBe(Source.TwoMRS);
    expect(r0.ra).toBeCloseTo(180);
    expect(r0.dec).toBeCloseTo(30);
    expect(r0.magG).toBeCloseTo(12.345);
    expect(r0.magR).toBeCloseTo(11.567);
    expect(r0.magI).toBeCloseTo(10.789);
    expect(Number.isNaN(r0.magU)).toBe(true);
    expect(Number.isNaN(r0.magZ)).toBe(true);
    expect(r0.z).toBeCloseTo(0.01001, 4);
    expect(r0.objID).toBe(0n);
  });
});
