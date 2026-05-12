import { describe, it, expect } from 'vitest';
import { applyCurve } from '../../../src/services/input/spaceMouseSensitivity';
import type { SpaceMouseAxes } from '../../../src/@types/input/SpaceMouseAxes';

const ZERO: SpaceMouseAxes = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 };

describe('applyCurve', () => {
  it('cubes positive inputs at sensitivity = 1', () => {
    // 0.5³ = 0.125 — the canonical "cubic curve" check.
    const out = applyCurve({ ...ZERO, tx: 0.5 }, 1);
    expect(out.tx).toBeCloseTo(0.125, 6);
  });

  it('preserves sign for negative inputs (sign * |x|^3)', () => {
    // Math.pow(-0.5, 3) is well-defined in JS, but using sign * |x|^3 is the
    // safer idiom; the result must still be -0.125.
    const out = applyCurve({ ...ZERO, ty: -0.5 }, 1);
    expect(out.ty).toBeCloseTo(-0.125, 6);
  });

  it('maps zero input to exactly zero (no jitter from sign(0))', () => {
    const out = applyCurve(ZERO, 1);
    expect(out).toEqual(ZERO);
  });

  it('multiplies by the sensitivity scalar after cubing', () => {
    // (0.5)^3 * 2 = 0.25
    const out = applyCurve({ ...ZERO, rz: 0.5 }, 2);
    expect(out.rz).toBeCloseTo(0.25, 6);
  });

  it('preserves full-deflection ±1 (1³ * 1 = 1)', () => {
    const out = applyCurve({ tx: 1, ty: -1, tz: 1, rx: -1, ry: 1, rz: -1 }, 1);
    expect(out).toEqual({ tx: 1, ty: -1, tz: 1, rx: -1, ry: 1, rz: -1 });
  });

  it('damps inputs heavily near zero (the whole point of cubing)', () => {
    // 0.1³ = 0.001 — a 10% deflection becomes a 0.1% effective signal.
    const out = applyCurve({ ...ZERO, tx: 0.1 }, 1);
    expect(out.tx).toBeCloseTo(0.001, 6);
  });

  it('does not mutate its input', () => {
    const input: SpaceMouseAxes = { tx: 0.5, ty: 0.5, tz: 0.5, rx: 0.5, ry: 0.5, rz: 0.5 };
    const snapshot = { ...input };
    applyCurve(input, 2);
    expect(input).toEqual(snapshot);
  });
});
