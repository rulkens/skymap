/**
 * Selectable tone-mapping curves for the HDR post-process.  Mirrors
 * the pattern of `src/data/sources.ts` and `src/data/biasMode.ts`
 * (numeric `as const` object + ALL_* array + label fn).  The numeric
 * values land verbatim in the shader's `curve: u32` uniform so DON'T
 * renumber without also updating the curve dispatch in `src/services/gpu/shaders/compositor/fragment.wesl`.
 *
 * ### What is tone-mapping and why do we need it?
 *
 * Every visible draw pass writes its contribution into an HDR
 * `rgba16float` offscreen target with additive blending.  In dense
 * regions (cluster cores) the accumulated value can easily reach 5-10
 * before any per-channel alpha clamp.  The swap chain is
 * 8-bit-per-channel sRGB-ish (`bgra8unorm`) — anything above 1.0
 * just clips to white.  A tone-map curve is the function that
 * compresses the HDR signal into [0, 1] *gracefully*: bright cores
 * stay distinguishably brighter than mid-density regions instead of
 * clipping flat to white, and dim filaments can be lifted out of the
 * noise floor.
 *
 * ### Why five curves and not just one?
 *
 * No single curve is right for every visualization goal.  Reinhard is
 * the cinematic "smooth roll-off" default.  Asinh / Lupton stretch is
 * what SDSS's image pipeline uses to make filamentary structure
 * legible.  Gamma 2.0 is the cheapest possible midtone lift.  ACES
 * adds a Hollywood-style shoulder-and-toe S-curve.  Linear / Clamp is
 * the *baseline* — it's what you see before any tone-mapping, useful
 * for "what is HDR even buying us" comparison.
 */
export const ToneMapCurve = {
  /** Linear / Clamp — no tone mapping; pre-HDR baseline. */
  Linear: 0,
  /** Reinhard-extended — smooth, "natural" highlight roll-off. */
  Reinhard: 1,
  /** Asinh stretch — Lupton-style, lifts dim filamentary structure. */
  Asinh: 2,
  /** Gamma 2.0 — simple sqrt-style midtone lift. */
  Gamma2: 3,
  /** ACES filmic (Narkowicz approx) — cinematic S-curve. */
  Aces: 4,
} as const;

// Type lives in `@types/data/ToneMapCurve` (inlined literal union for
// value-free .d.ts).  Re-imported here under an alias because the
// value-level `ToneMapCurve` const above otherwise shadows the type at
// in-file usage sites.  Consumers deep-import the type directly.
import type { ToneMapCurve as ToneMapCurveT } from '../@types/data/ToneMapCurve';

export const ALL_TONE_MAP_CURVES: ReadonlyArray<ToneMapCurveT> = [
  ToneMapCurve.Linear,
  ToneMapCurve.Reinhard,
  ToneMapCurve.Asinh,
  ToneMapCurve.Gamma2,
  ToneMapCurve.Aces,
];

/**
 * Whitepoint for the Reinhard-extended curve — the post-exposure input at which
 * it reaches exactly 1.0. Not a settings field: a curve's shape is fixed, only
 * the curve CHOICE is user-facing.
 */
export const REINHARD_WHITEPOINT = 4.0;

/** Softness for the asinh stretch — higher = more aggressive low-end lift. */
export const ASINH_SOFTNESS = 10.0;

/**
 * The post-exposure input at which a curve reaches 1.0 and stops separating
 * values — everything brighter clamps to the same white.
 *
 * Lives beside the curves because it is a property OF each curve, derived from
 * the same formula `lib/tonemap.wesl` implements, and because the alternative is
 * every consumer hardcoding one curve's number and being silently wrong for the
 * other four. The HDR headroom knee is the consumer that forced the question:
 * spilling over-white energy is only meaningful above the point where the curve
 * gave up, and that point moves by a factor of seven across this set.
 */
export function toneMapCurveSaturation(curve: ToneMapCurveT): number {
  switch (curve) {
    // clamp(c, 0, 1) — saturates the moment it hits unity.
    case ToneMapCurve.Linear:
      return 1.0;
    // c·(1 + c/W²)/(1 + c) equals 1.0 at c = W by construction.
    case ToneMapCurve.Reinhard:
      return REINHARD_WHITEPOINT;
    // asinh(k·c)/asinh(k) equals 1.0 at c = 1 for any k.
    case ToneMapCurve.Asinh:
      return 1.0;
    // sqrt(clamp(c, 0, 1)) — the clamp saturates first.
    case ToneMapCurve.Gamma2:
      return 1.0;
    // Narkowicz ACES: numerator meets denominator where 0.08c² − 0.56c − 0.14 = 0,
    // i.e. c = (7 + sqrt(56)) / 2. Far the highest of the five, which is why a
    // knee tuned on Reinhard spills long before ACES has run out of range.
    case ToneMapCurve.Aces:
      return 7.24;
  }
}

export function toneMapCurveLabel(curve: ToneMapCurveT): string {
  switch (curve) {
    case ToneMapCurve.Linear:
      return 'Linear (baseline)';
    case ToneMapCurve.Reinhard:
      return 'Reinhard (natural)';
    case ToneMapCurve.Asinh:
      return 'Asinh (filaments)';
    case ToneMapCurve.Gamma2:
      return 'Gamma 2.0';
    case ToneMapCurve.Aces:
      return 'ACES (cinematic)';
  }
}
