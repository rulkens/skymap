import { describe, it, expect } from 'vitest';

import { writeVolumeField } from '../../../../../src/services/engine/settingsStore/reducers/writeVolumeField';
import { makeSettingsFixture } from '../makeSettingsFixture';

// `mcpm` is a shippable volume, so the construction seed (`seedVolumeFields`)
// always lands its row in the fixture — a safe real id to patch.
const FIELD = 'mcpm' as const;

describe('writeVolumeField', () => {
  it('copies-on-write the volumes.items Record with the patched row', () => {
    const state = makeSettingsFixture();
    const next = writeVolumeField(state, FIELD, { intensity: 0.42 });

    expect(next.volumes.items[FIELD]?.intensity).toBe(0.42);
    // New top-level, new volumes object, new items Record …
    expect(next).not.toBe(state);
    expect(next.volumes).not.toBe(state.volumes);
    expect(next.volumes.items).not.toBe(state.volumes.items);
    // … sibling cluster untouched.
    expect(next.surveys).toBe(state.surveys);
  });

  it('preserves the sibling enabled leaf on the shared volumes cluster', () => {
    const state = makeSettingsFixture();
    const next = writeVolumeField(state, FIELD, { intensity: 0.1 });

    expect(next.volumes.enabled).toBe(state.volumes.enabled);
  });

  it('merges the patch onto the existing row (other leaves preserved)', () => {
    const state = makeSettingsFixture();
    const before = state.volumes.items[FIELD]!;
    const next = writeVolumeField(state, FIELD, { enabled: !before.enabled });

    expect(next.volumes.items[FIELD]?.enabled).toBe(!before.enabled);
    // A leaf the patch didn't touch keeps its value.
    expect(next.volumes.items[FIELD]?.intensity).toBe(before.intensity);
  });

  it('is an identity no-op for an unknown field id', () => {
    const state = makeSettingsFixture();
    // `debug-gaussian` is excluded from the construction seed, so it has no row.
    const next = writeVolumeField(state, 'debug-gaussian', { intensity: 0.9 });

    // Same reference back — nothing to write, so no subscriber should wake.
    expect(next).toBe(state);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.volumes.items[FIELD]?.intensity;

    writeVolumeField(state, FIELD, { intensity: 0.99 });

    expect(state.volumes.items[FIELD]?.intensity).toBe(before);
  });
});
