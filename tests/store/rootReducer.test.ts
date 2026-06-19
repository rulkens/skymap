import { describe, it, expect } from 'vitest';

import { rootReducer } from '../../src/store/rootReducer';

describe('rootReducer', () => {
  it('mounts the settings and tier routes', () => {
    // The combine should mount exactly the two slices the store holds today —
    // `settings` and `tier`. This guards against an accidental extra route
    // sneaking in (or one going missing); each slice's own initialState shape is
    // asserted in its slice test, not re-checked here.
    const state = rootReducer(undefined, { type: '@@INIT' });
    expect(Object.keys(state)).toEqual(['settings', 'tier']);
    expect(state.settings).toBeDefined();
    expect(state.tier).toBeDefined();
  });
});
