/**
 * fadeBand — one directional smoothstep serving both fade directions, so the
 * pins guard BOTH: the approach-fade band (`fullAt > goneAt`, fades out as the
 * value drops) and the recede-fade band (`fullAt < goneAt`, fades out as it
 * rises). The edge values here are the two production bands that used to own a
 * hand-rolled smoothstep each — the Milky-Way approach fade and the star-map
 * caption fade — so their load-bearing behaviours survive the consolidation.
 */

import { describe, it, expect } from 'vitest';

import { fadeBand } from '../../../src/utils/math/fadeBand';

describe('fadeBand — approach direction (fullAt > goneAt, fades out as value drops)', () => {
  // The Milky-Way impostor's near-side band: full ≥ 0.008 Mpc, gone ≤ 0.002.
  const mwApproach = { fullAt: 0.008, goneAt: 0.002 };

  it('is fully gone at and below the low (goneAt) edge', () => {
    expect(fadeBand(mwApproach, 0)).toBe(0);
    expect(fadeBand(mwApproach, 0.002)).toBe(0);
  });

  it('is at full strength at and above the high (fullAt) edge', () => {
    expect(fadeBand(mwApproach, 0.008)).toBe(1);
    expect(fadeBand(mwApproach, 0.04)).toBe(1);
  });

  it('sits exactly at the midpoint for a value at the band centre', () => {
    // Centre of [0.002, 0.008] is 0.005; smoothstep at t=0.5 is exactly 0.5.
    expect(fadeBand(mwApproach, 0.005)).toBeCloseTo(0.5, 5);
  });

  it('ramps monotonically up across the band', () => {
    let prev = -Infinity;
    for (let d = 0; d <= 0.01; d += 0.0002) {
      const a = fadeBand(mwApproach, d);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
});

describe('fadeBand — recede direction (fullAt < goneAt, fades out as value rises)', () => {
  // The star-caption neighbourhood band: full ≤ 12 pc, gone ≥ 25 pc.
  const starCaption = { fullAt: 12, goneAt: 25 };

  it('holds full alpha at and below the low (fullAt) edge', () => {
    expect(fadeBand(starCaption, 0)).toBe(1);
    expect(fadeBand(starCaption, 10.34)).toBe(1);
    expect(fadeBand(starCaption, 12)).toBe(1);
  });

  it('is fully gone at and above the high (goneAt) edge', () => {
    expect(fadeBand(starCaption, 25)).toBe(0);
    expect(fadeBand(starCaption, 1000)).toBe(0);
  });

  it('is strictly fractional mid-band', () => {
    const mid = fadeBand(starCaption, (12 + 25) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('ramps monotonically down across the band', () => {
    const a = fadeBand(starCaption, 14);
    const b = fadeBand(starCaption, 18.5);
    const c = fadeBand(starCaption, 23);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });
});
