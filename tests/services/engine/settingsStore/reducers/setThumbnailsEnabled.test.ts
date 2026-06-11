import { describe, it, expect } from 'vitest';

import { setThumbnailsEnabled } from '../../../../../src/services/engine/settingsStore/reducers/setThumbnailsEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setThumbnailsEnabled', () => {
  it('copies-on-write the thumbnails cluster', () => {
    const state = makeSettingsFixture();
    const next = setThumbnailsEnabled(state, false);

    expect(next.thumbnails.enabled).toBe(false);
    // The touched cluster is a NEW reference …
    expect(next.thumbnails).not.toBe(state.thumbnails);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.surveys).toBe(state.surveys);
  });

  it('stores the boolean verbatim in either direction', () => {
    const state = makeSettingsFixture();

    expect(setThumbnailsEnabled(state, true).thumbnails.enabled).toBe(true);
    expect(setThumbnailsEnabled(state, false).thumbnails.enabled).toBe(false);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.thumbnails.enabled;

    setThumbnailsEnabled(state, !before);

    expect(state.thumbnails.enabled).toBe(before);
  });
});
