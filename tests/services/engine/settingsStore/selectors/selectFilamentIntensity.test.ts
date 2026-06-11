import { describe, it, expect } from 'vitest';

import { selectFilamentIntensity } from '../../../../../src/services/engine/settingsStore/selectors/selectFilamentIntensity';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectFilamentIntensity', () => {
  it('returns filaments.intensity as a primitive number', () => {
    const state = makeSettingsFixture({
      filaments: { ...makeSettingsFixture().filaments, intensity: 0.42 },
    });

    expect(selectFilamentIntensity(state)).toBe(0.42);
  });
});
