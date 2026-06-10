import { describe, it, expect } from 'vitest';

import { setBiasMode } from '../../../../../src/services/engine/settingsStore/reducers/setBiasMode';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setBiasMode', () => {
  it('copies-on-write the bias cluster', () => {
    const state = makeSettingsFixture();
    const next = setBiasMode(state, 1);

    expect(next.bias.mode).toBe(1);
    // The touched cluster is a NEW reference …
    expect(next.bias).not.toBe(state.bias);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.surveys).toBe(state.surveys);
  });

  it('preserves the sibling absMagLimit leaf', () => {
    const state = makeSettingsFixture();
    const next = setBiasMode(state, 2);

    expect(next.bias.absMagLimit).toBe(state.bias.absMagLimit);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.bias.mode;

    setBiasMode(state, before === 0 ? 1 : 0);

    expect(state.bias.mode).toBe(before);
  });
});
