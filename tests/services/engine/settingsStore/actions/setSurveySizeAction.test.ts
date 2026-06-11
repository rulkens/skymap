import { describe, it, expect } from 'vitest';

import { setSurveySizeAction } from '../../../../../src/services/engine/settingsStore/actions/setSurveySizeAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectSurveySize } from '../../../../../src/services/engine/settingsStore/selectors/selectSurveySize';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setSurveySizeAction', () => {
  it('writes the size through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().surveys;

    setSurveySizeAction(store, 7);

    expect(selectSurveySize(store.getState())).toBe(7);
    // Copy-on-write propagated through the reducer: the surveys cluster is a new
    // ref, not an in-place mutation of the original held object.
    expect(store.getState().surveys).not.toBe(before);
  });
});
