import { describe, it, expect } from 'vitest';

import { selectBrightness } from '../../../../../src/services/engine/settingsStore/selectors/selectBrightness';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectBrightness', () => {
  it('returns surveys.brightness', () => {
    const state = makeSettingsFixture({
      surveys: { ...makeSettingsFixture().surveys, brightness: 3.25 },
    });

    expect(selectBrightness(state)).toBe(3.25);
  });
});
