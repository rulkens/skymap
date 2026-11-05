/**
 * whenStablyReady — the installer-shared "measure-ready" debounce, now gated
 * on arrival too. Fake timers make the `READY_STABLE_MS` window elapse
 * instantly, same technique as `installRecorderHook.test.ts`.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { whenStablyReady, READY_STABLE_MS } from '../../../src/state/lifecycle/whenStablyReady';
import {
  engineStatusChanged,
  engineLoadProgressChanged,
} from '../../../src/state/engine/engineSlice';
import { arrived, arrivalFailed } from '../../../src/state/arrival/arrivalSlice';

function buildStore() {
  return configureStore({ reducer: rootReducer });
}

// Drives the store to "engine ready + nothing loading", the half of the
// predicate `arrival` is layered on top of; arrival itself is left pending.
function settleLoad(store: ReturnType<typeof buildStore>): void {
  store.dispatch(engineStatusChanged({ kind: 'ready', count: 100 }));
  store.dispatch(engineLoadProgressChanged(null));
}

describe('whenStablyReady', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ready waits for arrival', async () => {
    vi.useFakeTimers();
    const store = buildStore();
    let settled = false;
    void whenStablyReady(store).then(() => {
      settled = true;
    });

    settleLoad(store);
    await vi.advanceTimersByTimeAsync(READY_STABLE_MS * 2);
    expect(settled).toBe(false);

    store.dispatch(arrived());
    await vi.advanceTimersByTimeAsync(READY_STABLE_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it('ready rejects when arrival failed', async () => {
    const store = buildStore();
    settleLoad(store);
    const pending = whenStablyReady(store);

    store.dispatch(arrivalFailed('unknown-id'));

    await expect(pending).rejects.toThrow('unknown-id');
  });
});
