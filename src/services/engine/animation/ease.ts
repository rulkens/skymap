/**
 * ease — runtime table for the `Ease` type (`@types/animation/Ease.ts`).
 *
 * INPUT clamps to [0,1] (slow-frame overshoot guard). OUTPUT does not: Back
 * and Elastic deliberately overshoot [0,1] — safe on yaw/pitch/target, but
 * an undershoot below 0 is a nonsensical `distance` channel value.
 *
 * Composed from ten `easeIn*` primitives (`BASE`) via `flipOut` and
 * `mirrorInOut` below. Back/Elastic's inOut arm uses different magic
 * constants than their in/out arm (easings.net's own choice, not derivable),
 * so those two are hand-written instead.
 */
import type { Ease } from '../../../@types/animation/Ease';

type Curve = (t: number) => number;

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/** Reflects an easeIn curve into its easeOut twin: `1 - f(1 - t)`. */
function flipOut(f: Curve): Curve {
  return (t: number) => 1 - f(1 - t);
}

/** Squashes an easeIn curve into [0,0.5] and its flipOut into [0.5,1]. */
function mirrorInOut(f: Curve): Curve {
  return (t: number) => (t < 0.5 ? f(2 * t) / 2 : 1 - f(2 - 2 * t) / 2);
}

/** Applies the input clamp to a composed (unclamped) curve. */
function clampInput(f: Curve): Curve {
  return (t: number) => f(clamp01(t));
}

const n1 = 7.5625;
const d1 = 2.75;
/** easings.net's bounce primitive; BASE.Bounce (easeIn) is defined from it below. */
function bounceOut(t: number): number {
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const s = t - 1.5 / d1;
    return n1 * s * s + 0.75;
  }
  if (t < 2.5 / d1) {
    const s = t - 2.25 / d1;
    return n1 * s * s + 0.9375;
  }
  const s = t - 2.625 / d1;
  return n1 * s * s + 0.984375;
}

const c1 = 1.70158;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;

/** The ten easeIn* primitives. Every other curve below is derived from one of these. */
const BASE = {
  Sine: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  Quad: (t: number) => t * t,
  Cubic: (t: number) => t * t * t,
  Quart: (t: number) => t ** 4,
  Quint: (t: number) => t ** 5,
  Expo: (t: number) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  Circ: (t: number) => 1 - Math.sqrt(1 - t * t),
  Back: (t: number) => c3 * t ** 3 - c1 * t * t,
  Elastic: (t: number) =>
    t === 0 || t === 1 ? t : -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * c4),
  Bounce: (t: number) => 1 - bounceOut(1 - t),
};

// c2/c5 replace c1,c3/c4 only in the inOut arm — see module header.
const c2 = c1 * 1.525;
const c5 = (2 * Math.PI) / 4.5;

function easeInOutBackRaw(t: number): number {
  return t < 0.5
    ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2
    : ((2 * t - 2) ** 2 * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
}

function easeInOutElasticRaw(t: number): number {
  if (t === 0 || t === 1) return t;
  return t < 0.5
    ? -(2 ** (20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
    : (2 ** (-20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
}

export const EASE: Record<Ease, Curve> = {
  linear: clampInput((t: number) => t),

  easeInSine: clampInput(BASE.Sine),
  easeOutSine: clampInput(flipOut(BASE.Sine)),
  easeInOutSine: clampInput(mirrorInOut(BASE.Sine)),

  easeInQuad: clampInput(BASE.Quad),
  easeOutQuad: clampInput(flipOut(BASE.Quad)),
  easeInOutQuad: clampInput(mirrorInOut(BASE.Quad)),

  easeInCubic: clampInput(BASE.Cubic),
  easeOutCubic: clampInput(flipOut(BASE.Cubic)),
  easeInOutCubic: clampInput(mirrorInOut(BASE.Cubic)),

  easeInQuart: clampInput(BASE.Quart),
  easeOutQuart: clampInput(flipOut(BASE.Quart)),
  easeInOutQuart: clampInput(mirrorInOut(BASE.Quart)),

  easeInQuint: clampInput(BASE.Quint),
  easeOutQuint: clampInput(flipOut(BASE.Quint)),
  easeInOutQuint: clampInput(mirrorInOut(BASE.Quint)),

  easeInExpo: clampInput(BASE.Expo),
  easeOutExpo: clampInput(flipOut(BASE.Expo)),
  easeInOutExpo: clampInput(mirrorInOut(BASE.Expo)),

  easeInCirc: clampInput(BASE.Circ),
  easeOutCirc: clampInput(flipOut(BASE.Circ)),
  easeInOutCirc: clampInput(mirrorInOut(BASE.Circ)),

  easeInBack: clampInput(BASE.Back),
  easeOutBack: clampInput(flipOut(BASE.Back)),
  easeInOutBack: clampInput(easeInOutBackRaw),

  easeInElastic: clampInput(BASE.Elastic),
  easeOutElastic: clampInput(flipOut(BASE.Elastic)),
  easeInOutElastic: clampInput(easeInOutElasticRaw),

  easeInBounce: clampInput(BASE.Bounce),
  easeOutBounce: clampInput(flipOut(BASE.Bounce)),
  easeInOutBounce: clampInput(mirrorInOut(BASE.Bounce)),
};
