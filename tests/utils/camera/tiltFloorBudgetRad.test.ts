/**
 * tiltFloorBudgetRad — the tilt floor's through-zero rotation budget
 * (rulings 14+16, R13-1). Unit-radius closed forms plus the property the
 * closed form exists to guarantee: spending exactly the budget lands the
 * displayed tilt on 0 — the budget is NOT the tilt itself (the anchor pivot
 * drags the local up along, so it is larger by the attenuation factor).
 */

import { describe, it, expect } from 'vitest';

import { tiltFloorBudgetRad } from '../../../src/utils/camera/tiltFloorBudgetRad';
import { quatFromAxisAngle } from '../../../src/utils/math/quatFromAxisAngle';
import { rotateVec3ByQuat } from '../../../src/utils/math/rotateVec3ByQuat';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const EAST: Vec3 = [1, 0, 0];

/** Displayed tilt after rotating (forward, eye) by `t` about EAST through `anchor`. */
function tiltAfter(forward: Vec3, eye: Vec3, anchor: Vec3, t: number): number {
  const q = quatFromAxisAngle(EAST, t);
  const f = rotateVec3ByQuat(q, forward);
  const rel = rotateVec3ByQuat(q, [eye[0] - anchor[0], eye[1] - anchor[1], eye[2] - anchor[2]]);
  const e: Vec3 = [anchor[0] + rel[0], anchor[1] + rel[1], anchor[2] + rel[2]];
  const mag = Math.hypot(...e);
  const vert = (f[0] * e[0] + f[1] * e[1] + f[2] * e[2]) / mag;
  return Math.acos(Math.max(-1, Math.min(1, -vert)));
}

describe('tiltFloorBudgetRad', () => {
  it('is exactly 0 at nadir — the by-reference dead-stop path', () => {
    expect(tiltFloorBudgetRad([0, 0, -1], [0, 0, 2], [0, 0, 1], EAST)).toBe(0);
  });

  it('matches the sub-eye closed form τ + asin((h/R)·sinτ), not the tilt', () => {
    // At h = R the attenuation halves the displayed tilt, so the budget is
    // exactly 2τ — the ×(1 + h/R)-class gap the unsigned-tilt bound missed.
    const tau = 0.3;
    const f: Vec3 = [0, Math.sin(tau), -Math.cos(tau)];
    expect(tiltFloorBudgetRad(f, [0, 0, 2], [0, 0, 1], EAST)).toBeCloseTo(2 * tau, 12);
    expect(tiltFloorBudgetRad(f, [0, 0, 1.5], [0, 0, 1], EAST)).toBeCloseTo(
      tau + Math.asin(0.5 * Math.sin(tau)),
      12,
    );
  });

  it('spending exactly the budget lands the displayed tilt on 0', () => {
    // Both real drag geometries: the sub-eye anchor and an anchor ON the
    // tilted forward ray (a screen-centre pick), where the in-plane solve
    // has no simple closed form to compare against.
    const tau = 0.5;
    const f: Vec3 = [0, Math.sin(tau), -Math.cos(tau)];
    const eye: Vec3 = [0, 0, 2];
    const subEye: Vec3 = [0, 0, 1];
    const eDotF = eye[2] * f[2]; // near ray-sphere root on the unit body
    const tRay = -eDotF - Math.sqrt(eDotF * eDotF - 3);
    const onRay: Vec3 = [0, f[1] * tRay, 2 + f[2] * tRay];
    for (const anchor of [subEye, onRay]) {
      const budget = tiltFloorBudgetRad(f, eye, anchor, EAST);
      expect(budget).toBeGreaterThan(tau); // strictly more than the tilt
      expect(tiltAfter(f, eye, anchor, -budget)).toBeLessThan(1e-6);
      // …and one step short of it does NOT land: the bound is tight.
      expect(tiltAfter(f, eye, anchor, -(budget - 0.05))).toBeGreaterThan(0.01);
    }
  });

  it('is 0 for a pose already past the floor about this axis', () => {
    // Forward tipped to the FAR side of nadir (about EAST): lowering further
    // digs the crossing deeper, so the whole budget is spent.
    const f: Vec3 = [0, -Math.sin(0.3), -Math.cos(0.3)];
    expect(tiltFloorBudgetRad(f, [0, 0, 2], [0, 0, 1], EAST)).toBe(0);
  });

  it('is Infinity when no rotation about the axis reaches tilt 0', () => {
    // A lateral anchor: |K| > √(P² + Q²), the orbit never looks straight
    // down, so there is no crossing to cap.
    expect(tiltFloorBudgetRad([0, 0, -1], [0, 6, 1], [0, 1, 0], EAST)).toBe(Infinity);
  });
});
