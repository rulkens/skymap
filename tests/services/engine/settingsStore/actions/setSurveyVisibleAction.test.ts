import { describe, it, expect } from 'vitest';

import { setSurveyVisibleAction } from '../../../../../src/services/engine/settingsStore/actions/setSurveyVisibleAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectVisibleSourceMask } from '../../../../../src/services/engine/settingsStore/selectors/selectVisibleSourceMask';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setSurveyVisibleAction', () => {
  it('flips items[id].enabled through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().surveys;
    const maskBefore = selectVisibleSourceMask(store.getState());

    setSurveyVisibleAction(store, 'sdss', false);

    expect(store.getState().surveys.items.sdss.enabled).toBe(false);
    // Copy-on-write propagated through the reducer.
    expect(store.getState().surveys).not.toBe(before);
    // The derived bitmask drops the toggled-off survey's bit.
    expect(selectVisibleSourceMask(store.getState())).not.toBe(maskBefore);
  });
});
