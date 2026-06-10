import { describe, it, expect } from 'vitest';

import { selectDepthFade } from '../../../../../src/services/engine/settingsStore/selectors/selectDepthFade';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectDepthFade', () => {
  it('returns surveys.depthFade', () => {
    const state = makeSettingsFixture({
      surveys: { ...makeSettingsFixture().surveys, depthFade: false },
    });

    expect(selectDepthFade(state)).toBe(false);
  });
});
