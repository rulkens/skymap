import { describe, it, expect } from 'vitest';

import { setDepthFade } from '../../../../../src/services/engine/settingsStore/reducers/setDepthFade';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setDepthFade', () => {
  it('copies-on-write the surveys cluster', () => {
    const state = makeSettingsFixture();
    const next = setDepthFade(state, !state.surveys.depthFade);

    expect(next.surveys.depthFade).toBe(!state.surveys.depthFade);
    expect(next.surveys).not.toBe(state.surveys);
    expect(next.tonemap).toBe(state.tonemap);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.surveys.depthFade;

    setDepthFade(state, !before);

    expect(state.surveys.depthFade).toBe(before);
  });
});
