import { describe, it, expect } from 'vitest';

import { addVolumeFieldAction } from '../../../../../src/services/engine/settingsStore/actions/addVolumeFieldAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('addVolumeFieldAction', () => {
  it('seeds a row for a brand-new field through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    expect(store.getState().volumes.items['debug-gaussian']).toBeUndefined();

    addVolumeFieldAction(store, 'debug-gaussian');

    expect(store.getState().volumes.items['debug-gaussian']).toBeDefined();
  });

  it('is an identity no-op for an already-seeded field', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().volumes.items;

    addVolumeFieldAction(store, 'mcpm');

    expect(store.getState().volumes.items).toBe(before);
  });
});
