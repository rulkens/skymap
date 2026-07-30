import { describe, it, expect } from 'vitest';

import { createAppStore } from '../../src/store/createAppStore';
import { NOOP_SAGA_CONTEXT } from '../support/createTestStore';
import { setBrightness } from '../../src/state/settings/settingsSlice';
import { buildInitialSettings } from '../../src/state/settings/initialState';
import { settingsRoute, tierRoute, uiRoute } from '../../src/store/constants';
import type { UiState } from '../../src/@types/ui/UiState';

describe('createAppStore', () => {
  it('returns a store seeded with settings initialState', () => {
    const { store } = createAppStore();
    // The slice seeds from `buildInitialSettings()`; an unpreloaded store must
    // surface exactly that.
    expect(store.getState().settings).toEqual(buildInitialSettings());
  });

  it('honours preloadedState', () => {
    // A settings field round-trips through `preloadedState`: seed a distinctive
    // brightness and assert the slice surfaces it rather than the default.
    const seeded = buildInitialSettings();
    const { store } = createAppStore({
      [settingsRoute]: {
        ...seeded,
        galaxyCatalogs: { ...seeded.galaxyCatalogs, brightness: 0.42 },
      },
    });
    expect(store.getState().settings.galaxyCatalogs.brightness).toBe(0.42);
  });

  it('seeds the tier slice from preloadedState', () => {
    // `Partial<RootState>` accepts a tier-only seed; the tier slice surfaces it
    // directly (the slice state IS the `Tier` primitive).
    const { store } = createAppStore({ [tierRoute]: 'large' });
    expect(store.getState().tier).toBe('large');
  });

  it('dispatching a slice action updates state', () => {
    const { store, setSagaContext } = createAppStore();
    // `setBrightness` is a settings (wake-route) write, so `watchWakeSaga` fires
    // and reaches `getContext('reconcile')`. Register the inert bag the engine
    // would register in the real app, so the worker has a render scheduler to
    // poke instead of dereferencing an undefined context (stderr noise; the
    // reducer assertion below passes either way).
    setSagaContext(NOOP_SAGA_CONTEXT);
    store.dispatch(setBrightness(0.25));
    expect(store.getState().settings.galaxyCatalogs.brightness).toBe(0.25);
  });

  it('runs mainSaga without throwing', () => {
    // Construction wires + runs the root saga (now forking the tier watcher); it
    // must complete cleanly and leave a defined state.
    const { store } = createAppStore();
    expect(store.getState()).toBeDefined();
  });

  it('seeds the ui slice from its initialState when unpreloaded', () => {
    // jsdom localStorage may not be clean, so assert the shape rather than
    // deep-equaling buildInitialUiState() which reads localStorage + URL.
    const { store } = createAppStore();
    const ui = store.getState().ui;
    expect(ui.paletteOpen).toBe(false);
    expect(ui.uiHidden).toBe(false);
    expect(ui.debugPanelOpen).toBe(false);
    expect(ui.splash).toMatchObject({ visible: expect.any(Boolean), dismissedVersion: null });
  });

  it('honours a preloaded ui slice', () => {
    const preloadedUi: UiState = {
      paletteOpen: true,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: false, dismissedVersion: 3 },
    };
    const { store } = createAppStore({
      [settingsRoute]: buildInitialSettings(),
      [uiRoute]: preloadedUi,
    });
    expect(store.getState().ui).toEqual(preloadedUi);
  });
});
