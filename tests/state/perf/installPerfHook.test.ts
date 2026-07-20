// @vitest-environment jsdom
/**
 * installPerfHook — the `window.__skymapPerf` seam the Playwright perf harness
 * drives through.
 *
 * These are gate tests only: the `?perf` no-op branch and the installed-shape
 * branch. `isPerfMode` is module-mocked (same technique as the recorder gate
 * tests) — the installer reads it per call, so flipping `mockReturnValue`
 * covers both branches in one file.
 *
 * `setPose` / `setStrategy` / `collectTimings` end-to-end behaviour is NOT
 * exercised here: driving a camera pose to a settled frame and reading real GPU
 * timings both need a live engine + WebGPU device, which no unit surface
 * provides. The gate test asserts they are wired (present + callable); the
 * `ready` debounce is already covered by the recorder suite through the shared
 * `whenStablyReady`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { installPerfHook, PERF_WARMUP_FRAMES } from '../../../src/state/perf/installPerfHook';
import { isPerfMode } from '../../../src/utils/url/isPerfMode';
import { requestTier } from '../../../src/state/tier/requestTier';
import { setTier } from '../../../src/state/tier/tierSlice';
import { engineStatusChanged } from '../../../src/state/engine/engineSlice';
import { READY_STABLE_MS } from '../../../src/state/lifecycle/whenStablyReady';
import { Source } from '../../../src/data/sources';
import type { EngineHandle } from '../../../src/@types/engine/EngineHandle';
import type { SkymapPerfHook } from '../../../src/@types/perf/SkymapPerfHook';
import type { PerfWindow } from '../../../src/@types/perf/PerfWindow';
import type { GpuTimingFrame } from '../../../src/@types/gpu/timing/GpuTimingFrame';

vi.mock('../../../src/utils/url/isPerfMode', () => ({
  isPerfMode: vi.fn<() => boolean>(() => false),
}));

const getHook = (): SkymapPerfHook | undefined => (window as PerfWindow).__skymapPerf;

function buildStore() {
  return configureStore({ reducer: rootReducer });
}

// A minimal fake engine handle: only `debug.timingService.subscribe` is
// reachable from the installer's gate, so that is the only member the fake
// needs. `subscribe` is a vi.fn returning a no-op unsubscribe.
function fakeEngine(): EngineHandle {
  const timingService = {
    enabled: true,
    subscribe: vi.fn<(listener: (frame: GpuTimingFrame) => void) => () => void>(() => () => {}),
  };
  return { debug: { timingService } } as unknown as EngineHandle;
}

describe('installPerfHook', () => {
  beforeEach(() => {
    delete (window as PerfWindow).__skymapPerf;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('installPerfHook is a no-op outside perf mode', () => {
    vi.mocked(isPerfMode).mockReturnValue(false);

    installPerfHook(buildStore(), fakeEngine());

    expect(getHook()).toBeUndefined();
  });

  it('installPerfHook exposes the hook under ?perf', () => {
    vi.mocked(isPerfMode).mockReturnValue(true);

    installPerfHook(buildStore(), fakeEngine());

    const hook = getHook();
    expect(hook).toBeDefined();
    expect(hook?.ready).toBeInstanceOf(Promise);
    expect(typeof hook?.setPose).toBe('function');
    expect(typeof hook?.setStrategy).toBe('function');
    expect(typeof hook?.collectTimings).toBe('function');
    expect(typeof hook?.setTier).toBe('function');
    expect(typeof hook?.getTier).toBe('function');

    // slotGroups is the name→groupKey seam the Node harness buckets its
    // per-layer timings through. Pin it as a non-empty plain object of
    // string values with at least one REAL layer→group mapping (key !== value)
    // — a regression to `group.title` (or any mis-key of the
    // `Object.fromEntries(TIMED_SLOT_GROUPS…)` seam) would empty or corrupt the
    // map and silently collapse every scenario's `floors` to [].
    const slotGroups = hook?.slotGroups;
    expect(slotGroups && typeof slotGroups === 'object').toBe(true);
    const entries = Object.entries(slotGroups ?? {});
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(([, value]) => typeof value === 'string')).toBe(true);
    expect(entries.some(([key, value]) => key !== value)).toBe(true);
  });

  it('getTier reports the current tier held by the store', () => {
    vi.mocked(isPerfMode).mockReturnValue(true);

    const store = buildStore();
    installPerfHook(store, fakeEngine());
    const hook = getHook();

    // The boot default seeded by the tier slice.
    expect(hook!.getTier()).toBe('medium');
    // A write to the tier slice is reflected — the hook reads live, not a snapshot.
    store.dispatch(setTier('large'));
    expect(hook!.getTier()).toBe('large');
  });

  it('setTier dispatches the requestTier command and resolves once the ready predicate holds', async () => {
    vi.useFakeTimers();
    vi.mocked(isPerfMode).mockReturnValue(true);

    const store = buildStore();
    // Spy on dispatch to capture the COMMAND — requestTier has no reducer, so
    // the tier slice itself won't change without the saga (absent in this store).
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    installPerfHook(store, fakeEngine());
    const hook = getHook();

    let resolved = false;
    const promise = hook!.setTier('large').then(() => {
      resolved = true;
    });

    // The COMMAND is what a UI control / tour step would dispatch — never setTier.
    expect(dispatchSpy).toHaveBeenCalledWith(requestTier('large'));

    // Drive the store to the "settled" reading (engine ready + no load in
    // flight) so the fresh whenStablyReady arms its stability timer.
    store.dispatch(engineStatusChanged({ kind: 'ready', count: 100, source: Source.SDSS }));
    // Not yet: the predicate must HOLD for the full stability window first.
    await Promise.resolve();
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(READY_STABLE_MS);
    await promise;
    expect(resolved).toBe(true);
  });

  it('collectTimings rejects (instead of hanging) when the timing service is disabled', async () => {
    vi.mocked(isPerfMode).mockReturnValue(true);

    // On a GPU whose adapter lacks `timestamp-query`, `createGpuTimingService`
    // hands back a no-op STUB whose `subscribe` never emits. Without the guard,
    // `collectTimings` would subscribe and wait forever — the harness hangs
    // inside `page.evaluate` with zero diagnostic. The guard converts that
    // silent hang into an eager, legible rejection BEFORE subscribing.
    const subscribe = vi.fn<(listener: (frame: GpuTimingFrame) => void) => () => void>(
      () => () => {},
    );
    const engine = {
      debug: { timingService: { enabled: false, subscribe } },
    } as unknown as EngineHandle;

    installPerfHook(buildStore(), engine);
    const hook = getHook();
    expect(hook).toBeDefined();

    await expect(hook!.collectTimings(3)).rejects.toThrow(/disabled/);
    // The guard returns before ever subscribing — no dangling listener.
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('collectTimings discards the first PERF_WARMUP_FRAMES delivered frames', async () => {
    vi.mocked(isPerfMode).mockReturnValue(true);

    // A controllable timing service: capture the subscribed listener so the
    // test can push synthetic frames one at a time. Each frame carries a single
    // slot whose `ms` marks its push order, so warmup vs. measured frames are
    // distinguishable in the resolved samples.
    let listener: ((frame: GpuTimingFrame) => void) | undefined;
    const engine = {
      debug: {
        timingService: {
          enabled: true,
          subscribe: vi.fn((l: (frame: GpuTimingFrame) => void) => {
            listener = l;
            return () => {
              listener = undefined;
            };
          }),
        },
      },
    } as unknown as EngineHandle;

    installPerfHook(buildStore(), engine);
    const hook = getHook();
    expect(hook).toBeDefined();

    const FRAMES = 4;
    const pushFrame = (ms: number): void =>
      listener?.({ frameIndex: ms, perPassMs: new Map([['hdr', ms]]) });

    const promise = hook!.collectTimings(FRAMES);
    let resolved = false;
    void promise.then(() => {
      resolved = true;
    });

    // Warmup frames (ms 0…WARMUP-1) are all discarded — promise stays pending.
    for (let i = 0; i < PERF_WARMUP_FRAMES; i++) pushFrame(i);
    await Promise.resolve();
    expect(resolved).toBe(false);

    // All but the last measured frame — still pending.
    const total = PERF_WARMUP_FRAMES + FRAMES;
    for (let i = PERF_WARMUP_FRAMES; i < total - 1; i++) pushFrame(i);
    await Promise.resolve();
    expect(resolved).toBe(false);

    // The final measured frame resolves it.
    pushFrame(total - 1);
    const samples = await promise;

    // Exactly FRAMES measured frames (one slot each), and the warmup frames'
    // markers (ms 0…WARMUP-1) are absent — only ms WARMUP…total-1 survive.
    const expectedMs = Array.from({ length: FRAMES }, (_, i) => PERF_WARMUP_FRAMES + i);
    expect(samples).toHaveLength(FRAMES);
    expect(samples.map((s) => s.ms)).toEqual(expectedMs);

    // Each sample carries its 0-based MEASURED-frame ordinal (post-warmup): the
    // Nth measured frame's samples all read `frame: N`. Here one slot per frame,
    // so the frame tags run 0…FRAMES-1 in arrival order.
    const expectedFrames = Array.from({ length: FRAMES }, (_, i) => i);
    expect(samples.map((s) => s.frame)).toEqual(expectedFrames);
  });
});
