import { describe, it, expect } from 'vitest';
import { formatRaSexagesimal } from '../../../src/utils/math/formatRaSexagesimal';

describe('formatRaSexagesimal', () => {
  it('formats 0° as 00h00m00.00s', () => {
    expect(formatRaSexagesimal(0)).toBe('00h00m00.00s');
  });

  it('formats 180° as 12h00m00.00s', () => {
    expect(formatRaSexagesimal(180)).toBe('12h00m00.00s');
  });

  it('formats 15° as 01h00m00.00s', () => {
    expect(formatRaSexagesimal(15)).toBe('01h00m00.00s');
  });

  it('formats 188.7365° as 12h34m56.76s', () => {
    // 188.7365 / 15 = 12.58243333…h → 12h, 0.58243333…×60 = 34.946m → 34m, 0.946×60 = 56.76s
    expect(formatRaSexagesimal(188.7365)).toBe('12h34m56.76s');
  });

  it('wraps -10° to 350° → 23h20m00.00s', () => {
    // -10° + 360° = 350°; 350/15 = 23.3333…h → 23h, 0.3333…×60 = 20m, 0s
    expect(formatRaSexagesimal(-10)).toBe('23h20m00.00s');
  });

  it('wraps 370° back to 10° → 00h40m00.00s', () => {
    // 370° - 360° = 10°; 10/15 = 0.6666…h → 0h, 0.6666…×60 = 40m, 0s
    expect(formatRaSexagesimal(370)).toBe('00h40m00.00s');
  });
});
