import { describe, it, expect } from 'vitest';

import { selectExposure } from '../../../../../src/services/engine/settingsStore/selectors/selectExposure';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectExposure', () => {
  it('returns tonemap.exposure as a primitive number', () => {
    const state = makeSettingsFixture({
      tonemap: { ...makeSettingsFixture().tonemap, exposure: 5.25 },
    });

    expect(selectExposure(state)).toBe(5.25);
  });
});
