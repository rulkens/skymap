import { describe, it, expect } from 'vitest';

import { rootReducer } from '../../src/store/rootReducer';
import {
  settingsRoute,
  uiRoute,
  tierRoute,
  cameraRoute,
  selectionRoute,
  selectionRowsRoute,
  tourRoute,
  engineRoute,
  timeRoute,
} from '../../src/store/constants';

describe('rootReducer', () => {
  it('mounts the settings, ui, tier, camera, selection, selectionRows, tour, engine, and time routes', () => {
    // The combine should mount exactly the nine slices the store holds —
    // `settings`, `ui`, `tier`, `camera`, `selection`, `selectionRows`, `tour`,
    // `engine`, and `time` — in that order. This guards against an accidental
    // extra route sneaking in (or one going missing); each slice's own
    // initialState shape is asserted in its slice test, not re-checked here.
    const state = rootReducer(undefined, { type: '@@INIT' });
    expect(Object.keys(state)).toEqual([
      settingsRoute,
      uiRoute,
      tierRoute,
      cameraRoute,
      selectionRoute,
      selectionRowsRoute,
      tourRoute,
      engineRoute,
      timeRoute,
    ]);
    expect(state.settings).toBeDefined();
    expect(state.ui).toBeDefined();
    expect(state.tier).toBeDefined();
    expect(state.camera).toBeDefined();
    expect(state.selection).toBeDefined();
    expect(state.selectionRows).toBeDefined();
    expect(state.tour).toBeDefined();
    expect(state.engine).toBeDefined();
    expect(state.time).toBeDefined();
  });
});
