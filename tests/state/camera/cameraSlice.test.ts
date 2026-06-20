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
} from '../../../src/state/camera/cameraSlice';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { CameraTweenDescriptor } from '../../../src/@types/camera/CameraTweenDescriptor';
import type { EngineSubsystemHandles } from '../../../src/@types/engine/handles/EngineSubsystemHandles';

// ── Compile-time freeze guards ──────────────────────────────────────────────
// These never run; they fail at `tsc` time if the camera surface regrows a
// field the cutover deleted. The `@ts-expect-error` lines are load-bearing:
// re-adding the property makes the suppressed access legal, turning the
// directive into an "unused @ts-expect-error" compile error.

// The animation clock is an engine Resource, never a descriptor field — so a
// wall-clock `startMs` must not be assignable onto CameraTweenDescriptor.
// @ts-expect-error — CameraTweenDescriptor is clock-free; `startMs` does not exist.
type _DescriptorIsClockFree = CameraTweenDescriptor['startMs'];

// The tween manager was dissolved; the engine subsystem bag no longer owns a
// `tweens` handle (the tween lives in the store, driven per-frame).
// @ts-expect-error — `tweens` was removed from the subsystem bag.
type _SubsystemsHaveNoTweens = EngineSubsystemHandles['tweens'];

// Stable initial state — each test gets a fresh copy via the reducer with an
// unknown action (same pattern as the settings tests).
const base = () => reducer(undefined, { type: '@@init' });

const pose: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: -0.3, distance: 10 };

const tween: CameraTweenDescriptor = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 0.43 },
  to: pose,
  durationMs: 1200,
  easing: 'easeOutCubic',
};

describe('cameraSlice — commitCameraPose', () => {
  it('replaces base with the dispatched pose', () => {
    const next = reducer(base(), commitCameraPose(pose));
    expect(next.base).toEqual(pose);
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

  it('is a plain object with no Set or class instances anywhere', () => {
    const state = base();
    // Walk top-level fields — none should be a Set or non-plain object.
    for (const value of Object.values(state)) {
      expect(value).not.toBeInstanceOf(Set);
      expect(value).not.toBeInstanceOf(Map);
    }
  });
});

describe('cameraSlice — frozen surface', () => {
  it('the slice state is exactly { base, tween, autoRotate, dragging }', () => {
    // Pins the camera Intent surface: the cutover folded the whole mutable
    // OrbitCamera into these four fields. A new key here means new Intent that
    // should have been deliberated, not slipped in.
    expect(Object.keys(base()).sort()).toEqual(['autoRotate', 'base', 'dragging', 'tween']);
  });

  it('the tween descriptor is exactly { from, to, durationMs, easing } — no wall-clock', () => {
    expect(Object.keys(tween).sort()).toEqual(['durationMs', 'easing', 'from', 'to']);
    // Belt-and-suspenders for the clock-free type guard above: no serialized
    // descriptor carries a `startMs` / `position` / `fovYRad` wall-clock field.
    const json = JSON.stringify(tween);
    expect(json).not.toContain('"startMs"');
    expect(json).not.toContain('"position"');
    expect(json).not.toContain('"fovYRad"');
  });
});
