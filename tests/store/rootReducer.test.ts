import { describe, it, expect } from 'vitest';

import { rootReducer } from '../../src/store/rootReducer';
import {
  settingsRoute,
  uiRoute,
  tierRoute,
  selectionRoute,
  selectionRowsRoute,
} from '../../src/store/constants';

describe('rootReducer', () => {
  it('mounts the settings, ui, tier, selection, and selectionRows routes', () => {
    // The combine should mount exactly the five slices the store holds —
    // `settings`, `ui`, `tier`, `selection`, and `selectionRows`
    // — in that order. This guards against an accidental extra route sneaking in
    // (or one going missing); each slice's own initialState shape is asserted in
    // its slice test, not re-checked here.
    const state = rootReducer(undefined, { type: '@@INIT' });
    expect(Object.keys(state)).toEqual([
      settingsRoute,
      uiRoute,
      tierRoute,
      selectionRoute,
      selectionRowsRoute,
    ]);
    expect(state.settings).toBeDefined();
    expect(state.ui).toBeDefined();
    expect(state.tier).toBeDefined();
    expect(state.selection).toBeDefined();
    expect(state.selectionRows).toBeDefined();
  });
});
