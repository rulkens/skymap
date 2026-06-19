import { describe, it, expect } from 'vitest';

import { rootReducer } from '../../src/store/rootReducer';
import { settingsRoute, uiRoute } from '../../src/store/constants';

describe('rootReducer', () => {
  it('mounts the settings and ui routes', () => {
    // The combine should mount exactly the settings and ui slices. This guards
    // against an accidental extra/missing route; each slice's own initialState
    // shape is asserted in its slice test, not here.
    const state = rootReducer(undefined, { type: '@@INIT' });
    expect(Object.keys(state)).toEqual([settingsRoute, uiRoute]);
    expect(state.settings).toBeDefined();
    expect(state.ui).toBeDefined();
  });
});
