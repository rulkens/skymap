import { describe, it, expect } from 'vitest';

import { projectVolumeFieldRows } from '../../../../src/layers/cosmicWebDensity/ui/projectVolumeFieldRows';
import { makeSettingsFixture } from '../../../state/settings/makeSettingsFixture';

describe('projectVolumeFieldRows', () => {
  it('projects each items row to a complete VolumeFieldRowData, in source-row order', () => {
    const items = makeSettingsFixture().cosmicWebDensity.items;
    const rows = projectVolumeFieldRows(items);

    // Registry order (mcpm, polyphorm-2mrs, mcpm-workbench), not object-key order.
    expect(rows.map((r) => r.id)).toEqual(['mcpm', 'polyphorm-2mrs', 'mcpm-workbench']);

    const mcpm = rows[0]!;
    expect(mcpm.label).toBe('MCPM Cosmic Web');
    expect(mcpm.enabled).toBe(items['mcpm'].enabled);
    expect(mcpm.intensity).toBe(items['mcpm'].intensity);
    expect(mcpm.paletteId).toBe(items['mcpm'].paletteId);
  });
});
