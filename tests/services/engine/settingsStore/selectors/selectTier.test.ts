import { describe, it, expect } from 'vitest';

import { selectTier } from '../../../../../src/services/engine/settingsStore/selectors/selectTier';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectTier', () => {
  it('returns the tier as a primitive string', () => {
    const state = makeSettingsFixture({ tier: 'large' });

    expect(selectTier(state)).toBe('large');
  });
});
