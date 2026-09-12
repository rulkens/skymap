/**
 * cameraSlice — unit tests for the inline-Immer RTK camera slice.
 *
 * Each test calls the reducer directly with an action creator's output
 * (`reducer(state, actionCreator(payload))`) and asserts the single field the
 * reducer writes. The serialisability test guards the spec §6 requirement that
 * the camera state contains only plain JSON-safe data — no `Set`, no class
 * instances, no wall-clock values (`position`, `fovYRad`).
 */

import { describe, it, expect } from 'vitest';

import reducer, {
  beginDrag,
  endDrag,
  commitCameraPose,
  startCameraTween,
  cancelCameraTween,
  setAutoRotate,
  clipStarted,
  clipEnded,
  resolveClipStart,
} from '../../../src/state/camera/cameraSlice';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { CameraTweenDescriptor } from '../../../src/@types/camera/CameraTweenDescriptor';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { EngineSubsystemHandles } from '../../../src/@types/engine/handles/EngineSubsystemHandles';
import type { OrientationFrameId } from '../../../src/@types/camera/OrientationFrameId';

// ── Compile-time freeze guards ──────────────────────────────────────────────
// These never run; they fail at `tsc` time if the camera surface regrows a
// field it must not carry. The `@ts-expect-error` lines are load-bearing:
// adding the property makes the suppressed access legal, turning the directive
// into an "unused @ts-expect-error" compile error.

// The animation clock is an engine Resource, never a descriptor field — so a
// wall-clock `startMs` must not be assignable onto CameraTweenDescriptor.
// @ts-expect-error — CameraTweenDescriptor is clock-free; `startMs` does not exist.
type _DescriptorIsClockFree = CameraTweenDescriptor['startMs'];

// The tween lives in the store and is driven per-frame; the engine subsystem
// bag holds no `tweens` handle.
// @ts-expect-error — `tweens` does not exist on EngineSubsystemHandles.
type _SubsystemsHaveNoTweens = EngineSubsystemHandles['tweens'];

// Stable initial state — each test gets a fresh copy via the reducer with an
// unknown action (same pattern as the settings tests).
const base = () => reducer(undefined, { type: '@@init' });

const pose: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: -0.3, distance: 10 };

const tweenFrame: OrientationFrameId = 'ecliptic';

const tween: CameraTweenDescriptor = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 0.43 },
  to: pose,
  durationMs: 1200,
  easing: 'easeOutCubic',
  frame: tweenFrame,
};

describe('cameraSlice — commitCameraPose', () => {
  it('replaces base with the dispatched pose', () => {
    const next = reducer(base(), commitCameraPose(absoluteArm(pose)));
    expect(next.base).toEqual(absoluteArm(pose));
  });
});

describe('cameraSlice — tween lifecycle', () => {
  it('startCameraTween installs the descriptor', () => {
    const next = reducer(base(), startCameraTween(tween));
    expect(next.tween).toEqual(tween);
  });

  it('cancelCameraTween clears the tween to null', () => {
    const withTween = reducer(base(), startCameraTween(tween));
    const cleared = reducer(withTween, cancelCameraTween());
    expect(cleared.tween).toBeNull();
  });

  it('cancelCameraTween is a no-op when tween is already null', () => {
    const before = base();
    const after = reducer(before, cancelCameraTween());
    expect(after.tween).toBeNull();
  });
});

describe('cameraSlice — drag state', () => {
  it('beginDrag sets dragging to true', () => {
    expect(reducer(base(), beginDrag()).dragging).toBe(true);
  });

  it('endDrag sets dragging to false', () => {
    const dragging = reducer(base(), beginDrag());
    expect(reducer(dragging, endDrag()).dragging).toBe(false);
  });
});

describe('cameraSlice — setAutoRotate', () => {
  it('replaces the whole autoRotate object', () => {
    const next = reducer(base(), setAutoRotate({ active: true, rate: 0.002 }));
    expect(next.autoRotate).toEqual({ active: true, rate: 0.002 });
  });

  it('active and rate are both updated atomically', () => {
    const next = reducer(base(), setAutoRotate({ active: false, rate: 0.001 }));
    expect(next.autoRotate.active).toBe(false);
    expect(next.autoRotate.rate).toBe(0.001);
  });
});

describe('cameraSlice — initial state is serialisable', () => {
  it('contains only plain JSON-safe values (no Set / class instance)', () => {
    const state = base();
    const json = JSON.stringify(state);
    // round-trip should not throw and should produce an equivalent object
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json)).toEqual(state);
  });

  it('does not contain wall-clock or renderer keys (position / fovYRad)', () => {
    const json = JSON.stringify(base());
    expect(json).not.toContain('"position"');
    expect(json).not.toContain('"fovYRad"');
  });
});

// ── Shared clip fixture ───────────────────────────────────────────────────────
// Minimal ClipData — `timeline` can be empty for slice-level tests; the
// compiler and evaluator (Tasks 4/8) test richer descriptors separately.
const clipData: ClipData = { start: 'live', timeline: [] };
const clipFrame: OrientationFrameId = 'galactic';

const livePose: CameraPose = { target: [10, 20, 30], yaw: 1.0, pitch: -0.5, distance: 50 };

describe('cameraSlice — clip lifecycle', () => {
  it('clipStarted stores the clip data and the pinned frame', () => {
    const next = reducer(base(), clipStarted({ data: clipData, frame: clipFrame }));
    // Reference equality: the reducer stores the exact payload object.
    expect(next.clip!.data).toBe(clipData);
    expect(next.clip!.frame).toBe(clipFrame);
  });

  it('clipEnded clears clip to null', () => {
    const withClip = reducer(base(), clipStarted({ data: clipData, frame: clipFrame }));
    const cleared = reducer(withClip, clipEnded());
    expect(cleared.clip).toBeNull();
  });

  it('clipEnded also clears a dormant tween', () => {
    // A focus saga may plant a tween before/during a clip; once the clip@95
    // driver deactivates, an un-cleared @60 tween would outrank resting@0.
    const withBoth = reducer(
      reducer(base(), startCameraTween(tween)),
      clipStarted({ data: clipData, frame: clipFrame }),
    );
    const cleared = reducer(withBoth, clipEnded());
    expect(cleared.clip).toBeNull();
    expect(cleared.tween).toBeNull();
  });
});

describe('resolveClipStart', () => {
  it("swaps 'live' for the live pose and returns a new object", () => {
    const resolved = resolveClipStart(clipData, livePose);
    // `start` is now the concrete live pose
    expect(resolved.start).toEqual(livePose);
    // Must be a NEW object — Task 8 clock keys on reference identity.
    expect(resolved).not.toBe(clipData);
  });

  it('treats undefined start the same as live', () => {
    const noStart: ClipData = { timeline: [] };
    const resolved = resolveClipStart(noStart, livePose);
    expect(resolved.start).toEqual(livePose);
    expect(resolved).not.toBe(noStart);
  });

  it('passes a concrete start through unchanged', () => {
    const concretePose: CameraPose = { target: [1, 2, 3], yaw: 0.1, pitch: 0.2, distance: 5 };
    const withConcrete: ClipData = { start: concretePose, timeline: [] };
    const resolved = resolveClipStart(withConcrete, livePose);
    // The concrete pose is passed through — livePose is not substituted.
    expect(resolved.start).toBe(concretePose);
    // Still a new wrapper object.
    expect(resolved).not.toBe(withConcrete);
  });
});
