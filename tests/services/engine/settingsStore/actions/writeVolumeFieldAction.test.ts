import { describe, it, expect } from 'vitest';

import { writeVolumeFieldAction } from '../../../../../src/services/engine/settingsStore/actions/writeVolumeFieldAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectVolumeFieldItems } from '../../../../../src/services/engine/settingsStore/selectors/selectVolumeFieldItems';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('writeVolumeFieldAction', () => {
  it('patches the field row through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = selectVolumeFieldItems(store.getState());

    writeVolumeFieldAction(store, 'mcpm', { intensity: 0.7 });

    expect(store.getState().volumes.items['mcpm']?.intensity).toBe(0.7);
    expect(selectVolumeFieldItems(store.getState())).not.toBe(before);
  });

  it('lands an identity write for an unknown id (no items-ref change)', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = selectVolumeFieldItems(store.getState());

    writeVolumeFieldAction(store, 'debug-gaussian', { intensity: 0.5 });

    expect(selectVolumeFieldItems(store.getState())).toBe(before);
  });
});
