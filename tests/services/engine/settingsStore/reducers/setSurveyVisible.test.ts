import { describe, it, expect } from 'vitest';

import { setSurveyVisible } from '../../../../../src/services/engine/settingsStore/reducers/setSurveyVisible';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setSurveyVisible', () => {
  it('flips items[id].enabled copy-on-write and leaves siblings', () => {
    const state = makeSettingsFixture(); // every survey seeded enabled
    const next = setSurveyVisible(state, 'sdss', false);

    expect(next.surveys.items.sdss.enabled).toBe(false);
    // The touched cluster, items record, and row are all new refs …
    expect(next.surveys).not.toBe(state.surveys);
    expect(next.surveys.items).not.toBe(state.surveys.items);
    expect(next.surveys.items.sdss).not.toBe(state.surveys.items.sdss);
    // … but a sibling survey row keeps its existing reference …
    expect(next.surveys.items['2mrs']).toBe(state.surveys.items['2mrs']);
    // … and a sibling cluster is untouched.
    expect(next.tonemap).toBe(state.tonemap);
  });

  it('preserves the survey row label axis when flipping visibility', () => {
    const state = makeSettingsFixture();
    const next = setSurveyVisible(state, 'sdss', false);

    expect(next.surveys.items.sdss.labelEnabled).toBe(state.surveys.items.sdss.labelEnabled);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();

    setSurveyVisible(state, 'sdss', false);

    expect(state.surveys.items.sdss.enabled).toBe(true);
  });
});
