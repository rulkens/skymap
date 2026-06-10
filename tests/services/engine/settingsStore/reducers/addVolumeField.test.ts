import { describe, it, expect } from 'vitest';

import { addVolumeField } from '../../../../../src/services/engine/settingsStore/reducers/addVolumeField';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('addVolumeField', () => {
  it('seeds a fresh row for a field with no existing settings', () => {
    const state = makeSettingsFixture();
    // `debug-gaussian` is excluded from the construction seed, so it starts absent.
    expect(state.volumes.items['debug-gaussian']).toBeUndefined();

    const next = addVolumeField(state, 'debug-gaussian');

    expect(next.volumes.items['debug-gaussian']).toBeDefined();
    // Copy-on-write at the touched cluster only.
    expect(next.volumes).not.toBe(state.volumes);
    expect(next.volumes.items).not.toBe(state.volumes.items);
    expect(next.surveys).toBe(state.surveys);
    // Sibling enabled leaf preserved.
    expect(next.volumes.enabled).toBe(state.volumes.enabled);
  });

  it('is an identity no-op when the field already has a row', () => {
    const state = makeSettingsFixture();
    // `mcpm` is shippable, so its row is already seeded.
    expect(state.volumes.items['mcpm']).toBeDefined();

    const next = addVolumeField(state, 'mcpm');

    // Same reference back — re-adding preserves tuned values without a write.
    expect(next).toBe(state);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();

    addVolumeField(state, 'debug-gaussian');

    expect(state.volumes.items['debug-gaussian']).toBeUndefined();
  });
});
