/**
 * guidedTourSaga tests — the outer tour loop: snapshot/restore sandwich and the
 * race between `run` (beat sequence) and `exit` (exitTour).
 *
 * Capture is now a pure `select(captureScene)` and restore is `restoreSceneSaga`
 * (two `put`s), so the saga touches no `reconcile` context — these tests run it
 * against a REAL `rootReducer` store and assert the scene round-trip BEHAVIOURALLY:
 * a settings mutation dispatched mid-run (standing in for an in-clip `scene()` /
 * `hide()` cue — the beats here are narration stubs, so the test dispatches it
 * directly) is wound back to the captured baseline on every exit path. (The
 * restore's reactive fade is watchFadesSaga's concern, tested there; this suite
 * doesn't run that watcher.)
 *
 * Beat fixtures use narration clips (empty timeline, no id-bearing cues) so
 * `waitUntil(clipFociReady)` exits synchronously on the first predicate check.
 * playClip stubs resolve immediately for the fly and never for the drift — two
 * flushes advance past each beat's fly and one advanceTour dispatched afterwards
 * drives the dwell race so the beat completes. Short dwell beats (dwellDrift(0.001))
 * combined with fake timers let the dwell timeout win without a manual
 * advanceTour dispatch.
 *
 * ### Timing
 *
 * redux-saga schedules Promise continuations as macrotasks. One `flush()`
 * (a macrotask boundary via `setTimeout(…, 0)`) lets an awaited Promise
 * continuation fire and the saga advance past it.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { guidedTourSaga } from '../../../src/state/tour/guidedTourSaga';
import { exitTour } from '../../../src/state/tour/tourActions';
import { beginDrag } from '../../../src/state/camera/cameraSlice';
import { setVolumesEnabled } from '../../../src/state/settings/settingsSlice';
import { dwellDrift } from '../../../src/state/tour/dwellDrift';
import type { BeatData } from '../../../src/@types/animation/tour/BeatData';
import type { Tour } from '../../../src/@types/animation/tour/Tour';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { FocusCameraRuntime } from '../../../src/store/types';
import type { ClipData } from '../../../src/@types/animation/ClipData';

const flush = () => new Promise((r) => setTimeout(r, 0));

// ─── Stubs ──────────────────────────────────────────────────────────────────

const CAMERA_RUNTIME: FocusCameraRuntime = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
  fovYRad: 0.8,
};

// Deps for narration clips — no id-bearing cues, so clipFociReady is trivially
// true and waitUntil exits on the first synchronous check.
const immediateDeps: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousMeta: [],
  structures: { byId: () => null },
};

// Narration clip: empty timeline, no focus ids. clipFociReady returns true
// immediately so waitUntil does not poll.
const NARRATION_CLIP: ClipData = {
  start: 'live',
  timeline: [],
};

type PlayClipStub = ReturnType<typeof vi.fn<(clip: ClipData) => Promise<void>>>;

function buildStore(opts: {
  playClip?: PlayClipStub;
  resolveDeps?: ResolveDeps;
  cameraRuntime?: FocusCameraRuntime | null;
}) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });

  const playClipFn: PlayClipStub =
    opts.playClip ??
    (vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined) as PlayClipStub);
  const deps = opts.resolveDeps ?? immediateDeps;
  const cam = opts.cameraRuntime !== undefined ? opts.cameraRuntime : CAMERA_RUNTIME;

  sagaMiddleware.setContext({
    resolveDeps: () => deps,
    cameraRuntime: () => cam,
    playClip: (clip: ClipData) => playClipFn(clip),
  });

  return { store, sagaMiddleware, playClipFn };
}

// Build a minimal Tour wrapping the given beats. The narration beats mutate no
// settings themselves; restore tests seed `setVolumesEnabled(true)` as the
// baseline, then dispatch `setVolumesEnabled(false)` mid-run — standing in for
// an in-clip scene cue — so the finally's wind-back is observable.
function makeTour(beats: readonly BeatData[]): Tour {
  return { id: 'demo', label: 'Demo', beats };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('guidedTourSaga', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper: a playClip stub where the fly resolves and the drift blocks forever.
  // call count resets per-beat (two beats → two fly calls, two drift calls).
  function makeAutoFlyStub(): PlayClipStub {
    let parity = 0;
    return vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      // odd calls = fly (resolve), even calls = drift (block)
      parity++;
      return parity % 2 === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });
  }

  // ── (1) activates the tour for the duration and ends it after completion ──

  it('guidedTourSaga marks the tour active for the duration and ends it after', async () => {
    vi.useFakeTimers();

    // Very short dwell so the beat completes without a manual advanceTour.
    const beat: BeatData = {
      enterClip: NARRATION_CLIP,
      caption: { title: 'B1' },
      dwellClip: dwellDrift(0.001),
    };

    // Fly resolves; drift blocks (timeout wins the dwell race).
    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });
    sagaMiddleware.run(guidedTourSaga, makeTour([beat]));

    // tourStarted must be in the store already (the App derives HUD-hidden from it).
    expect(store.getState().tour.active).toBe(true);

    // Advance timers so the dwell timeout fires and the beat + loop complete.
    await vi.runAllTimersAsync();

    // After natural completion the finally must end the tour.
    expect(store.getState().tour.active).toBe(false);
  });

  // ── (2) runs every beat in order ─────────────────────────────────────────

  it('guidedTourSaga runs every beat in order', async () => {
    vi.useFakeTimers();

    const beat1: BeatData = {
      enterClip: NARRATION_CLIP,
      caption: { title: 'First' },
      dwellClip: dwellDrift(0.001),
    };
    const beat2: BeatData = {
      enterClip: NARRATION_CLIP,
      caption: { title: 'Second' },
      dwellClip: dwellDrift(0.001),
    };

    // Fly calls resolve; drift calls block. Calls interleave: fly1, drift1, fly2, drift2.
    const stub = makeAutoFlyStub();
    const { store, sagaMiddleware } = buildStore({ playClip: stub });

    sagaMiddleware.run(guidedTourSaga, makeTour([beat1, beat2]));

    // Run all timers — each beat's 0.001 s dwell fires the timeout and advances.
    await vi.runAllTimersAsync();

    // Both beats must have flown (≥ 2 fly calls — calls 1 and 3 in the parity
    // stub) and the loop ran off the end (tour no longer active).
    expect(stub.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(store.getState().tour.active).toBe(false);
  });

  // ── (3) natural completion restores the captured scene ────────────────────

  it('natural completion winds a mid-run mutation back to the captured baseline', async () => {
    vi.useFakeTimers();

    const beat: BeatData = {
      enterClip: NARRATION_CLIP,
      caption: { title: 'B1' },
      dwellClip: dwellDrift(0.001),
    };

    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });
    // Seed a known baseline so the mid-run flip (→ false) is observable.
    store.dispatch(setVolumesEnabled(true));
    sagaMiddleware.run(guidedTourSaga, makeTour([beat]));

    // Mutate settings mid-run — the stand-in for an in-clip scene cue.
    store.dispatch(setVolumesEnabled(false));
    expect(store.getState().settings.volumes.enabled).toBe(false);

    await vi.runAllTimersAsync();

    // finally restored the captured baseline (volumes back on) and ended the tour.
    expect(store.getState().settings.volumes.enabled).toBe(true);
    expect(store.getState().tour.active).toBe(false);
  });

  // ── (4) exitTour cancels mid-beat and the finally restores the scene ─────

  it('exitTour cancels mid-beat and the finally restores the captured baseline', async () => {
    // Long dwell — we will interrupt before it auto-advances.
    const beat: BeatData = {
      enterClip: NARRATION_CLIP,
      caption: { title: 'B1' },
      dwellClip: dwellDrift(9999),
    };

    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });
    store.dispatch(setVolumesEnabled(true));
    sagaMiddleware.run(guidedTourSaga, makeTour([beat]));

    // Mutate settings mid-run — the stand-in for an in-clip scene cue.
    store.dispatch(setVolumesEnabled(false));

    // Advance to the dwell race inside beat 1 (fly resolved, drift blocking).
    await flush();
    await flush();
    expect(store.getState().settings.volumes.enabled).toBe(false);

    // Dispatch exitTour — the exit arm wins the outer race and cancels run.
    store.dispatch(exitTour());
    await flush();

    // finally must have executed: baseline restored and tour ended.
    expect(store.getState().settings.volumes.enabled).toBe(true);
    expect(store.getState().tour.active).toBe(false);
  });

  // ── (5) camera-input action does not abort the tour ──────────────────────

  it('no camera-input action aborts the tour', async () => {
    // Long dwell so the beat never auto-advances during this test.
    const beat: BeatData = {
      enterClip: NARRATION_CLIP,
      caption: { title: 'B1' },
      dwellClip: dwellDrift(9999),
    };

    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });
    store.dispatch(setVolumesEnabled(true));
    sagaMiddleware.run(guidedTourSaga, makeTour([beat]));

    // Mutate settings mid-run — must survive the camera-input action below
    // (only exitTour triggers the restore).
    store.dispatch(setVolumesEnabled(false));

    // Advance to the dwell race inside beat 1.
    await flush();
    await flush();

    // Dispatch a camera-input action — must have NO effect on tour lifecycle.
    store.dispatch(beginDrag());
    await flush();

    // The tour is still running: not restored (volumes still off), still active.
    expect(store.getState().settings.volumes.enabled).toBe(false);
    expect(store.getState().tour.active).toBe(true);
  });
});
