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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { installPerfHook } from '../../../src/state/perf/installPerfHook';
import { isPerfMode } from '../../../src/utils/url/isPerfMode';
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
  });
});
