import { describe, it, expect } from 'vitest';

import { createAppStore } from '../../src/store/createAppStore';
import { setBrightness } from '../../src/state/settings/settingsSlice';
import { buildInitialSettings } from '../../src/state/settings/initialState';
import { tierRoute } from '../../src/store/constants';

describe('createAppStore', () => {
  it('returns a store seeded with settings initialState', () => {
    const { store } = createAppStore();
    // The slice seeds from `buildInitialSettings({ initialTier: 'medium' })`;
    // an unpreloaded store must surface exactly that.
    expect(store.getState().settings).toEqual(buildInitialSettings({ initialTier: 'medium' }));
  });

  it('honours preloadedState', () => {
    const { store } = createAppStore({ settings: buildInitialSettings({ initialTier: 'large' }) });
    expect(store.getState().settings.tier).toBe('large');
  });

  it('seeds the tier slice from preloadedState', () => {
    // `Partial<RootState>` accepts a tier-only seed; the tier slice surfaces it
    // directly (the slice state IS the `Tier` primitive).
    const { store } = createAppStore({ [tierRoute]: 'large' });
    expect(store.getState().tier).toBe('large');
  });

  it('dispatching a slice action updates state', () => {
    const { store } = createAppStore();
    store.dispatch(setBrightness(0.25));
    expect(store.getState().settings.galaxyCatalogs.brightness).toBe(0.25);
  });

  it('runs mainSaga without throwing', () => {
    // Construction wires + runs the root saga (now forking the tier watcher); it
    // must complete cleanly and leave a defined state.
    const { store } = createAppStore();
    expect(store.getState()).toBeDefined();
  });
});
