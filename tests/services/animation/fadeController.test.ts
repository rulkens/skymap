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
    expect(c.targetOf()).toBe(1); // at rest, holding 1
  });

  it('setImmediate skips animation and sets opacity instantly', () => {
    const c = createFadeController(0, 1000);
    c.setImmediate(1);
    expect(c.currentOpacity(1000)).toBe(1);
    expect(c.isAnimating(1000)).toBe(false);
  });

  it('fadeTo Promise resolves only after tick observes !isAnimating', async () => {
    const c = createFadeController(0, 1000);
    let resolved = false;
    c.fadeTo(1, 600, 1000).then(() => {
      resolved = true;
    });
    // Tick before the ramp ends — should NOT resolve.
    c.tick(1300);
    await Promise.resolve();
    expect(resolved).toBe(false);
    // Tick after the ramp ends — should resolve.
    c.tick(1600);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('Promise also resolves when fade target is reached via setImmediate', async () => {
    const c = createFadeController(0, 1000);
    let resolved = false;
    c.fadeTo(1, 600, 1000).then(() => {
      resolved = true;
    });
    c.setImmediate(1);
    c.tick(1000);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('multiple concurrent fadeTo Promises each resolve at their own deadline', async () => {
    const c = createFadeController(0, 1000);
    let a = false,
      b = false;
    c.fadeTo(1, 600, 1000).then(() => {
      a = true;
    });
    c.fadeTo(0.5, 200, 1100).then(() => {
      b = true;
    });
    c.tick(1200);
    await Promise.resolve();
    expect(a).toBe(false);
    expect(b).toBe(false);
    c.tick(1300); // second fade ends at 1100 + 200 = 1300
    await Promise.resolve();
    expect(b).toBe(true);
    expect(a).toBe(false);
    c.tick(1600); // first would have ended at 1600 but was retargeted; resolves when no longer animating
    await Promise.resolve();
    expect(a).toBe(true);
  });
});
