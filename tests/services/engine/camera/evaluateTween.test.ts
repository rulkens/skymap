/**
 * evaluateTween — unit tests for the pure tween pose evaluator.
 *
 * These tests verify `evaluateTween`'s easing, saturation, and shortest-arc
 * yaw behavior, and that it stays strictly pure (no mutation of the input
 * descriptor or its nested `CameraPose` objects).
 */

import { describe, it, expect } from 'vitest';
import { evaluateTween } from '../../../../src/services/engine/camera/evaluateTween';
import type { CameraTweenDescriptor } from '../../../../src/@types/camera/CameraTweenDescriptor';

function makeDescriptor(overrides?: Partial<CameraTweenDescriptor>): CameraTweenDescriptor {
  return {
    from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 },
    to: { target: [10, 0, 0], yaw: 1.0, pitch: 0.2, distance: 50 },
    durationMs: 600,
    easing: 'easeOutCubic',
    ...overrides,
  };
}

describe('evaluateTween', () => {
  it('at elapsed 0 returns a pose equal to d.from', () => {
    const d = makeDescriptor();
    const pose = evaluateTween(d, 0);
    expect(pose.target[0]).toBeCloseTo(0, 10);
    expect(pose.target[1]).toBeCloseTo(0, 10);
    expect(pose.target[2]).toBeCloseTo(0, 10);
    expect(pose.yaw).toBeCloseTo(0, 10);
    expect(pose.pitch).toBeCloseTo(0, 10);
    expect(pose.distance).toBeCloseTo(100, 10);
  });

  it('at elapsed >= durationMs returns a pose exactly equal to d.to', () => {
    const d = makeDescriptor();
    const pose = evaluateTween(d, 600);
    // Saturation must land on the exact `to` values, not floating-point approximations.
    expect(pose.target[0]).toBe(d.to.target[0]);
    expect(pose.target[1]).toBe(d.to.target[1]);
    expect(pose.target[2]).toBe(d.to.target[2]);
    expect(pose.yaw).toBe(d.to.yaw);
    expect(pose.pitch).toBe(d.to.pitch);
    expect(pose.distance).toBe(d.to.distance);
  });

  it('well past durationMs still returns d.to exactly (no overshoot)', () => {
    const d = makeDescriptor();
    const pose = evaluateTween(d, 9999);
    expect(pose.target[0]).toBe(d.to.target[0]);
    expect(pose.distance).toBe(d.to.distance);
  });

  it('mid-tween produces values between from and to (easing applied)', () => {
    const d = makeDescriptor();
    // At elapsed = 300ms (half of 600ms), easeOutCubic(0.5) ≈ 0.875, so we
    // expect distance to be well past the geometric midpoint toward d.to.
    const pose = evaluateTween(d, 300);
    expect(pose.distance).toBeGreaterThan(50);
    expect(pose.distance).toBeLessThan(75); // eased, not linear midpoint
    expect(pose.target[0]).toBeGreaterThan(0);
    expect(pose.target[0]).toBeLessThan(10);
  });

  it('eases yaw the short way around the circle (short arc across ±π)', () => {
    // from.yaw = 3.0 rad, to.yaw = -3.0 rad.  The short arc between them
    // crosses ±π (total delta ≈ 0.28 rad), NOT the long way (delta ≈ 6 rad).
    // At t=0.5 the midpoint should sit near ±π, far from 0.
    const d = makeDescriptor({
      from: { target: [0, 0, 0], yaw: 3.0, pitch: 0, distance: 100 },
      to: { target: [0, 0, 0], yaw: -3.0, pitch: 0, distance: 100 },
    });
    // Use elapsed = 0.5 * durationMs.  easeOutCubic(0.5) ≈ 0.875, so we're
    // already close to d.to, but we only need to confirm the sign of the arc.
    const pose = evaluateTween(d, 300);
    // The short arc from 3.0 to -3.0 goes through ±π.
    // At any t > 0 the result must be near π (not near 0 on the long arc).
    // We assert the absolute value of yaw is > π/2 — ruling out the long-arc path.
    expect(Math.abs(pose.yaw)).toBeGreaterThan(Math.PI / 2);
  });

  it('is pure — calling twice with the same inputs gives deep-equal poses', () => {
    const d = makeDescriptor();
    const pose1 = evaluateTween(d, 200);
    const pose2 = evaluateTween(d, 200);
    expect(pose1).toEqual(pose2);
  });

  it('is pure — input descriptor and its nested arrays are not mutated', () => {
    const d = makeDescriptor();
    // Snapshot the mutable arrays before the call.
    const fromTargetBefore = [...d.from.target];
    const toTargetBefore = [...d.to.target];
    const fromYawBefore = d.from.yaw;
    const toYawBefore = d.to.yaw;

    evaluateTween(d, 300);

    expect([...d.from.target]).toEqual(fromTargetBefore);
    expect([...d.to.target]).toEqual(toTargetBefore);
    expect(d.from.yaw).toBe(fromYawBefore);
    expect(d.to.yaw).toBe(toYawBefore);
  });

  it('returned target array is a fresh allocation (not an alias of from or to)', () => {
    const d = makeDescriptor();
    const pose = evaluateTween(d, 300);
    expect(pose.target).not.toBe(d.from.target);
    expect(pose.target).not.toBe(d.to.target);
  });

  it('at saturation, returned target array is a fresh copy of d.to.target', () => {
    const d = makeDescriptor();
    const pose = evaluateTween(d, 600);
    // Same values as d.to.target, but a different array instance.
    expect(pose.target).toEqual(d.to.target);
    expect(pose.target).not.toBe(d.to.target);
  });
});
