/**
 * Settings item types — type-shape smoke tests for the source-type-uniform
 * per-item settings. The modules are pure types, so `tsc --noEmit` does the
 * real verification; these runtime tests pin the assertable subset:
 *
 *   1. Each item type constructs from a literal carrying the universal
 *      `enabled` axis (plus `labelEnabled` on the label-bearing types).
 *   2. `VolumeFieldSettings` is assignable to `DataItemSettings` — i.e. it
 *      really extends the shared base rather than re-declaring `enabled`.
 *
 * The `satisfies` checks make a field rename or a dropped base field fail to
 * compile here rather than somewhere downstream that constructs these.
 */

import { describe, it, expect } from 'vitest';
import type { DataItemSettings } from '../../src/@types/settings/DataItemSettings';
import type { GalaxyCatalogItemSettings } from '../../src/@types/settings/GalaxyCatalogItemSettings';
import type { StructureItemSettings } from '../../src/@types/settings/StructureItemSettings';
import type { VolumeFieldSettings } from '../../src/@types/settings/VolumeFieldSettings';

describe('settings item types', () => {
  it('DataItemSettings / GalaxyCatalogItemSettings / StructureItemSettings carry enabled (+ labelEnabled)', () => {
    const base = { enabled: true } satisfies DataItemSettings;
    const galaxyCatalog = { enabled: true, labelEnabled: false } satisfies GalaxyCatalogItemSettings;
    const structure = { enabled: false, labelEnabled: true } satisfies StructureItemSettings;

    expect(base.enabled).toBe(true);
    expect(galaxyCatalog.labelEnabled).toBe(false);
    expect(structure.enabled).toBe(false);
    expect(structure.labelEnabled).toBe(true);
  });

  it('VolumeFieldSettings extends DataItemSettings (a field is assignable to the base)', () => {
    const field: VolumeFieldSettings = {
      enabled: true,
      intensity: 0.6,
      contrast: 1.2,
      densityScale: 1.0,
      paletteId: 'viridis',
      trim: 0.0,
      exposure: 1.0,
    };
    // A value of the richer type flows into the base slot — the `extends`
    // relationship made into a runtime-checkable assignment.
    const asBase: DataItemSettings = field;
    expect(asBase.enabled).toBe(true);
  });
});
