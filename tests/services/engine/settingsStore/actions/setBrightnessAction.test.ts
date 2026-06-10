import { describe, it, expect } from 'vitest';

import { setBrightnessAction } from '../../../../../src/services/engine/settingsStore/actions/setBrightnessAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectBrightness } from '../../../../../src/services/engine/settingsStore/selectors/selectBrightness';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setBrightnessAction', () => {
  it('writes the brightness through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().surveys;

    setBrightnessAction(store, 4.5);

    expect(selectBrightness(store.getState())).toBe(4.5);
    expect(store.getState().surveys).not.toBe(before);
  });
});
