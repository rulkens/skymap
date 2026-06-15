import { describe, it, expect } from 'vitest';

import { selectDepthFade } from '../../../../../src/services/engine/settingsStore/selectors/selectDepthFade';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectDepthFade', () => {
  it('returns galaxy catalogs.depthFade', () => {
    const state = makeSettingsFixture({
      galaxyCatalogs: { ...makeSettingsFixture().galaxyCatalogs, depthFade: false },
    });

    expect(selectDepthFade(state)).toBe(false);
  });
});
