import { describe, it, expect } from 'vitest';

import { setSurveyLabelEnabled } from '../../../../../src/services/engine/settingsStore/reducers/setSurveyLabelEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setSurveyLabelEnabled', () => {
  it('flips surveys.items[id].labelEnabled copy-on-write and leaves siblings', () => {
    const state = makeSettingsFixture(); // every survey seeded labelEnabled
    const next = setSurveyLabelEnabled(state, 'famousGalaxy', false);

    expect(next.surveys.items.famousGalaxy.labelEnabled).toBe(false);
    // The touched cluster, items record, and row are all new refs …
    expect(next.surveys).not.toBe(state.surveys);
    expect(next.surveys.items).not.toBe(state.surveys.items);
    expect(next.surveys.items.famousGalaxy).not.toBe(state.surveys.items.famousGalaxy);
    // … but a sibling survey row keeps its existing reference …
    expect(next.surveys.items.sdss).toBe(state.surveys.items.sdss);
    // … and a sibling cluster is untouched.
    expect(next.structures).toBe(state.structures);
  });

  it('preserves the survey layer-visibility axis when flipping the label', () => {
    const state = makeSettingsFixture();
    const next = setSurveyLabelEnabled(state, 'famousGalaxy', false);

    expect(next.surveys.items.famousGalaxy.enabled).toBe(state.surveys.items.famousGalaxy.enabled);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();

    setSurveyLabelEnabled(state, 'famousGalaxy', false);

    expect(state.surveys.items.famousGalaxy.labelEnabled).toBe(true);
  });
});
