/**
 * heatColor — with a LIVE palette, one value per band maps to the expected SGR
 * escape (the band edges are strict `<`, so the chosen sample sits clearly
 * inside each band); with a disabled palette the colorizer is the identity, so
 * piped/JSON output stays byte-clean. We assert the wrapped escape rather than
 * the returned function's identity because the escape is what a real bug (band
 * off-by-one, wrong palette slot) would corrupt.
 */

import { describe, it, expect } from 'vitest';

import { heatColor } from '../../../../tools/utils/perf/heatColor';
import { ansiPalette } from '../../../../tools/utils/cli/ansiPalette';

const live = ansiPalette(true);
const plain = ansiPalette(false);

describe('heatColor', () => {
  it('yellows a warm pass', () => {
    // 2 ≤ ms < 5 → yellow (SGR 33).
    expect(heatColor(3.0, live)('x')).toBe('\x1b[33mx\x1b[0m');
  });

  it('is the identity when the palette is disabled', () => {
    expect(heatColor(9.0, plain)('x')).toBe('x');
  });
});
