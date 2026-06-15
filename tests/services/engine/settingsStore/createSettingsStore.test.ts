import { describe, it, expect, vi } from 'vitest';

import { createSettingsStore } from '../../../../src/services/engine/settingsStore/createSettingsStore';
import { setGalaxyCatalogSize } from '../../../../src/services/engine/settingsStore/reducers/setGalaxyCatalogSize';
import { selectGalaxyCatalogSize } from '../../../../src/services/engine/settingsStore/selectors/selectGalaxyCatalogSize';
import { makeSettingsFixture } from './makeSettingsFixture';
import { DEFAULT_POINT_SIZE_PX, DEFAULT_EXPOSURE } from '../../../../src/data/defaults';

describe('createSettingsStore', () => {
  it('seeds getState from the initial value', () => {
    const initial = makeSettingsFixture();
    const store = createSettingsStore(initial);

    expect(store.getState()).toEqual(initial);
  });

  it('setState with a reducer notifies subscribers and reflects in getState', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const spy = vi.fn();
    store.subscribe(spy);

    store.setState((s) => setGalaxyCatalogSize(s, 4));

    expect(spy).toHaveBeenCalled();
    expect(selectGalaxyCatalogSize(store.getState())).toBe(4);
  });

  // ── Bootstrap-seam contract ────────────────────────────────────────────
  //
  // `createEngine` seeds this store from the SAME defaults literal that used
  // to populate `state.settings`, then exposes it on `handle.settingsStore`
  // and makes `state.settings` a getter over `getState()`. We can't drive
  // `createEngine` headlessly (it needs a real GPUDevice — see
  // `flowFieldsHandle.test.ts`), so we pin the seam at the level it's
  // testable in Node: the exact seed object (mirrored by `makeSettingsFixture`,
  // which tracks the engine's literal field-for-field) flows through the store
  // and surfaces the right defaults via `getState()`.
  it('seeds the galaxy catalog size and tonemap exposure from defaults', () => {
    const store = createSettingsStore(makeSettingsFixture());

    expect(store.getState().galaxyCatalogs.sizePx).toBe(DEFAULT_POINT_SIZE_PX);
    expect(store.getState().tonemap.exposure).toBe(DEFAULT_EXPOSURE);
  });

  // The `state.settings` getter returns the store's held object by reference,
  // so the in-place nested mutators still live in Phase 1 (e.g.
  // `state.settings.galaxyCatalogs.brightness = v`) surface through `getState()`
  // without any echo. Modelled here on the held object the getter returns.
  it('reflects in-place nested mutation of the held state through getState', () => {
    const store = createSettingsStore(makeSettingsFixture());

    // Stand in for the engine's `state.settings` getter — it hands back the
    // exact object `getState()` holds.
    const settings = store.getState();
    settings.galaxyCatalogs.brightness = 2.5;

    expect(store.getState().galaxyCatalogs.brightness).toBe(2.5);
  });
});
