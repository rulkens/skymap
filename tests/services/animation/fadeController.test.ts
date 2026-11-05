import { describe, it, expect } from 'vitest';
import { createFadeController } from '../../../src/services/animation/fadeController';

describe('createFadeController', () => {
  it('smoothstep-eases from sourceOpacity to targetOpacity over duration', () => {
    const c = createFadeController(0, 1000);
    c.fadeTo(1, 600, 1000);
    // Smoothstep at t=0: 0; t=0.5: 0.5; t=1: 1.
    expect(c.currentOpacity(1000)).toBeCloseTo(0, 5);
    expect(c.currentOpacity(1300)).toBeCloseTo(0.5, 5);
    expect(c.currentOpacity(1600)).toBeCloseTo(1, 5);
  });

  it('isAnimating returns false exactly at start + duration boundary', () => {
    const c = createFadeController(0, 1000);
    c.fadeTo(1, 600, 1000);
    expect(c.isAnimating(1599)).toBe(true);
    expect(c.isAnimating(1600)).toBe(false);
  });

  it('fadeTo at the held target does not restart the ramp', () => {
    const c = createFadeController(0, 1000);
    c.fadeTo(1, 600, 1000); // saturates at 1600
    // Retarget to the SAME value partway through, with a different duration.
    c.fadeTo(1, 9999, 1300);
    // Still saturates at the ORIGINAL deadline — t0 unmoved.
    expect(c.currentOpacity(1600)).toBeCloseTo(1, 5);
    expect(c.isAnimating(1600)).toBe(false);
  });

  it('mid-flight retarget picks up from the current value', () => {
    const c = createFadeController(0, 1000);
    c.fadeTo(1, 600, 1000); // start fade-in
    // At t=1300, opacity is 0.5 (mid-smoothstep).
    const mid = c.currentOpacity(1300);
    expect(mid).toBeCloseTo(0.5, 5);
    // Retarget to 0 over 100 ms.
    c.fadeTo(0, 100, 1300);
    // Source is now `mid` (0.5), target 0. At t=1300, opacity ≈ mid.
    expect(c.currentOpacity(1300)).toBeCloseTo(mid, 5);
    // At t=1350 (halfway through the 100 ms fade-out), smoothstep(0.5) = 0.5.
    // Source 0.5 → target 0, eased value = 0.5 + (0 - 0.5) * 0.5 = 0.25.
    expect(c.currentOpacity(1350)).toBeCloseTo(0.25, 5);
    // At t=1400, fully at 0.
    expect(c.currentOpacity(1400)).toBeCloseTo(0, 5);
  });

  it('targetOf reports the destination mid-ramp and the held value at rest', () => {
    const c = createFadeController(0, 1000);
    expect(c.targetOf()).toBe(0);
    c.fadeTo(1, 600, 1000);
    expect(c.targetOf()).toBe(1); // mid-ramp: still heading for 1
    expect(c.currentOpacity(1300)).toBeCloseTo(0.5, 5); // not there yet
    expect(c.currentOpacity(1700)).toBeCloseTo(1, 5); // past the 600ms ramp — at rest
    expect(c.targetOf()).toBe(1); // at rest, holding 1
  });

  it('setImmediate skips animation and sets opacity instantly', () => {
    const c = createFadeController(0, 1000);
    c.setImmediate(1);
    expect(c.currentOpacity(1000)).toBe(1);
    expect(c.isAnimating(1000)).toBe(false);
  });
});
