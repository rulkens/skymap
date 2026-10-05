// @vitest-environment jsdom
/**
 * installSkymapHook — the always-on base hook. Pins the properties tools rely
 * on: no URL gate, a lazily created `ready`, and `nextFrame` reaching the engine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

vi.mock('../../../src/state/lifecycle/whenStablyReady', () => ({
  whenStablyReady: vi.fn(() => Promise.resolve()),
}));

import { installSkymapHook } from '../../../src/state/automation/installSkymapHook';
import { whenStablyReady } from '../../../src/state/lifecycle/whenStablyReady';
import { rootReducer } from '../../../src/store/rootReducer';
import type { SkymapWindow } from '../../../src/@types/automation/SkymapWindow';
import type { EngineHandle } from '../../../src/@types/engine/EngineHandle';

const getHook = () => (window as SkymapWindow).__skymap;
const fakeEngine = (nextFrame = () => Promise.resolve()) => ({ nextFrame }) as EngineHandle;

describe('installSkymapHook', () => {
  beforeEach(() => {
    delete (window as SkymapWindow).__skymap;
    vi.mocked(whenStablyReady).mockClear();
  });

  it('installs without any URL flag', () => {
    window.history.replaceState(null, '', '/');
    installSkymapHook(configureStore({ reducer: rootReducer }), fakeEngine());

    expect(getHook()?.projectRoot).toBe(__SKYMAP_PROJECT_ROOT__);
  });

  it('ready creates no store subscription until first read', () => {
    const store = configureStore({ reducer: rootReducer });
    const subscribe = vi.spyOn(store, 'subscribe');
    installSkymapHook(store, fakeEngine());
    expect(subscribe).not.toHaveBeenCalled();
    expect(whenStablyReady).not.toHaveBeenCalled();

    const first = getHook()!.ready;
    expect(getHook()!.ready).toBe(first);
    expect(whenStablyReady).toHaveBeenCalledTimes(1);
  });

  it('nextFrame delegates to the engine handle', async () => {
    const nextFrame = vi.fn(() => Promise.resolve());
    installSkymapHook(configureStore({ reducer: rootReducer }), fakeEngine(nextFrame));

    await getHook()!.nextFrame();
    expect(nextFrame).toHaveBeenCalledTimes(1);
  });
});
