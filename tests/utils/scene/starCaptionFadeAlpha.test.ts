/**
 * starCaptionFadeAlpha — the neighbourhood distance band must be a RAMP that
 * covers the whole seeded map from Earth.
 *
 * Load-bearing behaviours: within the FULL edge the caption is at full alpha
 * (the farthest seed, Pollux at 10.34 pc, must read from Earth — that is the
 * local-star-map requirement); mid-band it is strictly fractional (no pop on
 * the way out); beyond the GONE edge it is invisible (no far-out clobbering).
 */

import { describe, it, expect } from 'vitest';

import {
  starCaptionFadeAlpha,
  STAR_CAPTION_FULL_PC,
  STAR_CAPTION_GONE_PC,
} from '../../../src/utils/scene/starCaptionFadeAlpha';

describe('starCaptionFadeAlpha', () => {
  it('holds full alpha through the whole seeded map viewed from Earth', () => {
    // Pollux, the farthest seed, sits at 10.34 pc — inside the FULL edge, so
    // the entire map is at alpha 1 for a camera at Earth.
    expect(starCaptionFadeAlpha(0)).toBe(1);
    expect(starCaptionFadeAlpha(10.34)).toBe(1);
    expect(starCaptionFadeAlpha(STAR_CAPTION_FULL_PC)).toBe(1);
  });

  it('ramps a mid-band caption to a fractional alpha', () => {
    const mid = starCaptionFadeAlpha((STAR_CAPTION_FULL_PC + STAR_CAPTION_GONE_PC) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('is fully faded beyond the neighbourhood', () => {
    expect(starCaptionFadeAlpha(STAR_CAPTION_GONE_PC)).toBe(0);
    expect(starCaptionFadeAlpha(1000)).toBe(0);
  });

  it('decreases monotonically across the band', () => {
    const a = starCaptionFadeAlpha(14);
    const b = starCaptionFadeAlpha(18.5);
    const c = starCaptionFadeAlpha(23);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });
});
