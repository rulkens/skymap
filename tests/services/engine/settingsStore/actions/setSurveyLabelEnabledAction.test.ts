import { describe, it, expect } from 'vitest';

import { setSurveyLabelEnabledAction } from '../../../../../src/services/engine/settingsStore/actions/setSurveyLabelEnabledAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectSurveyItems } from '../../../../../src/services/engine/settingsStore/selectors/selectSurveyItems';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setSurveyLabelEnabledAction', () => {
  it('flips surveys.items[id].labelEnabled through the reducer and changes the items ref', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = selectSurveyItems(store.getState());

    setSurveyLabelEnabledAction(store, 'famousGalaxy', false);

    expect(store.getState().surveys.items.famousGalaxy.labelEnabled).toBe(false);
    expect(selectSurveyItems(store.getState())).not.toBe(before);
  });
});
