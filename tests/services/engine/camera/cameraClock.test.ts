/**
 * cameraClock — unit tests for the engine animation clock Resource.
 *
 * All tests drive the clock via injected `nowMs` — no real wall-clock. This
 * validates the purity-of-source contract: the same (clock-state, args)
 * sequence always yields the same numbers.
 */

import { describe, it, expect } from 'vitest';
import {
  createCameraClock,
  tweenElapsed,
  autoRotateElapsed,
} from '../../../../src/services/engine/camera/cameraClock';
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

describe('createCameraClock', () => {
  it('initialises all fields to null / false', () => {
    const clock = createCameraClock();
    expect(clock.tweenStartMs).toBeNull();
    expect(clock.autoRotateStartMs).toBeNull();
    expect(clock.lastTweenRef).toBeNull();
    expect(clock.lastAutoRotateActive).toBe(false);
  });
});

describe('tweenElapsed', () => {
  it('returns 0 on the frame a new descriptor reference appears', () => {
    const clock = createCameraClock();
    const descA = makeDescriptor();
    expect(tweenElapsed(clock, descA, 1000)).toBe(0);
  });

  it('grows on later frames with the same reference', () => {
    const clock = createCameraClock();
    const descA = makeDescriptor();
    tweenElapsed(clock, descA, 1000); // arrival frame → 0
    expect(tweenElapsed(clock, descA, 1016)).toBe(16);
    expect(tweenElapsed(clock, descA, 1032)).toBe(32);
  });

  it('resets to 0 when a different descriptor object arrives', () => {
    const clock = createCameraClock();
    const descA = makeDescriptor();
    tweenElapsed(clock, descA, 1000);
    tweenElapsed(clock, descA, 1016);
    tweenElapsed(clock, descA, 1032);

    // descB is a separate object — structurally equal but a different reference.
    const descB = makeDescriptor();
    expect(tweenElapsed(clock, descB, 1100)).toBe(0);
  });

  it('grows after the reset with the new reference', () => {
    const clock = createCameraClock();
    const descA = makeDescriptor();
    tweenElapsed(clock, descA, 1000);
    const descB = makeDescriptor();
    tweenElapsed(clock, descB, 1100); // reset → 0
    expect(tweenElapsed(clock, descB, 1125)).toBe(25);
  });

  it('returns 0 for a null tween (no active descriptor)', () => {
    const clock = createCameraClock();
    expect(tweenElapsed(clock, null, 5000)).toBe(0);
    expect(tweenElapsed(clock, null, 5100)).toBe(0);
  });

  it('returns 0 when a live descriptor transitions to null', () => {
    const clock = createCameraClock();
    const descA = makeDescriptor();
    tweenElapsed(clock, descA, 1000);
    tweenElapsed(clock, descA, 1050);
    // Descriptor removed.
    expect(tweenElapsed(clock, null, 1100)).toBe(0);
  });

  it('is deterministic from its args — no real wall-clock dependency', () => {
    // Two independent clocks driven with the same injected sequence must
    // produce identical outputs.
    const clockX = createCameraClock();
    const clockY = createCameraClock();
    const desc = makeDescriptor();

    const nowMs1 = 9000;
    const nowMs2 = 9020;
    const nowMs3 = 9040;

    const x1 = tweenElapsed(clockX, desc, nowMs1);
    const x2 = tweenElapsed(clockX, desc, nowMs2);
    const x3 = tweenElapsed(clockX, desc, nowMs3);

    const y1 = tweenElapsed(clockY, desc, nowMs1);
    const y2 = tweenElapsed(clockY, desc, nowMs2);
    const y3 = tweenElapsed(clockY, desc, nowMs3);

    expect(x1).toBe(y1);
    expect(x2).toBe(y2);
    expect(x3).toBe(y3);
  });
});

describe('autoRotateElapsed', () => {
  it('returns 0 when auto-rotate is inactive from the start', () => {
    const clock = createCameraClock();
    expect(autoRotateElapsed(clock, false, 2000)).toBe(0);
    expect(autoRotateElapsed(clock, false, 2100)).toBe(0);
  });

  it('returns 0 on the frame auto-rotate becomes active (false → true)', () => {
    const clock = createCameraClock();
    expect(autoRotateElapsed(clock, true, 2000)).toBe(0);
  });

  it('grows on subsequent frames while active', () => {
    const clock = createCameraClock();
    autoRotateElapsed(clock, true, 2000); // activation → 0
    expect(autoRotateElapsed(clock, true, 2016)).toBe(16);
    expect(autoRotateElapsed(clock, true, 2032)).toBe(32);
  });

  it('resets to 0 when auto-rotate deactivates (true → false)', () => {
    const clock = createCameraClock();
    autoRotateElapsed(clock, true, 2000);
    autoRotateElapsed(clock, true, 2050);
    expect(autoRotateElapsed(clock, false, 2100)).toBe(0);
  });

  it('returns 0 on the frame auto-rotate re-activates after a pause', () => {
    const clock = createCameraClock();
    autoRotateElapsed(clock, true, 2000);
    autoRotateElapsed(clock, true, 2016);
    autoRotateElapsed(clock, false, 2100); // deactivate → 0
    expect(autoRotateElapsed(clock, true, 2200)).toBe(0); // re-activate → 0
  });

  it('grows again after re-activation', () => {
    const clock = createCameraClock();
    autoRotateElapsed(clock, true, 2000);
    autoRotateElapsed(clock, false, 2100);
    autoRotateElapsed(clock, true, 2200); // re-activate → 0
    expect(autoRotateElapsed(clock, true, 2216)).toBe(16);
  });

  it('full false→true→false→true sequence matches the brief', () => {
    const clock = createCameraClock();
    expect(autoRotateElapsed(clock, true, 2000)).toBe(0);
    expect(autoRotateElapsed(clock, true, 2016)).toBe(16);
    expect(autoRotateElapsed(clock, false, 2100)).toBe(0);
    expect(autoRotateElapsed(clock, true, 2200)).toBe(0);
  });

  it('is deterministic from its args — no real wall-clock dependency', () => {
    const clockX = createCameraClock();
    const clockY = createCameraClock();

    const steps: [boolean, number][] = [
      [true, 3000],
      [true, 3020],
      [false, 3100],
      [true, 3200],
      [true, 3220],
    ];

    const xResults = steps.map(([active, nowMs]) => autoRotateElapsed(clockX, active, nowMs));
    const yResults = steps.map(([active, nowMs]) => autoRotateElapsed(clockY, active, nowMs));

    expect(xResults).toEqual(yResults);
  });
});
