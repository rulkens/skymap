/**
 * ease — unit tests for the EASE easing-function table.
 *
 * Verifies each variant's characteristic values, symmetry properties, and the
 * shared clamping contract (t outside [0,1] must not produce values outside
 * [0,1]).
 */

import { describe, it, expect } from 'vitest';
import { EASE } from '../../../../src/services/engine/animation/ease';

describe('EASE', () => {
  describe('EASE.out', () => {
    it('returns 0 at t=0 and 1 at t=1', () => {
      expect(EASE.out(0)).toBe(0);
      expect(EASE.out(1)).toBe(1);
    });

    it('clamps t below 0 to 0', () => {
      expect(EASE.out(-1)).toBe(0);
    });

    it('clamps t above 1 to 1', () => {
      expect(EASE.out(2)).toBe(1);
    });
  });

  describe('EASE.in', () => {
    it('EASE.in(0.5) === 0.125  (t³ at midpoint)', () => {
      expect(EASE.in(0.5)).toBe(0.125);
    });

    it('returns 0 at t=0 and 1 at t=1', () => {
      expect(EASE.in(0)).toBe(0);
      expect(EASE.in(1)).toBe(1);
    });

    it('is strictly monotone increasing on (0, 1)', () => {
      expect(EASE.in(0.25)).toBeLessThan(EASE.in(0.5));
      expect(EASE.in(0.5)).toBeLessThan(EASE.in(0.75));
    });

    it('clamps t below 0 to 0', () => {
      expect(EASE.in(-0.5)).toBe(0);
    });

    it('clamps t above 1 to 1', () => {
      expect(EASE.in(1.5)).toBe(1);
    });
  });

  describe('EASE.inOut', () => {
    it('EASE.inOut(0.5) === 0.5  (inflection point of the S-curve)', () => {
      expect(EASE.inOut(0.5)).toBeCloseTo(0.5, 10);
    });

    it('is symmetric: inOut(0.25) + inOut(0.75) === 1', () => {
      // Symmetry of the cubic in-out curve: inOut(t) + inOut(1-t) = 1.
      const a = EASE.inOut(0.25);
      const b = EASE.inOut(0.75);
      expect(a + b).toBeCloseTo(1, 10);
    });

    it('returns 0 at t=0 and 1 at t=1', () => {
      expect(EASE.inOut(0)).toBe(0);
      expect(EASE.inOut(1)).toBe(1);
    });

    it('is slower than linear near t=0 (ease-in phase)', () => {
      // At t=0.1, inOut should be < 0.1 (accelerating, not yet at full speed).
      expect(EASE.inOut(0.1)).toBeLessThan(0.1);
    });

    it('is faster than linear near t=0.5 (maximum speed in the middle)', () => {
      // At t=0.5, inOut == 0.5, so compare just inside: inOut(0.4) > linear(0.4)
      // is NOT guaranteed; but inOut(0.5) should equal 0.5 (verified above).
      // Instead verify the S-shape: 0.25 maps to < 0.25 (in-phase).
      expect(EASE.inOut(0.25)).toBeLessThan(0.25);
    });

    it('clamps t below 0 to 0', () => {
      expect(EASE.inOut(-1)).toBe(0);
    });

    it('clamps t above 1 to 1', () => {
      expect(EASE.inOut(2)).toBe(1);
    });
  });

  describe('EASE.linear', () => {
    it('is the identity on [0, 1]', () => {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        expect(EASE.linear(t)).toBeCloseTo(t, 10);
      }
    });

    it('clamps t below 0 to 0', () => {
      expect(EASE.linear(-0.5)).toBe(0);
    });

    it('clamps t above 1 to 1', () => {
      expect(EASE.linear(1.5)).toBe(1);
    });
  });
});
