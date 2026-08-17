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
import { exitTour, advanceTour, prevBeat } from '../../../src/state/tour/tourActions';
import { updateSelectionSelect } from '../../../src/state/selection/selectionSlice';
import { beginDrag } from '../../../src/state/camera/cameraSlice';
import { hide } from '../../../src/services/engine/animation/effectHelpers';
import {
  setVolumesEnabled,
  setOrientation,
  mergeSnapshot,
} from '../../../src/state/settings/settingsSlice';
import { dwellDrift } from '../../../src/state/tour/dwellDrift';
import { FOLD_SETTLE_MS } from '../../../src/state/tour/foldSettleMs';
import type { BeatData } from '../../../src/@types/animation/tour/BeatData';
import type { Tour } from '../../../src/@types/animation/tour/Tour';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { LiveCameraRuntime } from '../../../src/store/types';
import type { ClipData } from '../../../src/@types/animation/ClipData';

const flush = () => new Promise((r) => setTimeout(r, 0));

// ─── Stubs ──────────────────────────────────────────────────────────────────

const CAMERA_RUNTIME: LiveCameraRuntime = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
  fovYRad: 0.8,
  upBasisQuat: [0, 0, 0, 1],
};

// Deps for narration clips — no id-bearing cues, so clipFociReady is trivially
// true and waitUntil exits on the first synchronous check.
const immediateDeps: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousGalaxiesMeta: [],
  structures: { byId: () => null },
  stars: { current: () => null },
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
  cameraRuntime?: LiveCameraRuntime | null;
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

  // ── (1b) clears any pre-tour selection at start ────────────────────────────

  it('clears a pre-tour selection at start so no floating halo rides the tour', async () => {
    vi.useFakeTimers();

    const beat: BeatData = {
      enterClip: NARRATION_CLIP,
      caption: { title: 'B1' },
      dwellClip: dwellDrift(0.001),
    };
    const { store, sagaMiddleware } = buildStore({ playClip: makeAutoFlyStub() });

    // The user clicked something before starting the tour — a selection halo
    // is on screen.
    store.dispatch(updateSelectionSelect({ type: 'structure', id: 'cluster-virgo' }));
    expect(store.getState().selection.select).not.toBeNull();

    sagaMiddleware.run(guidedTourSaga, makeTour([beat]));

    // Cleared synchronously at tour start — before any beat plays.
    expect(store.getState().selection.select).toBeNull();

    await vi.runAllTimersAsync();
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

  // ── (2b) every beat entry reconstructs the derived scene ──────────────────

  it('reconstructs the scene on every beat entry, so skip and prev cannot desync it', async () => {
    // Beat 0 carries a hide cue in its enter clip. playClip is STUBBED here, so
    // the cue never fires during "playback" — exactly like a mid-fly skip that
    // cancels the clip before its cues. The reconstruction fold must apply it
    // anyway when beat 1 is entered, and unwind it when Prev returns to beat 0.
    const cueBeat: BeatData = {
      enterClip: { start: 'live', timeline: [hide(['volumesMaster'], 0)] },
      caption: { title: 'B1' },
      dwellClip: dwellDrift(9999),
    };
    const plainBeat: BeatData = {
      enterClip: NARRATION_CLIP,
      caption: { title: 'B2' },
      dwellClip: dwellDrift(9999),
    };

    const { store, sagaMiddleware } = buildStore({ playClip: makeAutoFlyStub() });
    store.dispatch(setVolumesEnabled(true));
    const task = sagaMiddleware.run(guidedTourSaga, makeTour([cueBeat, plainBeat]));

    await flush();
    await flush();
    // In beat 0's dwell: the stubbed clip fired no cues, volumes still on.
    expect(store.getState().settings.volumes.enabled).toBe(true);

    store.dispatch(advanceTour());
    await flush();
    await flush();
    // Entering beat 1: the fold applied beat 0's hide cue despite it never firing.
    expect(store.getState().settings.volumes.enabled).toBe(false);

    store.dispatch(prevBeat());
    await flush();
    await flush();
    // Back at beat 0: the prefix is empty again — baseline restored.
    expect(store.getState().settings.volumes.enabled).toBe(true);

    store.dispatch(exitTour());
    await task.toPromise();
  });

  // ── (2c) beat ranges window the run to a contiguous slice ─────────────────

  it('plays only the beats inside a given range', async () => {
    vi.useFakeTimers();

    // Three short-dwell beats; the range selects only the middle one.
    const beats: BeatData[] = ['First', 'Second', 'Third'].map((title) => ({
      enterClip: NARRATION_CLIP,
      caption: { title },
      dwellClip: dwellDrift(0.001),
    }));

    const stub = makeAutoFlyStub();
    const { store, sagaMiddleware } = buildStore({ playClip: stub });
    sagaMiddleware.run(guidedTourSaga, makeTour(beats), { from: 1, to: 1 });

    // The run starts at the window's `from` in GLOBAL indices — beatChanged(1)
    // corrects the 0 that tourStarted reset once the opening settle delay
    // (FOLD_SETTLE_MS, windowed from > 0 takes only) releases the beat.
    await vi.advanceTimersByTimeAsync(FOLD_SETTLE_MS);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().tour.beatIndex).toBe(1);

    await vi.runAllTimersAsync();

    // Exactly one beat played: one fly (resolved) + one drift (blocked). Beats
    // 0 and 2 never reached playClip, and the loop ended naturally after the
    // window (tour no longer active).
    expect(stub.mock.calls.length).toBe(2);
    expect(store.getState().tour.active).toBe(false);
  });

  it('clamps an out-of-range beat range to the tour bounds', async () => {
    vi.useFakeTimers();

    const beats: BeatData[] = ['First', 'Second', 'Third'].map((title) => ({
      enterClip: NARRATION_CLIP,
      caption: { title },
      dwellClip: dwellDrift(0.001),
    }));

    const stub = makeAutoFlyStub();
    const { store, sagaMiddleware } = buildStore({ playClip: stub });
    // `to: 99` reaches past the end — it must clamp to the last beat, not
    // throw or play nothing: a saved recording command survives an authoring
    // change that shortens the tour.
    sagaMiddleware.run(guidedTourSaga, makeTour(beats), { from: 0, to: 99 });

    await vi.runAllTimersAsync();

    // All three beats flew (calls 1, 3, 5 in the parity stub) and the run
    // completed naturally.
    expect(stub.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(store.getState().tour.active).toBe(false);
  });

  it('collapses a reversed out-of-range window onto the clamped last beat', async () => {
    vi.useFakeTimers();

    const beats: BeatData[] = ['First', 'Second', 'Third'].map((title) => ({
      enterClip: NARRATION_CLIP,
      caption: { title },
      dwellClip: dwellDrift(0.001),
    }));

    const stub = makeAutoFlyStub();
    const { store, sagaMiddleware } = buildStore({ playClip: stub });
    // Each end clamps into the tour bounds INDEPENDENTLY: `from: 5` → 2,
    // `to: 2` → 2. The pre-clamp reversal disappears and the window is the
    // single last beat — the "shortened tour" survival path: a saved
    // recording command whose start index ran past the end still plays the
    // nearest beat rather than erroring or silently doing nothing.
    sagaMiddleware.run(guidedTourSaga, makeTour(beats), { from: 5, to: 2 });
    // The clamped window opens on beat 2 once the settle delay (windowed
    // from > 0) releases it.
    await vi.advanceTimersByTimeAsync(FOLD_SETTLE_MS);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().tour.beatIndex).toBe(2);

    await vi.runAllTimersAsync();

    // Exactly beat 2 played (one fly + one blocked drift), then natural
    // completion.
    expect(stub.mock.calls.length).toBe(2);
    expect(store.getState().tour.active).toBe(false);
  });

  it('plays nothing for an in-bounds reversed range but still completes and restores', async () => {
    const beats: BeatData[] = ['First', 'Second', 'Third'].map((title) => ({
      enterClip: NARRATION_CLIP,
      caption: { title },
      dwellClip: dwellDrift(0.001),
    }));

    const stub = makeAutoFlyStub();
    const { store, sagaMiddleware } = buildStore({ playClip: stub });
    store.dispatch(setVolumesEnabled(true));

    // `{from: 2, to: 0}` stays reversed AFTER clamping (both ends already in
    // bounds — contrast the collapse test above), so the window is empty and
    // the loop body never runs. The saga must still complete its
    // snapshot/restore sandwich normally: an empty window is a no-op take,
    // not an error.
    const task = sagaMiddleware.run(guidedTourSaga, makeTour(beats), { from: 2, to: 0 });
    await task.toPromise();

    expect(stub.mock.calls.length).toBe(0);
    expect(store.getState().tour.active).toBe(false);
    // The finally's restore merged the captured baseline back (a visual no-op
    // here — nothing mutated mid-run — but the restore path ran to completion).
    expect(store.getState().settings.volumes.enabled).toBe(true);
  });

  it('a beat range on an empty tour completes without playing anything', async () => {
    const stub = makeAutoFlyStub();
    const { store, sagaMiddleware } = buildStore({ playClip: stub });

    // A zero-beat tour clamps to an empty window (`from` 0 above `to` -1)
    // whatever the range says — the run must fall straight through to the
    // restore, never index beats[-1].
    const task = sagaMiddleware.run(guidedTourSaga, makeTour([]), { from: 0, to: 0 });
    await task.toPromise();

    expect(stub.mock.calls.length).toBe(0);
    expect(store.getState().tour.active).toBe(false);
  });

  it('a range take still applies the scene cues of the skipped prefix', async () => {
    // Beat 0 carries a hide cue in its enter clip, but the range starts at
    // beat 1 — beat 0 never plays at all. The reconstruction fold indexes the
    // FULL beats array with the global entry index, so entering beat 1 must
    // apply the skipped prefix's cue exactly as a full playthrough would.
    const cueBeat: BeatData = {
      enterClip: { start: 'live', timeline: [hide(['volumesMaster'], 0)] },
      caption: { title: 'B1' },
      dwellClip: dwellDrift(9999),
    };
    const plainBeat: BeatData = {
      enterClip: NARRATION_CLIP,
      caption: { title: 'B2' },
      dwellClip: dwellDrift(9999),
    };

    vi.useFakeTimers();
    const { store, sagaMiddleware } = buildStore({ playClip: makeAutoFlyStub() });
    store.dispatch(setVolumesEnabled(true));
    const task = sagaMiddleware.run(guidedTourSaga, makeTour([cueBeat, plainBeat]), {
      from: 1,
      to: 1,
    });

    // The reconstruction fold dispatches synchronously on entry — beat 0's
    // hide cue is applied before the settle delay even starts ticking.
    expect(store.getState().settings.volumes.enabled).toBe(false);

    // The settle delay gates the beat itself; once it elapses, beat 1 plays.
    await vi.advanceTimersByTimeAsync(FOLD_SETTLE_MS);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().tour.beatIndex).toBe(1);

    store.dispatch(exitTour());
    await task.toPromise();
    // The exit restore winds the cue's effect back to the captured baseline.
    expect(store.getState().settings.volumes.enabled).toBe(true);
  });

  // ── (2d) windowed takes settle the reconstruction fold before playing ─────

  it('a windowed take settles the reconstruction fold before the first fly', async () => {
    vi.useFakeTimers();

    const beats: BeatData[] = ['First', 'Second'].map((title) => ({
      enterClip: NARRATION_CLIP,
      caption: { title },
      dwellClip: dwellDrift(0.001),
    }));

    const stub = makeAutoFlyStub();
    const { store, sagaMiddleware } = buildStore({ playClip: stub });
    sagaMiddleware.run(guidedTourSaga, makeTour(beats), { from: 1, to: 1 });

    // The fold's mergeSnapshot lands synchronously, but the visibility bridge
    // and label-fade envelope animate that diff — the beat's fly must wait
    // out FOLD_SETTLE_MS so the film opens on a settled scene.
    expect(stub).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(FOLD_SETTLE_MS - 1);
    expect(stub).not.toHaveBeenCalled();

    // Crossing the settle boundary releases the fly.
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(stub).toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(store.getState().tour.active).toBe(false);
  });

  it('a full run reaches the first fly with no settle delay added', async () => {
    vi.useFakeTimers();

    const beats: BeatData[] = ['First', 'Second'].map((title) => ({
      enterClip: NARRATION_CLIP,
      caption: { title },
      dwellClip: dwellDrift(0.001),
    }));

    const stub = makeAutoFlyStub();
    const { store, sagaMiddleware } = buildStore({ playClip: stub });
    sagaMiddleware.run(guidedTourSaga, makeTour(beats));

    // Zero-length advances flush 0 ms macrotasks but can never fire a
    // FOLD_SETTLE_MS timer — the first fly must already be through: beat 0's
    // fold equals the live baseline, so there is nothing to settle.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(stub).toHaveBeenCalled();

    await vi.runAllTimersAsync();
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

  // ── (6) beat-boundary reconstruction never raw-writes orientation ────────

  it('does not carry orientation in a beat-boundary mergeSnapshot payload, and does not revert a live-set frame', async () => {
    // Two beats so entering beat 1 fires the reconstruction fold guidedTourSaga
    // dispatches at the top of every loop iteration
    // (`mergeSnapshot(computeSceneEntering(...))`) — the exact site of the
    // Critical this test guards: a raw write there used to sweep
    // `orientation` back to its pre-tour value every time a beat started.
    const beat1: BeatData = {
      enterClip: NARRATION_CLIP,
      caption: { title: 'First' },
      dwellClip: dwellDrift(9999),
    };
    const beat2: BeatData = {
      enterClip: NARRATION_CLIP,
      caption: { title: 'Second' },
      dwellClip: dwellDrift(9999),
    };

    const seenMergePayloads: unknown[] = [];
    const sagaMiddleware = createSagaMiddleware();
    const recorder = () => (next: (a: unknown) => unknown) => (action: unknown) => {
      const a = action as { type: string; payload?: unknown };
      if (a.type === mergeSnapshot({}).type) seenMergePayloads.push(a.payload);
      return next(action);
    };
    const store = configureStore({
      reducer: rootReducer,
      middleware: (g) => g().concat(recorder, sagaMiddleware),
    });
    sagaMiddleware.setContext({
      resolveDeps: () => immediateDeps,
      cameraRuntime: () => CAMERA_RUNTIME,
      playClip: makeAutoFlyStub(),
    });

    sagaMiddleware.run(guidedTourSaga, makeTour([beat1, beat2]));

    // Advance to beat 0's dwell (fly resolved, drift blocking).
    await flush();
    await flush();

    // Stand in for beat 0's `frameTo` cue firing mid-dwell — same stand-in
    // idiom the rest of this file uses for an in-clip scene() cue (see the
    // module docstring): dispatch the settings action directly rather than
    // authoring a real clip cue.
    store.dispatch(setOrientation('galactic'));
    await flush();
    expect(store.getState().settings.orientation).toBe('galactic');

    // Cross the beat boundary.
    store.dispatch(advanceTour());
    await flush();
    await flush();
    expect(store.getState().tour.beatIndex).toBe(1);

    // The beat-boundary merge must never carry `orientation` — it lives on
    // SceneSnapshot now, not SettingsSnapshot, so computeSceneEntering's
    // return type cannot produce one (see SceneSnapshot's header).
    for (const payload of seenMergePayloads) {
      expect(payload).not.toHaveProperty('orientation');
    }
    // And the pole a beat actually set must survive the beat boundary — this
    // is the visible symptom: beats 02-09 authoring supergalactic must not
    // have it reverted the instant the next beat starts.
    expect(store.getState().settings.orientation).toBe('galactic');

    store.dispatch(exitTour());
    await flush();
  });
});
