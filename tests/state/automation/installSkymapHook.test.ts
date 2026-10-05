// @vitest-environment jsdom
/**
 * installSkymapHook — the always-on base hook. Pins the properties tools rely
 * on: no URL gate, and a lazily created `ready`.
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
const fakeEngine = () => ({ nextFrame: () => Promise.resolve() }) as EngineHandle;

describe('installSkymapHook', () => {
  beforeEach(() => {
    delete (window as SkymapWindow).__skymap;
    vi.mocked(whenStablyReady).mockClear();
  });

  it('installs without any URL flag', () => {
    vi.stubGlobal('__SKYMAP_PROJECT_ROOT__', '/checkout');
    window.history.replaceState(null, '', '/');
    installSkymapHook(configureStore({ reducer: rootReducer }), fakeEngine());

    expect(getHook()?.projectRoot).toBe('/checkout');
  });

  it('ready is created on first read and then cached', () => {
    const store = configureStore({ reducer: rootReducer });
    installSkymapHook(store, fakeEngine());
    expect(whenStablyReady).not.toHaveBeenCalled();

    const first = getHook()!.ready;
    expect(getHook()!.ready).toBe(first);
    expect(whenStablyReady).toHaveBeenCalledTimes(1);
  });
});
