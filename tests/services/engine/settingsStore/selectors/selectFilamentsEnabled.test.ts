import { describe, it, expect } from 'vitest';

import { selectFilamentsEnabled } from '../../../../../src/services/engine/settingsStore/selectors/selectFilamentsEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectFilamentsEnabled', () => {
  it('returns filaments.enabled as a primitive boolean', () => {
    const state = makeSettingsFixture({
      filaments: { ...makeSettingsFixture().filaments, enabled: false },
    });

    expect(selectFilamentsEnabled(state)).toBe(false);
  });
});
