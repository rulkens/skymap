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
  frameTweenElapsed,
  autoRotateElapsed,
  clipElapsed,
  followElapsed,
  accumulateFollowPan,
  rotateFollowPan,
} from '../../../../src/services/engine/camera/cameraClock';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import type { CameraState } from '../../../../src/@types/camera/CameraState';
import type { CameraTweenDescriptor } from '../../../../src/@types/camera/CameraTweenDescriptor';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { FrameTween } from '../../../../src/@types/camera/FrameTween';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

function makeDescriptor(overrides?: Partial<CameraTweenDescriptor>): CameraTweenDescriptor {
  return {
    from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 },
    to: { target: [10, 0, 0], yaw: 1.0, pitch: 0.2, distance: 50 },
    durationMs: 600,
    easing: 'easeOutCubic',
    frame: 'equatorial',
    ...overrides,
  };
}

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

describe('frameTweenElapsed', () => {
  function makeFrameTween(overrides?: Partial<FrameTween>): FrameTween {
    return {
      fromQuat: [0, 0, 0, 1],
      to: 'ecliptic',
      durationMs: 800,
      easing: 'easeOutCubic',
      ...overrides,
    };
  }

  it('frameTweenElapsed resets on descriptor identity change', () => {
    const clock = createCameraClock();
    const descA = makeFrameTween();
    // Fresh descriptor on the switch frame → 0.
    expect(frameTweenElapsed(clock, descA, 1000)).toBe(0);
    // Same reference later → grows.
    expect(frameTweenElapsed(clock, descA, 1250)).toBe(250);
    // A NEW descriptor object (a fresh frame switch) → reset to 0.
    const descB = makeFrameTween();
    expect(frameTweenElapsed(clock, descB, 1400)).toBe(0);
    // Null frame tween → always 0.
    expect(frameTweenElapsed(clock, null, 1500)).toBe(0);
  });
});

describe('autoRotateElapsed', () => {
  // A stable base reference; passing the SAME object each call means the
  // base-identity reset never fires, so these tests exercise only the
  // active-bit transitions.
  const BASE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };

  it('returns 0 when auto-rotate is inactive from the start', () => {
    const clock = createCameraClock();
    expect(autoRotateElapsed(clock, false, BASE, 2000)).toBe(0);
    expect(autoRotateElapsed(clock, false, BASE, 2100)).toBe(0);
  });

  it('returns 0 on the frame auto-rotate becomes active (false → true)', () => {
    const clock = createCameraClock();
    expect(autoRotateElapsed(clock, true, BASE, 2000)).toBe(0);
  });

  it('grows on subsequent frames while active', () => {
    const clock = createCameraClock();
    autoRotateElapsed(clock, true, BASE, 2000); // activation → 0
    expect(autoRotateElapsed(clock, true, BASE, 2016)).toBe(16);
    expect(autoRotateElapsed(clock, true, BASE, 2032)).toBe(32);
  });

  it('resets to 0 when auto-rotate deactivates (true → false)', () => {
    const clock = createCameraClock();
    autoRotateElapsed(clock, true, BASE, 2000);
    autoRotateElapsed(clock, true, BASE, 2050);
    expect(autoRotateElapsed(clock, false, BASE, 2100)).toBe(0);
  });

  it('returns 0 on the frame auto-rotate re-activates after a pause', () => {
    const clock = createCameraClock();
    autoRotateElapsed(clock, true, BASE, 2000);
    autoRotateElapsed(clock, true, BASE, 2016);
    autoRotateElapsed(clock, false, BASE, 2100); // deactivate → 0
    expect(autoRotateElapsed(clock, true, BASE, 2200)).toBe(0); // re-activate → 0
  });

  it('grows again after re-activation', () => {
    const clock = createCameraClock();
    autoRotateElapsed(clock, true, BASE, 2000);
    autoRotateElapsed(clock, false, BASE, 2100);
    autoRotateElapsed(clock, true, BASE, 2200); // re-activate → 0
    expect(autoRotateElapsed(clock, true, BASE, 2216)).toBe(16);
  });

  it('full false→true→false→true sequence matches the brief', () => {
    const clock = createCameraClock();
    expect(autoRotateElapsed(clock, true, BASE, 2000)).toBe(0);
    expect(autoRotateElapsed(clock, true, BASE, 2016)).toBe(16);
    expect(autoRotateElapsed(clock, false, BASE, 2100)).toBe(0);
    expect(autoRotateElapsed(clock, true, BASE, 2200)).toBe(0);
  });

  it('resets to 0 when base changes underneath an active spin (commit-on-edge)', () => {
    // A drag-release / focus settle commits a NEW base object while auto-rotate
    // stays active. The spin must restart from elapsed 0 against the fresh base,
    // not carry the accumulated time forward (which would jump the camera).
    const clock = createCameraClock();
    autoRotateElapsed(clock, true, BASE, 2000); // activation → 0
    expect(autoRotateElapsed(clock, true, BASE, 2050)).toBe(50); // same base → grows
    const NEW_BASE: CameraPose = { target: [1, 0, 0], yaw: 0.5, pitch: 0, distance: 80 };
    expect(autoRotateElapsed(clock, true, NEW_BASE, 2060)).toBe(0); // base changed → reset
    expect(autoRotateElapsed(clock, true, NEW_BASE, 2075)).toBe(15); // grows from new base
  });

  it('does NOT reset while the base reference is stable (steady spin)', () => {
    const clock = createCameraClock();
    autoRotateElapsed(clock, true, BASE, 1000);
    expect(autoRotateElapsed(clock, true, BASE, 1500)).toBe(500);
    expect(autoRotateElapsed(clock, true, BASE, 2000)).toBe(1000);
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

    const xResults = steps.map(([active, nowMs]) => autoRotateElapsed(clockX, active, BASE, nowMs));
    const yResults = steps.map(([active, nowMs]) => autoRotateElapsed(clockY, active, BASE, nowMs));

    expect(xResults).toEqual(yResults);
  });
});

