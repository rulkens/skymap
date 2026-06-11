import { describe, it, expect } from 'vitest';

import { selectAbsMagLimit } from '../../../../../src/services/engine/settingsStore/selectors/selectAbsMagLimit';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectAbsMagLimit', () => {
  it('returns bias.absMagLimit as a primitive number', () => {
    const state = makeSettingsFixture({
      bias: { ...makeSettingsFixture().bias, absMagLimit: -21 },
    });

    expect(selectAbsMagLimit(state)).toBe(-21);
  });
});
