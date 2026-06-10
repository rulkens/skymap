import { describe, it, expect } from 'vitest';

import { setToneMapCurve } from '../../../../../src/services/engine/settingsStore/reducers/setToneMapCurve';
import { ToneMapCurve } from '../../../../../src/data/toneMapCurve';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setToneMapCurve', () => {
  it('copies-on-write the tonemap cluster', () => {
    const state = makeSettingsFixture();
    const next = setToneMapCurve(state, ToneMapCurve.Aces);

    expect(next.tonemap.curve).toBe(ToneMapCurve.Aces);
    // The touched cluster is a NEW reference …
    expect(next.tonemap).not.toBe(state.tonemap);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.surveys).toBe(state.surveys);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.tonemap.curve;

    setToneMapCurve(state, ToneMapCurve.Aces);

    expect(state.tonemap.curve).toBe(before);
  });
});
