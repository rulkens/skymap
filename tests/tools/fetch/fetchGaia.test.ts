import { describe, it, expect } from 'vitest';

import { planRandomIndexSlices, pageFileName } from '../../../tools/fetch/fetchGaia';

describe('planRandomIndexSlices', () => {
  it('tiles [0, total) contiguously: 1000 into 4 → bounds 0|250|500|750|1000', () => {
    const slices = planRandomIndexSlices(1000, 4);
    expect(slices.map((s) => s.start)).toEqual([0, 250, 500, 750]);
    expect(slices.map((s) => s.endExclusive)).toEqual([250, 500, 750, 1000]);
    // Each start equals the previous endExclusive — no gaps, no overlaps.
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i]!.start).toBe(slices[i - 1]!.endExclusive);
    }
  });

  it('a non-divisible total loses no rows: 1003 into 4 → last endExclusive is 1003', () => {
    const slices = planRandomIndexSlices(1003, 4);
    // First start is 0, last endExclusive is exactly total — the union is [0, 1003).
    expect(slices[0]!.start).toBe(0);
    expect(slices[slices.length - 1]!.endExclusive).toBe(1003);
    // Contiguous, and no empty slice swallowed the remainder.
    for (let i = 0; i < slices.length; i++) {
      expect(slices[i]!.endExclusive).toBeGreaterThan(slices[i]!.start);
      if (i > 0) expect(slices[i]!.start).toBe(slices[i - 1]!.endExclusive);
    }
  });
});

describe('pageFileName', () => {
  it("pads to four digits: 3 → 'gaia_page_0003.csv'; 1234 → 'gaia_page_1234.csv'", () => {
    expect(pageFileName(3)).toBe('gaia_page_0003.csv');
    expect(pageFileName(1234)).toBe('gaia_page_1234.csv');
  });
});
