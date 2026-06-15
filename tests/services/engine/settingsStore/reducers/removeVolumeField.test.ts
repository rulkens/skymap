import { describe, it, expect } from 'vitest';

import { removeVolumeField } from '../../../../../src/services/engine/settingsStore/reducers/removeVolumeField';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('removeVolumeField', () => {
  it('copies-on-write the volumes.items Record with the row removed', () => {
    const state = makeSettingsFixture();
    expect(state.volumes.items['mcpm']).toBeDefined();

    const next = removeVolumeField(state, 'mcpm');

    expect(next.volumes.items['mcpm']).toBeUndefined();
    expect(next.volumes).not.toBe(state.volumes);
    expect(next.volumes.items).not.toBe(state.volumes.items);
    expect(next.galaxyCatalogs).toBe(state.galaxyCatalogs);
    // Sibling enabled leaf preserved.
    expect(next.volumes.enabled).toBe(state.volumes.enabled);
  });

  it('still produces a fresh items Record when removing an absent id', () => {
    const state = makeSettingsFixture();
    // `debug-gaussian` is absent from the construction seed.
    const next = removeVolumeField(state, 'debug-gaussian');

    // A fresh object even though nothing was deleted (the helper's contract),
    // so any identity check the caller uses still sees a change.
    expect(next.volumes.items).not.toBe(state.volumes.items);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();

    removeVolumeField(state, 'mcpm');

    expect(state.volumes.items['mcpm']).toBeDefined();
  });
});
