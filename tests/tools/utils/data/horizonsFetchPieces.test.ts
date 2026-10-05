import { describe, it, expect } from 'vitest';
import { horizonsFetchPieces } from '../../../../tools/utils/data/horizonsFetchPieces';

const ms = (s: string): number => Date.parse(`${s.replace(' ', 'T')}Z`);

describe('horizonsFetchPieces', () => {
  it('cuts a 1900-2100 day-step row at the four 50-year boundaries', () => {
    expect(horizonsFetchPieces(['1900-01-01', '2100-01-01'], 1440)).toEqual([
      ['1900-01-01 00:00', '1950-01-01 00:00'],
      ['1950-01-01 00:00', '2000-01-01 00:00'],
      ['2000-01-01 00:00', '2050-01-01 00:00'],
      ['2050-01-01 00:00', '2100-01-01 00:00'],
    ]);
  });

  it('yields nothing before a mid-chunk start and keeps every piece within the row cap', () => {
    const pieces = horizonsFetchPieces(['1977-09-05', '2100-01-01'], 1);
    expect(pieces[0]![0]).toBe('1977-09-05 00:00');
    expect(pieces.at(-1)![1]).toBe('2100-01-01 00:00');
    for (const [a, b] of pieces) expect((ms(b) - ms(a)) / 60_000).toBeLessThanOrEqual(89_000);
  });

  it('splits a fine-step row into contiguous equal pieces under the cap', () => {
    const pieces = horizonsFetchPieces(['1900-01-01', '1950-01-01'], 80);
    expect(pieces.length).toBeGreaterThan(1);
    pieces.forEach(([a, b], i) => {
      if (i > 0) expect(a).toBe(pieces[i - 1]![1]);
      expect((ms(b) - ms(a)) / (80 * 60_000)).toBeLessThanOrEqual(89_000);
    });
  });
});
