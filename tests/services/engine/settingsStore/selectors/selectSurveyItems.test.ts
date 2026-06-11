import { describe, it, expect } from 'vitest';

import { selectSurveyItems } from '../../../../../src/services/engine/settingsStore/selectors/selectSurveyItems';
import { setSurveyLabelEnabled } from '../../../../../src/services/engine/settingsStore/reducers/setSurveyLabelEnabled';
import { setSurveyVisible } from '../../../../../src/services/engine/settingsStore/reducers/setSurveyVisible';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectSurveyItems', () => {
  it('returns the underlying surveys.items Record by reference', () => {
    const state = makeSettingsFixture();

    expect(selectSurveyItems(state)).toBe(state.surveys.items);
  });

  it('returns the SAME ref when an unrelated leaf changes (stable-ref contract)', () => {
    const state = makeSettingsFixture();
    const before = selectSurveyItems(state);

    // A sibling leaf on the same cluster (brightness) must not disturb items.
    const afterBrightness = { ...state, surveys: { ...state.surveys, brightness: 0.123 } };
    expect(selectSurveyItems(afterBrightness)).toBe(before);

    // A wholly-unrelated cluster also must not disturb the items ref.
    const afterStructures = {
      ...state,
      structures: { ...state.structures, enabled: false },
    };
    expect(selectSurveyItems(afterStructures)).toBe(before);
  });

  it('returns a NEW ref when a survey label or visibility actually changes', () => {
    const state = makeSettingsFixture();
    const before = selectSurveyItems(state);

    expect(selectSurveyItems(setSurveyLabelEnabled(state, 'famousGalaxy', false))).not.toBe(before);
    expect(selectSurveyItems(setSurveyVisible(state, 'sdss', false))).not.toBe(before);
  });
});
