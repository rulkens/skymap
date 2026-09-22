import { describe, it, expect } from 'vitest';

import { projectVolumeFieldRows } from '../../../src/state/settings/projectVolumeFieldRows';
import { getVolumeFieldDefaults } from '../../../src/data/volume/volumeFieldDefaults';
import { makeSettingsFixture } from './makeSettingsFixture';

describe('projectVolumeFieldRows', () => {
  it('projects each items row to a complete VolumeFieldRowData', () => {
    const items = makeSettingsFixture().cosmicWebDensity.items;
    const rows = projectVolumeFieldRows(items);

    const mcpm = rows.find((r) => r.id === 'mcpm');
    const defaults = getVolumeFieldDefaults('mcpm');
    expect(mcpm).toBeDefined();
    // Identity + values come from the items Record; label from registry defaults.
    expect(mcpm?.label).toBe(defaults.label ?? 'mcpm');
    expect(mcpm?.enabled).toBe(items['mcpm']?.enabled);
    expect(mcpm?.intensity).toBe(items['mcpm']?.intensity);
    expect(mcpm?.paletteId).toBe(items['mcpm']?.paletteId);
  });
});
