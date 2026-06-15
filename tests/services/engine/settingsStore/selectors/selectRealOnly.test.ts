import { describe, it, expect } from 'vitest';

import { selectRealOnly } from '../../../../../src/services/engine/settingsStore/selectors/selectRealOnly';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectRealOnly', () => {
  it('returns galaxy catalogs.realOnly', () => {
    const state = makeSettingsFixture({
      galaxyCatalogs: { ...makeSettingsFixture().galaxyCatalogs, realOnly: true },
    });

    expect(selectRealOnly(state)).toBe(true);
  });
});
