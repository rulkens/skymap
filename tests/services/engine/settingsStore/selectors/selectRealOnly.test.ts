import { describe, it, expect } from 'vitest';

import { selectRealOnly } from '../../../../../src/services/engine/settingsStore/selectors/selectRealOnly';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectRealOnly', () => {
  it('returns surveys.realOnly', () => {
    const state = makeSettingsFixture({
      surveys: { ...makeSettingsFixture().surveys, realOnly: true },
    });

    expect(selectRealOnly(state)).toBe(true);
  });
});
