import { describe, it, expect } from 'vitest';

import { removeVolumeFieldAction } from '../../../../../src/services/engine/settingsStore/actions/removeVolumeFieldAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('removeVolumeFieldAction', () => {
  it('drops the field row through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    expect(store.getState().volumes.items['mcpm']).toBeDefined();

    removeVolumeFieldAction(store, 'mcpm');

    expect(store.getState().volumes.items['mcpm']).toBeUndefined();
  });
});
