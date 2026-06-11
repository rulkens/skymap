import { describe, it, expect } from 'vitest';

import { setAbsMagLimit } from '../../../../../src/services/engine/settingsStore/reducers/setAbsMagLimit';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setAbsMagLimit', () => {
  it('copies-on-write the bias cluster', () => {
    const state = makeSettingsFixture();
    const next = setAbsMagLimit(state, -20);

    expect(next.bias.absMagLimit).toBe(-20);
    // The touched cluster is a NEW reference …
    expect(next.bias).not.toBe(state.bias);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.surveys).toBe(state.surveys);
  });

  it('preserves the sibling mode leaf', () => {
    const state = makeSettingsFixture();
    const next = setAbsMagLimit(state, -18);

    expect(next.bias.mode).toBe(state.bias.mode);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.bias.absMagLimit;

    setAbsMagLimit(state, before - 1);

    expect(state.bias.absMagLimit).toBe(before);
  });
});
