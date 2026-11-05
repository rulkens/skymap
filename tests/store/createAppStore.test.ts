import { describe, it, expect } from 'vitest';

import { createAppStore } from '../../src/store/createAppStore';
import { NOOP_SAGA_CONTEXT } from '../support/createTestStore';
import { setBrightness } from '../../src/layers/galaxyCatalog/state/galaxyCatalogs/slice';
import { INITIAL_SETTINGS } from '../../src/state/settings/initialSettings';
import { settingsRoute, tierRoute, uiRoute } from '../../src/store/constants';
import type { UiState } from '../../src/@types/ui/UiState';

describe('createAppStore', () => {
  it('honours preloadedState', () => {
    // A settings field round-trips through `preloadedState`: seed a distinctive
    // brightness and assert the slice surfaces it rather than the default.
    const seeded = INITIAL_SETTINGS;
    const { store } = createAppStore({
      [settingsRoute]: {
        ...seeded,
        galaxyCatalogs: { ...seeded.galaxyCatalogs, brightness: 0.42 },
      },
    });
    expect(store.getState().settings.galaxyCatalogs.brightness).toBe(0.42);
  });

  it('runs mainSaga without throwing', () => {
    // Construction wires + runs the root saga (now forking the tier watcher); it
    // must complete cleanly and leave a defined state.
    const { store } = createAppStore();
    expect(store.getState()).toBeDefined();
  });
});
