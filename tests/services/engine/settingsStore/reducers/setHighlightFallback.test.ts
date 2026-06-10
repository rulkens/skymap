import { describe, it, expect } from 'vitest';

import { setHighlightFallback } from '../../../../../src/services/engine/settingsStore/reducers/setHighlightFallback';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setHighlightFallback', () => {
  it('copies-on-write the surveys cluster', () => {
    const state = makeSettingsFixture();
    const next = setHighlightFallback(state, !state.surveys.highlightFallback);

    expect(next.surveys.highlightFallback).toBe(!state.surveys.highlightFallback);
    expect(next.surveys).not.toBe(state.surveys);
    expect(next.tonemap).toBe(state.tonemap);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.surveys.highlightFallback;

    setHighlightFallback(state, !before);

    expect(state.surveys.highlightFallback).toBe(before);
  });
});
