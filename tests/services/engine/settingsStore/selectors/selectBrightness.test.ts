import { describe, it, expect } from 'vitest';

import { selectBrightness } from '../../../../../src/services/engine/settingsStore/selectors/selectBrightness';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectBrightness', () => {
  it('returns galaxy catalogs.brightness', () => {
    const state = makeSettingsFixture({
      galaxyCatalogs: { ...makeSettingsFixture().galaxyCatalogs, brightness: 3.25 },
    });

    expect(selectBrightness(state)).toBe(3.25);
  });
});
