import { describe, it, expect } from 'vitest';

import { selectThumbnailsEnabled } from '../../../../../src/services/engine/settingsStore/selectors/selectThumbnailsEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectThumbnailsEnabled', () => {
  it('returns thumbnails.enabled as a primitive boolean', () => {
    const state = makeSettingsFixture({
      thumbnails: { ...makeSettingsFixture().thumbnails, enabled: false },
    });

    expect(selectThumbnailsEnabled(state)).toBe(false);
  });
});
