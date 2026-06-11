import { describe, it, expect } from 'vitest';

import { setSurveySize } from '../../../../../src/services/engine/settingsStore/reducers/setSurveySize';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setSurveySize', () => {
  it('copies-on-write the surveys cluster', () => {
    const state = makeSettingsFixture();
    const next = setSurveySize(state, 4);

    expect(next.surveys.sizePx).toBe(4);
    // The touched cluster is a NEW reference …
    expect(next.surveys).not.toBe(state.surveys);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.tonemap).toBe(state.tonemap);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.surveys.sizePx;

    setSurveySize(state, 4);

    expect(state.surveys.sizePx).toBe(before);
  });
});
