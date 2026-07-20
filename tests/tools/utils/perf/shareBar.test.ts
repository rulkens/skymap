/**
 * shareBar — hand-computed cases pinning the eighth-block ramp and the exact
 * width. The partial-block index is the subtle part (a fraction lands between
 * two ramp glyphs), so a fractional case is verified by hand: 0.3125·4 = 1.25 →
 * one full block + a partial of 0.25·8 = 2 → the '▎' glyph. Every result must be
 * exactly `width` characters, or the surrounding table alignment drifts.
 */

import { describe, it, expect } from 'vitest';

import { shareBar } from '../../../../tools/utils/perf/shareBar';

describe('shareBar', () => {
  it('fills half of an 8-wide bar with full blocks then spaces', () => {
    expect(shareBar(0.5, 8)).toBe('████    ');
  });

  it('fills a full bar', () => {
    expect(shareBar(1, 4)).toBe('████');
  });

  it('renders an empty bar for zero', () => {
    expect(shareBar(0, 4)).toBe('    ');
  });

  it('renders a partial eighth-block for a fractional fill', () => {
    // 0.3125 · 4 = 1.25 → 1 full block, partial index round(0.25·8) = 2 → '▎'.
    expect(shareBar(0.3125, 4)).toBe('█▎  ');
  });

  it('renders an all-space bar for NaN', () => {
    expect(shareBar(NaN, 4)).toBe('    ');
  });

  it('always returns exactly width characters', () => {
    for (const [fraction, width] of [
      [0.5, 8],
      [1, 4],
      [0, 4],
      [0.3125, 4],
      [NaN, 4],
      [-0.2, 6],
      [2.0, 5],
    ] as const) {
      expect(shareBar(fraction, width).length).toBe(width);
    }
  });
});
