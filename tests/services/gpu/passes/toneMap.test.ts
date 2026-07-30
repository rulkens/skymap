/**
 * Pure-math tests for all five tone-mapping curves.  Each curve is
 * exported from `compositor.ts` as a JS helper so it can be unit-tested
 * without spinning up WebGPU.  The shader uses the same arithmetic, so
 * a regression in the JS form is a regression in the shader.
 *
 * For every curve we verify:
 *   - maps 0 → 0 (no negative/NaN flicker at black sky pixels)
 *   - is monotonic across the relevant input range
 *   - asymptotes / clamps to ≤ 1.0 at large input (no over-bright glitches)
 *   - exposure scales input multiplicatively (where applicable)
 *
 * Plus a few curve-specific assertions documented inline.
 */
import { describe, it, expect } from 'vitest';
import {
  linearClamp,
  reinhardExtended,
  asinhStretch,
  gamma2,
  acesFilmic,
} from '../../../../src/services/gpu/passes/compositor';

import {
  ToneMapCurve,
  ALL_TONE_MAP_CURVES,
  toneMapCurveSaturation,
} from '../../../../src/data/toneMapCurve';

const ALL_CURVES = [linearClamp, reinhardExtended, asinhStretch, gamma2, acesFilmic];

describe('tone-map curves — common invariants', () => {
  it('every curve maps 0 to 0', () => {
    for (const f of ALL_CURVES) {
      expect(f(0, 1)).toBeCloseTo(0, 6);
    }
  });

  it('every curve clamps output to [0, 1] across the practical input range', () => {
    for (const f of ALL_CURVES) {
      for (let c = 0; c < 100; c += 0.5) {
        const out = f(c, 1);
        expect(Number.isFinite(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it('every curve is monotonic non-decreasing', () => {
    for (const f of ALL_CURVES) {
      let prev = -Infinity;
      for (let c = 0; c < 10; c += 0.1) {
        const out = f(c, 1);
        expect(out).toBeGreaterThanOrEqual(prev - 1e-6);
        prev = out;
      }
    }
  });
});

describe('linearClamp', () => {
  it('passes inputs through up to 1.0 then clamps', () => {
    expect(linearClamp(0.5, 1)).toBeCloseTo(0.5, 6);
    expect(linearClamp(1.0, 1)).toBeCloseTo(1.0, 6);
    expect(linearClamp(2.0, 1)).toBeCloseTo(1.0, 6);
  });

  it('exposure scales before clamp', () => {
    expect(linearClamp(0.4, 2)).toBeCloseTo(0.8, 6);
    expect(linearClamp(0.6, 2)).toBeCloseTo(1.0, 6); // clipped
  });
});

describe('reinhardExtended', () => {
  it('asymptotes toward 1 for large input', () => {
    expect(reinhardExtended(100, 1)).toBeGreaterThan(0.9);
  });

  it('exposure scales the input before mapping', () => {
    expect(reinhardExtended(0.5, 2)).toBeCloseTo(reinhardExtended(1.0, 1), 4);
  });
});

describe('asinhStretch', () => {
  it('asymptotes toward 1 for large input', () => {
    expect(asinhStretch(100, 1)).toBeGreaterThan(0.9);
  });

  it('lifts the low end more aggressively than reinhardExtended', () => {
    // The whole point of asinh: more weight on dim values, so for any
    // small c > 0 the asinh output should exceed reinhardExtended's at
    // the same exposure.  This is the filament-friendly behaviour.
    for (const c of [0.05, 0.1, 0.25, 0.5]) {
      const a = asinhStretch(c, 1);
      const r = reinhardExtended(c, 1);
      expect(a).toBeGreaterThan(r);
    }
  });
});

describe('gamma2', () => {
  it('reproduces sqrt for typical inputs (gamma 2.0)', () => {
    expect(gamma2(0.25, 1)).toBeCloseTo(0.5, 4);
    expect(gamma2(0.5, 1)).toBeCloseTo(Math.SQRT1_2, 4);
    expect(gamma2(1.0, 1)).toBeCloseTo(1.0, 4);
  });

  it('clamps inputs above 1 to 1 (post-clamp gamma)', () => {
    expect(gamma2(2.0, 1)).toBeCloseTo(1.0, 4);
  });
});

describe('acesFilmic', () => {
  it('produces an S-curve: small input mapped < linear, mid input ~ linear', () => {
    // ACES is shoulder+toe; very small c gets a slight toe lift but
    // stays below the linear identity, while mid values track close
    // to it.  Exact numbers depend on the Narkowicz approximation;
    // we just assert the qualitative shape.
    expect(acesFilmic(0.5, 1)).toBeGreaterThan(0.3);
    expect(acesFilmic(0.5, 1)).toBeLessThan(0.7);
  });

  it('asymptotes toward 1 for large input', () => {
    expect(acesFilmic(100, 1)).toBeGreaterThan(0.9);
  });
});

describe('toneMapCurveSaturation', () => {
  // The saturation table is a set of claims ABOUT the curves — "this is where the
  // curve stops separating values". Nothing in the type system ties the two
  // together, so retuning REINHARD_WHITEPOINT or the Narkowicz coefficients would
  // silently leave the table pointing at the wrong place, and the HDR headroom
  // knee (which derives its default from it) would spill in the wrong regime.
  const CURVE_FN: Record<number, (c: number, exposure: number) => number> = {
    [ToneMapCurve.Linear]: linearClamp,
    [ToneMapCurve.Reinhard]: reinhardExtended,
    [ToneMapCurve.Asinh]: asinhStretch,
    [ToneMapCurve.Gamma2]: gamma2,
    [ToneMapCurve.Aces]: acesFilmic,
  };

  it('names the input where each curve actually reaches 1.0', () => {
    for (const curve of ALL_TONE_MAP_CURVES) {
      const saturation = toneMapCurveSaturation(curve);
      const f = CURVE_FN[curve]!;
      expect(f(saturation, 1)).toBeCloseTo(1.0, 2);
      // Every curve clamps, so "reaches 1.0 here" alone would also pass for a
      // value well ABOVE the true point — the flat shoulder swallows the error.
      // Pinning the SMALLEST such input needs the other side: 10% back the curve
      // must still be meaningfully separating, not already flat.
      expect(f(saturation * 0.9, 1)).toBeLessThan(0.999);
    }
  });
});
