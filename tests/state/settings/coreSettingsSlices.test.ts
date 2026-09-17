import { describe, expect, it } from 'vitest';
import { CORE_SETTINGS_SLICES } from '../../../src/state/settings/coreSettingsSlices';
import { orientationSlice } from '../../../src/state/settings/core/orientationSlice';

describe('CORE_SETTINGS_SLICES', () => {
  // The reducerPath IS the settings-root key; a typo here silently relocates a
  // whole cluster, which no selector test would catch until runtime.
  it('claims exactly the seven core settings-root keys', () => {
    expect(CORE_SETTINGS_SLICES.map((s) => s.reducerPath).sort()).toEqual([
      'bloom',
      'camera',
      'debug',
      'hdr',
      'labels',
      'orientation',
      'tonemap',
    ]);
  });

  // Every settings action carries the `settings/` prefix so the cluster names
  // that also exist as root slices (camera, labels, debug) cannot collide.
  it('namespaces every action under settings/', () => {
    for (const slice of CORE_SETTINGS_SLICES) {
      expect(slice.name).toBe(`settings/${slice.reducerPath}`);
    }
  });

  // A primitive-state slice must RETURN, not mutate — Immer silently drops a
  // write to a string draft.
  it('replaces the orientation scalar', () => {
    const next = orientationSlice.reducer(
      'galactic',
      orientationSlice.actions.setOrientation('equatorial'),
    );
    expect(next).toBe('equatorial');
  });
});