describe('clipElapsed', () => {
  // Minimal clip ref fixture — ClipData requires only `timeline`.
  function makeClipRef(): NonNullable<CameraState['clip']> {
    return { data: { timeline: [] }, frame: 'equatorial' };
  }

  it('returns 0 for null clip', () => {
    const clock = createCameraClock();
    expect(clipElapsed(clock, null, 1000)).toBe(0);
    expect(clipElapsed(clock, null, 5000)).toBe(0);
  });

  it('returns 0 on the arrival frame then grows in seconds', () => {
    const clock = createCameraClock();
    const clip = makeClipRef();
    // Install the ref at nowMs=1000 — arrival frame returns 0.
    expect(clipElapsed(clock, clip, 1000)).toBe(0);
    // Same ref at nowMs=2500 — 1500 ms have passed → 1.5 seconds.
    expect(clipElapsed(clock, clip, 2500)).toBeCloseTo(1.5);
  });

  it('resets when the clip reference changes', () => {
    const clock = createCameraClock();
    const clipA = makeClipRef();
    clipElapsed(clock, clipA, 1000);
    clipElapsed(clock, clipA, 2000); // elapsed = 1 s

    // A NEW object reference (as startClip installs) must reset the start.
    const clipB = makeClipRef();
    expect(clipElapsed(clock, clipB, 3000)).toBe(0); // arrival frame → 0
    expect(clipElapsed(clock, clipB, 3500)).toBeCloseTo(0.5); // grows from new start
  });
});

// ── follow-body pan (strafe) offset ──────────────────────────────────────────

describe('accumulateFollowPan', () => {
  it('folds the frame-to-frame cam.target delta into the offset while follow-dragging', () => {
    const clock = createCameraClock();
    // First follow-drag frame only seeds the delta chain (offset unchanged) — the
    // absolute seeded cam.target must NOT leak into the offset.
    accumulateFollowPan(clock, true, [0, 0, 0]);
    expect(clock.followPanOffset).toEqual([0, 0, 0]);
    accumulateFollowPan(clock, true, [5, 0, 0]); // +[5,0,0]
    accumulateFollowPan(clock, true, [5, 3, 0]); // +[0,3,0]
    expect(clock.followPanOffset).toEqual([5, 3, 0]);
  });

  it('holds the offset and drops the delta chain on non-drag frames', () => {
    const clock = createCameraClock();
    accumulateFollowPan(clock, true, [0, 0, 0]);
    accumulateFollowPan(clock, true, [4, 0, 0]);
    expect(clock.followPanOffset).toEqual([4, 0, 0]);

    // A non-drag frame must NOT accumulate, and must reset lastPanTarget so the
    // NEXT grab starts a fresh delta chain rather than jumping the offset by the gap.
    accumulateFollowPan(clock, false, [999, 999, 999]);
    expect(clock.followPanOffset).toEqual([4, 0, 0]);
    expect(clock.lastPanTarget).toBeNull();

    // Next grab: first frame seeds (offset unchanged), then accumulates the delta.
    accumulateFollowPan(clock, true, [100, 0, 0]);
    expect(clock.followPanOffset).toEqual([4, 0, 0]);
    accumulateFollowPan(clock, true, [102, 0, 0]);
    expect(clock.followPanOffset).toEqual([6, 0, 0]);
  });
});

describe('rotateFollowPan', () => {
  // +90° about Z, column-major (cell at row r, col c is m[c*3+r]) — same
  // convention `orientationWorldDelta` and `multiply3x3` use.
  const ROTATE_Z90: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
  const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  it('rotates the offset in place by the given rotation', () => {
    const clock = createCameraClock();
    clock.followPanOffset = [1, 0, 0];
    rotateFollowPan(clock, ROTATE_Z90);
    expect(clock.followPanOffset[0]).toBeCloseTo(0, 12);
    expect(clock.followPanOffset[1]).toBeCloseTo(1, 12);
    expect(clock.followPanOffset[2]).toBeCloseTo(0, 12);
  });

  it('leaves the offset unchanged under an identity rotation', () => {
    const clock = createCameraClock();
    clock.followPanOffset = [3, -2, 5];
    rotateFollowPan(clock, IDENTITY);
    expect(clock.followPanOffset).toEqual([3, -2, 5]);
  });

  it('a zero offset stays zero under any rotation — no special-case branch needed', () => {
    const clock = createCameraClock(); // followPanOffset defaults to [0, 0, 0]
    rotateFollowPan(clock, ROTATE_Z90);
    expect(clock.followPanOffset).toEqual([0, 0, 0]);
  });
});

describe('followElapsed — pan offset reset', () => {
  it('zeroes followPanOffset and drops the delta chain on a focus ref change', () => {
    const clock = createCameraClock();
    const rowA = { type: 'body', id: 'earth' } as unknown as SelectionRow;
    followElapsed(clock, rowA, 1000); // install rowA as the current focus ref

    // Simulate an accumulated strafe under that steady focus.
    clock.followPanOffset = [1, 2, 3];
    clock.lastPanTarget = [1, 2, 3];

    // A NEW focus ref is a fresh target: the offset must zero and the chain drop.
    const rowB = { type: 'body', id: 'mars' } as unknown as SelectionRow;
    followElapsed(clock, rowB, 2000);
    expect(clock.followPanOffset).toEqual([0, 0, 0]);
    expect(clock.lastPanTarget).toBeNull();
  });
});
