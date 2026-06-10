import { describe, it, expect } from 'vitest';

import { setShowDiskRadiusRingAction } from '../../../../../src/services/engine/settingsStore/actions/setShowDiskRadiusRingAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectShowDiskRadiusRing } from '../../../../../src/services/engine/settingsStore/selectors/selectShowDiskRadiusRing';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setShowDiskRadiusRingAction', () => {
  it('writes the show-disk-radius-ring flag through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().debug;

    setShowDiskRadiusRingAction(store, true);

    expect(selectShowDiskRadiusRing(store.getState())).toBe(true);
    expect(store.getState().debug).not.toBe(before);
  });
});
