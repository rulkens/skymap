/**
 * cameraSlice — unit tests for the inline-Immer RTK camera slice.
 *
 * Each test calls the reducer directly with an action creator's output
 * (`reducer(state, actionCreator(payload))`) and asserts the single field the
 * reducer writes. The serialisability test guards the spec §6 requirement that
 * the camera state contains only plain JSON-safe data — no `Set`, no class
 * instances, no wall-clock values (`position`).
 */

import { describe, it, expect } from 'vitest';

import reducer, {
  startCameraTween,
  cancelCameraTween,
  setAutoRotate,
  clipStarted,
  clipTransportSet,
  clipDataReplaced,
  clipEnded,
  resolveClipStart,
  commitCameraPose,
} from '../../../src/state/camera/cameraSlice';
import { absoluteArm } from '../../../src/utils/camera/arms/absoluteArm';
import type { CameraPose } from '../../../src/@types/camera/pose/CameraPose';
import type { CameraTweenDescriptor } from '../../../src/@types/camera/focusMotion/CameraTweenDescriptor';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { EngineSubsystemHandles } from '../../../src/@types/engine/handles/EngineSubsystemHandles';
import type { OrientationFrameId } from '../../../src/@types/camera/orientation/OrientationFrameId';

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
  motion: { style: 'eased', durationMs: 1200, ease: 'easeOutCubic' },
  frame: tweenFrame,
};

describe('cameraSlice — initial state is serialisable', () => {
  it('contains only plain JSON-safe values (no Set / class instance)', () => {
    const state = base();
    const json = JSON.stringify(state);
    // round-trip should not throw and should produce an equivalent object
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json)).toEqual(state);
  });

  it('does not contain wall-clock keys (position)', () => {
    const json = JSON.stringify(base());
    expect(json).not.toContain('"position"');
  });
});

// ── Shared clip fixture ───────────────────────────────────────────────────────
// Minimal ClipData — `timeline` can be empty for slice-level tests; the
// compiler and evaluator (Tasks 4/8) test richer descriptors separately.
const clipData: ClipData = { start: 'live', timeline: [] };
const clipFrame: OrientationFrameId = 'galactic';

const livePose: CameraPose = { target: [10, 20, 30], yaw: 1.0, pitch: -0.5, distance: 50 };

describe('cameraSlice — clip lifecycle', () => {
  it('clipEnded also clears a dormant tween', () => {
    // A focus saga may plant a tween before/during a clip; once the clip@95
    // driver deactivates, an un-cleared @60 tween would outrank resting@0.
    const withBoth = reducer(
      reducer(base(), startCameraTween(tween)),
      clipStarted({ data: clipData, frame: clipFrame, atEnd: 'revert' }),
    );
    const cleared = reducer(withBoth, clipEnded());
    expect(cleared.clip).toBeNull();
    expect(cleared.tween).toBeNull();
  });

  it('clipDataReplaced keeps the transport object and the frame', () => {
    // The player anchors a running clock on the transport's identity: a rebuilt one restarts it.
    const transport = { kind: 'running', fromSec: 2, loop: null } as const;
    const live = reducer(
      reducer(base(), clipStarted({ data: clipData, frame: clipFrame, atEnd: 'revert' })),
      clipTransportSet(transport),
    );
    const edited = { ...clipData, timeline: [] };
    const next = reducer(live, clipDataReplaced(edited));
    expect(next.clip!.transport).toBe(live.clip!.transport);
    expect(next.clip!.frame).toBe(clipFrame);
    expect(next.clip!.data).toBe(edited);
  });

  it('clipTransportSet and clipDataReplaced do nothing with no clip live', () => {
    const idle = base();
    const afterTransport = reducer(
      idle,
      clipTransportSet({ kind: 'paused', atSec: 1, camera: 'clip' }),
    );
    expect(reducer(afterTransport, clipDataReplaced(clipData)).clip).toBeNull();
  });
});

describe('cameraSlice — commitCameraPose identity', () => {
  it('stores the payload BY REFERENCE, not a copy', () => {
    // `stepCameraRuntime`'s outside-commit check (`base !== prev.base`) and its
    // `next.base` fold both depend on this: a defensive spread here would make
    // every loop-authored commit misread as an outside one.
    const payload = absoluteArm(pose);
    const state = reducer(base(), commitCameraPose(payload));
    expect(state.base).toBe(payload);
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
