import { describe, it, expect } from 'vitest';

import { rootReducer } from '../../src/store/rootReducer';

describe('rootReducer', () => {
  it('exposes only the settings route', () => {
    // The combine should mount exactly one slice today. This guards against an
    // accidental extra route sneaking in; the slice's own initialState shape is
    // asserted in the slice test, not re-checked here.
    const state = rootReducer(undefined, { type: '@@INIT' });
    expect(Object.keys(state)).toEqual(['settings']);
    expect(state.settings).toBeDefined();
  });
});
