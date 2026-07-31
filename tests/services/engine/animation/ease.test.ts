/**
 * ease — unit tests for the EASE easing-function table.
 *
 * EASE composes 31 curves from ten primitives via flipOut/mirrorInOut, so
 * mirror-symmetry checks (easeOut = 1 - easeIn(1-t), inOut symmetric about
 * 0.5) hold by construction and can't catch a wrong primitive (e.g. Quart
 * mistyped as t**3). REF below is an independent transcription of
 * easings.net's published formulas, compared pointwise — a real oracle.
 */

import { describe, it, expect } from 'vitest';
import { EASE } from '../../../../src/services/engine/animation/ease';
import type { Ease } from '../../../../src/@types/animation/Ease';

const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;
const c5 = (2 * Math.PI) / 4.5;
const n1 = 7.5625;
const d1 = 2.75;

function bounceOut(x: number): number {
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

// Verbatim from https://easings.net/ (ai/easings.net easingsFunctions.ts) — do not
// tidy into project style, that would reintroduce the transcription risk this guards.
const REF: Record<Ease, (x: number) => number> = {
  linear: (x) => x,
  easeInSine: (x) => 1 - Math.cos((x * Math.PI) / 2),
  easeOutSine: (x) => Math.sin((x * Math.PI) / 2),
  easeInOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  easeInQuad: (x) => x * x,
  easeOutQuad: (x) => 1 - (1 - x) * (1 - x),
  easeInOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  easeInCubic: (x) => x * x * x,
  easeOutCubic: (x) => 1 - Math.pow(1 - x, 3),
  easeInOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  easeInQuart: (x) => x * x * x * x,
  easeOutQuart: (x) => 1 - Math.pow(1 - x, 4),
  easeInOutQuart: (x) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2),
  easeInQuint: (x) => x * x * x * x * x,
  easeOutQuint: (x) => 1 - Math.pow(1 - x, 5),
  easeInOutQuint: (x) => (x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2),
  easeInExpo: (x) => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
  easeOutExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  easeInOutExpo: (x) =>
    x === 0
      ? 0
      : x === 1
        ? 1
        : x < 0.5
          ? Math.pow(2, 20 * x - 10) / 2
          : (2 - Math.pow(2, -20 * x + 10)) / 2,
  easeInCirc: (x) => 1 - Math.sqrt(1 - Math.pow(x, 2)),
  easeOutCirc: (x) => Math.sqrt(1 - Math.pow(x - 1, 2)),
  easeInOutCirc: (x) =>
    x < 0.5
      ? (1 - Math.sqrt(1 - Math.pow(2 * x, 2))) / 2
      : (Math.sqrt(1 - Math.pow(-2 * x + 2, 2)) + 1) / 2,
  easeInBack: (x) => c3 * x * x * x - c1 * x * x,
  easeOutBack: (x) => 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2),
  easeInOutBack: (x) =>
    x < 0.5
      ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
      : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2,
  easeInElastic: (x) =>
    x === 0 ? 0 : x === 1 ? 1 : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * c4),
  easeOutElastic: (x) =>
    x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1,
  easeInOutElastic: (x) =>
    x === 0
      ? 0
      : x === 1
        ? 1
        : x < 0.5
          ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2
          : (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1,
  easeInBounce: (x) => 1 - bounceOut(1 - x),
  easeOutBounce: bounceOut,
  easeInOutBounce: (x) =>
    x < 0.5 ? (1 - bounceOut(1 - 2 * x)) / 2 : (1 + bounceOut(2 * x - 1)) / 2,
};

const SAMPLES = Array.from({ length: 101 }, (_, i) => i / 100);
const REF_NAMES = Object.keys(REF) as Ease[];

describe('EASE', () => {
  it('covers exactly the same 31 names as the reference table', () => {
    expect(Object.keys(EASE).sort()).toEqual(REF_NAMES.slice().sort());
  });

  for (const name of REF_NAMES) {
    it(`${name} matches the published easings.net formula`, () => {
      for (const t of SAMPLES) {
        expect(EASE[name](t)).toBeCloseTo(REF[name](t), 12);
      }
    });
  }

  it('every curve clamps its input to [0, 1] (slow-frame overshoot guard)', () => {
    for (const name of REF_NAMES) {
      expect(EASE[name](1.001)).toBe(EASE[name](1));
      expect(EASE[name](-0.001)).toBe(EASE[name](0));
    }
  });

  it('Back overshoot is preserved, not output-clamped', () => {
    const outSamples = SAMPLES.map((t) => EASE.easeOutBack(t));
    const inSamples = SAMPLES.map((t) => EASE.easeInBack(t));
    expect(Math.max(...outSamples)).toBeGreaterThan(1);
    expect(Math.min(...inSamples)).toBeLessThan(0);
  });
});
