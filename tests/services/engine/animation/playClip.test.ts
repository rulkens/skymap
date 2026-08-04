/**
 * playClip — unit tests for the non-reactive clip-play seam.
 *
 * ### Scope
 *
 * Tests here exercise ONLY `createPlayClip` and the resolver-registration
 * hook it uses on `clipPlayer`. The real store, real `resolveClipStart`, and
 * real `clipStarted`/`clipEnded` actions are used to keep assertions concrete.
 * The `clipPlayer` is a STUB — the tests drive it manually rather than running
 * the full tick-based lifecycle. This isolates `playClip`'s contract from the
 * timing details of `clipPlayer.tick`.
 *
 * ### Promise settling
 *
 * Promises are microtask-settled; each test `await`s `p` to confirm it
 * resolves. A timeout on the outer `it` (provided by vitest's default 5 s
 * limit) would catch an accidentally-never-resolving Promise.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { CANCEL } from 'redux-saga';

import { rootReducer } from '../../../../src/store/rootReducer';
import { clipStarted, clipEnded } from '../../../../src/state/camera/cameraSlice';
import { createPlayClip } from '../../../../src/services/engine/animation/playClip';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { OrientationFrameId } from '../../../../src/@types/camera/OrientationFrameId';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LIVE_POSE: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 50 };

const FIXED_POSE: CameraPose = { target: [10, 20, 30], yaw: 1.0, pitch: 0.2, distance: 100 };

// The frame `playClip`'s caller is under — arbitrary, distinct from the store's
// default orientation, so a test that mixed the two up would visibly diverge.
const FRAME: OrientationFrameId = 'galactic';

/** A minimal 1-second clip used by most tests. */
function makeClip(start?: CameraPose | 'live'): ClipData {
  return {
    start,
    timeline: [],
  };
}

// ---------------------------------------------------------------------------
// Stub clipPlayer factory
//
// The stub captures `registerEndResolver`'s callback so tests can invoke it
// directly to drive the clip-end edge without running tick(). `stop` is a
// typed spy so tests can assert it was called.
// ---------------------------------------------------------------------------

function makeStubClipPlayer() {
  let capturedResolver: (() => void) | null = null;

  const registerEndResolver = vi.fn<(onEnd: () => void) => void>((onEnd) => {
    capturedResolver = onEnd;
  });

  const stop = vi.fn<() => void>(() => {
    // Mirrors the real clipPlayer.stop: fire the resolver (simulating the
    // clipEnded dispatch + fireEndResolver sequence). Tests that invoke stop()
    // via the [CANCEL] hook expect the Promise to resolve as a result.
    capturedResolver?.();
    capturedResolver = null;
  });

  /** Drive the natural clip-end edge (simulates tick step 1 firing clipEnded). */
  function simulateClipEnd(): void {
    capturedResolver?.();
    capturedResolver = null;
  }

  return { registerEndResolver, stop, simulateClipEnd };
}

// ---------------------------------------------------------------------------
// Store helper
// ---------------------------------------------------------------------------

function makeStore() {
  return configureStore({ reducer: rootReducer });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('playClip', () => {
  it('resolves its Promise when the clip ends', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const stub = makeStubClipPlayer();

    const playClip = createPlayClip({
      store,
      clipPlayer: stub,
      getLivePose: () => LIVE_POSE,
    });

    const p = playClip(makeClip('live'), FRAME);

    // Before the clip ends the Promise is still pending.
    let settled = false;
    void p.then(() => {
      settled = true;
    });

    // Simulate clipEnded dispatch + resolver fire (what clipPlayer.tick step 1 does).
    dispatchSpy.mockClear();
    store.dispatch(clipEnded()); // mirror the real clipPlayer edge
    stub.simulateClipEnd();

    await p;

    expect(settled).toBe(true);
    // clipEnded must have been dispatched (this call was by us above; the real
    // clipPlayer would do it — assert the action type reached the store).
    const dispatchedTypes = dispatchSpy.mock.calls.map((c) => (c[0] as { type?: string }).type);
    expect(dispatchedTypes).toContain(clipEnded().type);
  });

  it('resolves (not rejects) on stop()', async () => {
    const store = makeStore();
    const stub = makeStubClipPlayer();

    const playClip = createPlayClip({
      store,
      clipPlayer: stub,
      getLivePose: () => LIVE_POSE,
    });

    const p = playClip(makeClip('live'), FRAME);

    // Invoke the [CANCEL] hook — what redux-saga's middleware does when a race
    // sibling wins and the task owning this Promise is cancelled. CANCEL is
    // typed as `string` so the indexed read yields `(() => void) | undefined`
    // under noUncheckedIndexedAccess; assert defined before calling (production
    // guarantees playClip set it).
    const cancelHook = (p as Promise<void> & { [CANCEL]?: () => void })[CANCEL];
    expect(cancelHook).toBeDefined();
    cancelHook!();

    // The stub's stop() fires the resolver, so the Promise should resolve.
    await p;

    expect(stub.stop).toHaveBeenCalledTimes(1);
    // Confirm the Promise resolved (no throw above means it did not reject).
  });

  it("resolves 'live' to a concrete start at dispatch", () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const stub = makeStubClipPlayer();

    const playClip = createPlayClip({
      store,
      clipPlayer: stub,
      getLivePose: () => LIVE_POSE,
    });

    const originalClip = makeClip('live');
    playClip(originalClip, FRAME);

    // Find the clipStarted dispatch and inspect its payload.
    const startClipCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type?: string }).type === clipStarted.type,
    );
    expect(startClipCall).toBeDefined();

    const dispatched = startClipCall![0] as ReturnType<typeof clipStarted>;
    const payload = dispatched.payload;

    // start must be the concrete LIVE_POSE, not the 'live' sentinel.
    expect(payload.data.start).toEqual(LIVE_POSE);
    expect(payload.data.start).not.toBe('live');

    // frame is the caller's orientation at dispatch time — pinned verbatim.
    expect(payload.frame).toBe(FRAME);

    // The payload's `data` must be a FRESH object — not the same reference as
    // originalClip. This is the clock-reset trigger: clipElapsed keys on
    // reference identity.
    expect(payload.data).not.toBe(originalClip);
  });

  it('with a fixed start passes it through unchanged', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const stub = makeStubClipPlayer();

    const playClip = createPlayClip({
      store,
      clipPlayer: stub,
      getLivePose: () => LIVE_POSE,
    });

    const originalClip = makeClip(FIXED_POSE);
    playClip(originalClip, FRAME);

    const startClipCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type?: string }).type === clipStarted.type,
    );
    expect(startClipCall).toBeDefined();

    const dispatched = startClipCall![0] as ReturnType<typeof clipStarted>;
    const payload = dispatched.payload;

    // The concrete start pose must be forwarded verbatim (value equality).
    expect(payload.data.start).toEqual(FIXED_POSE);

    // The returned `data` is still FRESH (resolveClipStart always spreads), so
    // the clock-reset trigger fires even for a replay of the same static clip.
    expect(payload.data).not.toBe(originalClip);
  });
});
