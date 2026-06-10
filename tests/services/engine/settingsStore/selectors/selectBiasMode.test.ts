import { describe, it, expect } from 'vitest';

import { selectBiasMode } from '../../../../../src/services/engine/settingsStore/selectors/selectBiasMode';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectBiasMode', () => {
  it('returns bias.mode as a primitive number', () => {
    const state = makeSettingsFixture({
      bias: { ...makeSettingsFixture().bias, mode: 2 },
    });

    expect(selectBiasMode(state)).toBe(2);
  });
});
