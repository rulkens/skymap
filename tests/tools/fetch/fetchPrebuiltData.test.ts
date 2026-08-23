import { describe, it, expect } from 'vitest';

import {
  volumeVisibilityByFileName,
  selectManifestFiles,
} from '../../../tools/fetch/fetchPrebuiltData';
import type { SourceEntry } from '../../../src/@types/data/SourceEntry';
import type { DataManifest } from '../../../src/@types/data/DataManifest';

/** Narrow fixture carrying only the fields `volumeVisibilityByFileName` reads. */
function volumeEntry(opts: {
  visible: boolean;
  binBaseName: string | null;
  tiered: boolean;
}): SourceEntry {
  return { type: 'volume', ...opts } as unknown as SourceEntry;
}

function flowEntry(opts: { visible: boolean; binBaseName: string }): SourceEntry {
  return { type: 'flow', ...opts } as unknown as SourceEntry;
}

describe('volumeVisibilityByFileName', () => {
  it('maps every tier of a tiered volume to its visible default', () => {
    const map = volumeVisibilityByFileName([
      volumeEntry({ visible: true, binBaseName: 'mcpm', tiered: true }),
    ]);
    expect(map.get('mcpm-small.scfd')).toBe(true);
    expect(map.get('mcpm-medium.scfd')).toBe(true);
    expect(map.get('mcpm-large.scfd')).toBe(true);
  });

  it('maps the single file of an untiered volume', () => {
    const map = volumeVisibilityByFileName([
      volumeEntry({ visible: false, binBaseName: 'cf4_density', tiered: false }),
    ]);
    expect(map.get('cf4_density.scfd')).toBe(false);
  });

  it('maps a flow entry (no tiered field at all)', () => {
    const map = volumeVisibilityByFileName([
      flowEntry({ visible: false, binBaseName: 'flowfield' }),
    ]);
    expect(map.get('flowfield.scfd')).toBe(false);
  });

  it('skips a procedural fixture with no on-disk file (binBaseName null)', () => {
    const map = volumeVisibilityByFileName([
      volumeEntry({ visible: false, binBaseName: null, tiered: false }),
    ]);
    expect(map.size).toBe(0);
  });

  it('ignores non-volume, non-flow entries entirely', () => {
    const galaxyEntry = { type: 'galaxyCatalog', visible: true } as unknown as SourceEntry;
    expect(volumeVisibilityByFileName([galaxyEntry]).size).toBe(0);
  });
});

describe('selectManifestFiles', () => {
  const manifest: DataManifest = {
    'galaxy-catalog/v9/sdss-large.bin': 'galaxy-catalog/v9/sdss-large.aaaa1111.bin',
    'scalar-field/v3/mcpm-large.scfd': 'scalar-field/v3/mcpm-large.bbbb2222.scfd',
    'scalar-field/v3/flowfield.scfd': 'scalar-field/v3/flowfield.cccc3333.scfd',
    // A volume with no registry row at all — a data pipeline baked and
    // synced ahead of its renderer wiring (the real-world Edenhofer case).
    'scalar-field/v3/edenhofer-dust-large.scfd':
      'scalar-field/v3/edenhofer-dust-large.dddd4444.scfd',
  };
  const visibility = new Map([
    ['mcpm-large.scfd', true],
    ['flowfield.scfd', false],
  ]);

  it('keeps non-scalar-field entries unconditionally', () => {
    const selected = selectManifestFiles(manifest, visibility, false);
    expect(selected).toContain('galaxy-catalog/v9/sdss-large.bin');
  });

  it('keeps a registered visible volume and drops a registered hidden one', () => {
    const selected = selectManifestFiles(manifest, visibility, false);
    expect(selected).toContain('scalar-field/v3/mcpm-large.scfd');
    expect(selected).not.toContain('scalar-field/v3/flowfield.scfd');
  });

  it('drops a scalar-field file with no registry row at all', () => {
    const selected = selectManifestFiles(manifest, visibility, false);
    expect(selected).not.toContain('scalar-field/v3/edenhofer-dust-large.scfd');
  });

  it('--volumes all waves through every scalar-field file, registered or not', () => {
    const selected = selectManifestFiles(manifest, visibility, true);
    expect(selected.sort()).toEqual(Object.keys(manifest).sort());
  });
});
