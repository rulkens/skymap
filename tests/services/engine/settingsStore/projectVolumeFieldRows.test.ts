import { describe, it, expect } from 'vitest';

import { projectVolumeFieldRows } from '../../../../src/services/engine/settingsStore/projectVolumeFieldRows';
import { addVolumeField } from '../../../../src/services/engine/settingsStore/reducers/addVolumeField';
import { getVolumeFieldDefaults } from '../../../../src/data/volumeFieldDefaults';
import { makeSettingsFixture } from './makeSettingsFixture';

describe('projectVolumeFieldRows', () => {
  it('projects each items row to a complete VolumeFieldRowData', () => {
    const items = makeSettingsFixture().volumes.items;
    const rows = projectVolumeFieldRows(items);

    const mcpm = rows.find((r) => r.handle === 'mcpm');
    const defaults = getVolumeFieldDefaults('mcpm');
    expect(mcpm).toBeDefined();
    // Identity + values come from the items Record; label from registry defaults.
    expect(mcpm?.label).toBe(defaults.label ?? 'mcpm');
    expect(mcpm?.enabled).toBe(items['mcpm']?.enabled);
    expect(mcpm?.intensity).toBe(items['mcpm']?.intensity);
    expect(mcpm?.paletteId).toBe(items['mcpm']?.paletteId);
  });

  it('does NOT itself filter debug fixtures — the consumer filters on the way out', () => {
    // The projection is filter-free; App applies the `debug-*` drop in its
    // `useMemo`. Seed a debug fixture, project, then filter as the panel does.
    const seeded = addVolumeField(makeSettingsFixture(), 'debug-gaussian');
    const rows = projectVolumeFieldRows(seeded.volumes.items);

    // Unfiltered projection includes the debug row …
    expect(rows.some((r) => r.handle === 'debug-gaussian')).toBe(true);

    // … the panel's debug-filtered view drops it but keeps the science volumes.
    const panelRows = rows.filter((r) => !r.handle.startsWith('debug-'));
    expect(panelRows.some((r) => r.handle === 'debug-gaussian')).toBe(false);
    expect(panelRows.some((r) => r.handle === 'mcpm')).toBe(true);
  });
});
