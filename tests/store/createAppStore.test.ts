import { describe, it, expect } from 'vitest';

import { createAppStore } from '../../src/store/createAppStore';
import { setBrightness } from '../../src/state/settings/settingsSlice';
import { buildInitialSettings } from '../../src/state/settings/initialState';
import type { UiState } from '../../src/@types/ui/UiState';

describe('createAppStore', () => {
  it('returns a store seeded with settings initialState', () => {
    const store = createAppStore();
    // The slice seeds from `buildInitialSettings({ initialTier: 'medium' })`;
    // an unpreloaded store must surface exactly that.
    expect(store.getState().settings).toEqual(buildInitialSettings({ initialTier: 'medium' }));
  });

  it('honours preloadedState', () => {
    const store = createAppStore({ settings: buildInitialSettings({ initialTier: 'large' }) });
    expect(store.getState().settings.tier).toBe('large');
  });

  it('dispatching a slice action updates state', () => {
    const store = createAppStore();
    store.dispatch(setBrightness(0.25));
    expect(store.getState().settings.galaxyCatalogs.brightness).toBe(0.25);
  });

  it('runs mainSaga without throwing', () => {
    // Construction wires + runs the (empty) root saga; it must complete cleanly
    // and leave a defined state.
    const store = createAppStore();
    expect(store.getState()).toBeDefined();
  });

  it('seeds the ui slice from its initialState when unpreloaded', () => {
    // jsdom localStorage may not be clean, so assert the shape rather than
    // deep-equaling buildInitialUiState() which reads localStorage + URL.
    const store = createAppStore();
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
    const store = createAppStore({
      settings: buildInitialSettings({ initialTier: 'medium' }),
      ui: preloadedUi,
    });
    expect(store.getState().ui).toEqual(preloadedUi);
  });
});
