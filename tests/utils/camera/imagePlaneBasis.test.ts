/**
 * imagePlaneBasis tests — the camera's roll-adjusted up vector and the screen
 * right/up axes it induces.
 *
 *   rolledUp = upRef rotated about forward by roll (raw Rodrigues)
 *   right    = normalize(forward × rolledUp)   (||1-guarded)
 *   up       = normalize(right × forward)
 *
 * The cardinal cases pin hand-computed vectors; the oblique case asserts the
 * orthonormality PROPERTY (unit length + zero dot products) rather than
 * restating the formula, so it fails on a wrong derivation instead of mirroring
 * one. The pole-aligned case pins the ||1 guard — a degenerate forward∥upRef
 * must yield a finite (non-NaN) basis, not a divide-by-zero.
 */

import { describe, it, expect } from 'vitest';
import { imagePlaneBasis } from '../../../src/utils/camera/imagePlaneBasis';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

const normalize = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

describe('imagePlaneBasis', () => {
  it('roll=0 leaves rolledUp equal to upRef exactly', () => {
    // Oblique forward so the early-exit, not luck, is what preserves upRef.
    const forward = normalize([0.4, -0.7, 0.55]);
    const upRef: Vec3 = [0, 1, 0];
    const basis = imagePlaneBasis(forward, 0, upRef);
    // Byte-identical: the reroute of computeViewProj/cameraBillboardBasis relies
    // on roll=0 returning upRef untouched.
    expect(basis.rolledUp[0]).toBe(upRef[0]);
    expect(basis.rolledUp[1]).toBe(upRef[1]);
    expect(basis.rolledUp[2]).toBe(upRef[2]);
  });

  it('identity forward gives world-aligned axes', () => {
    const basis = imagePlaneBasis([0, 0, -1], 0, [0, 1, 0]);
    expect(basis.right[0]).toBeCloseTo(1, 6);
    expect(basis.right[1]).toBeCloseTo(0, 6);
    expect(basis.right[2]).toBeCloseTo(0, 6);
    expect(basis.up[0]).toBeCloseTo(0, 6);
    expect(basis.up[1]).toBeCloseTo(1, 6);
    expect(basis.up[2]).toBeCloseTo(0, 6);
  });

  it('axes are orthonormal for an oblique forward + roll', () => {
    const forward = normalize([0.3, 0.5, -0.8]);
    const basis = imagePlaneBasis(forward, 0.9, [0, 1, 0]);
    expect(len(basis.right)).toBeCloseTo(1, 6);
    expect(len(basis.up)).toBeCloseTo(1, 6);
    expect(dot(basis.right, basis.up)).toBeCloseTo(0, 6);
    expect(dot(basis.right, forward)).toBeCloseTo(0, 6);
    expect(dot(basis.up, forward)).toBeCloseTo(0, 6);
  });

  it('roll rotates the basis about forward', () => {
    const basis = imagePlaneBasis([0, 0, -1], Math.PI / 2, [0, 1, 0]);
    expect(basis.right[0]).toBeCloseTo(0, 6);
    expect(basis.right[1]).toBeCloseTo(1, 6);
    expect(basis.right[2]).toBeCloseTo(0, 6);
    expect(basis.up[0]).toBeCloseTo(-1, 6);
    expect(basis.up[1]).toBeCloseTo(0, 6);
    expect(basis.up[2]).toBeCloseTo(0, 6);
  });

  it('forward parallel to upRef yields a finite (non-NaN) basis', () => {
    const basis = imagePlaneBasis([0, 1, 0], 0, [0, 1, 0]);
    for (const v of [basis.rolledUp, basis.right, basis.up]) {
      expect(Number.isFinite(v[0])).toBe(true);
      expect(Number.isFinite(v[1])).toBe(true);
      expect(Number.isFinite(v[2])).toBe(true);
    }
  });

  it('writes into out when provided and returns the same reference', () => {
    const out = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] } as {
      rolledUp: Vec3;
      right: Vec3;
      up: Vec3;
    };
    const result = imagePlaneBasis([0, 0, -1], 0, [0, 1, 0], out);
    expect(result).toBe(out);
    expect(out.right[0]).toBeCloseTo(1, 6);
    expect(out.up[1]).toBeCloseTo(1, 6);
  });
});
