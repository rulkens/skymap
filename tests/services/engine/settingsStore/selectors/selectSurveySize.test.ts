import { describe, it, expect } from 'vitest';

import { selectSurveySize } from '../../../../../src/services/engine/settingsStore/selectors/selectSurveySize';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectSurveySize', () => {
  it('returns the survey point size', () => {
    const state = makeSettingsFixture({
      surveys: { ...makeSettingsFixture().surveys, sizePx: 6 },
    });

    expect(selectSurveySize(state)).toBe(6);
  });
});
