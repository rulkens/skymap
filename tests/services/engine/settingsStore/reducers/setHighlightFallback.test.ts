import { describe, it, expect } from 'vitest';

import { setHighlightFallback } from '../../../../../src/services/engine/settingsStore/reducers/setHighlightFallback';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setHighlightFallback', () => {
  it('copies-on-write the galaxy catalogs cluster', () => {
    const state = makeSettingsFixture();
    const next = setHighlightFallback(state, !state.galaxyCatalogs.highlightFallback);

    expect(next.galaxyCatalogs.highlightFallback).toBe(!state.galaxyCatalogs.highlightFallback);
    expect(next.galaxyCatalogs).not.toBe(state.galaxyCatalogs);
    expect(next.tonemap).toBe(state.tonemap);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.galaxyCatalogs.highlightFallback;

    setHighlightFallback(state, !before);

    expect(state.galaxyCatalogs.highlightFallback).toBe(before);
  });
});
