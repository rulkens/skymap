import { describe, it, expect } from 'vitest';

import { setDepthFade } from '../../../../../src/services/engine/settingsStore/reducers/setDepthFade';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setDepthFade', () => {
  it('copies-on-write the galaxy catalogs cluster', () => {
    const state = makeSettingsFixture();
    const next = setDepthFade(state, !state.galaxyCatalogs.depthFade);

    expect(next.galaxyCatalogs.depthFade).toBe(!state.galaxyCatalogs.depthFade);
    expect(next.galaxyCatalogs).not.toBe(state.galaxyCatalogs);
    expect(next.tonemap).toBe(state.tonemap);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.galaxyCatalogs.depthFade;

    setDepthFade(state, !before);

    expect(state.galaxyCatalogs.depthFade).toBe(before);
  });
});
