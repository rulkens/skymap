import { describe, it, expect } from 'vitest';

import { setThumbnailsEnabledAction } from '../../../../../src/services/engine/settingsStore/actions/setThumbnailsEnabledAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectThumbnailsEnabled } from '../../../../../src/services/engine/settingsStore/selectors/selectThumbnailsEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setThumbnailsEnabledAction', () => {
  it('writes the thumbnails-enabled flag through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().thumbnails;

    setThumbnailsEnabledAction(store, false);

    expect(selectThumbnailsEnabled(store.getState())).toBe(false);
    expect(store.getState().thumbnails).not.toBe(before);
  });
});
