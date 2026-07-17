import { describe, expect, it } from 'vitest';
import { selectionHalo } from '../../../../src/services/engine/helpers/selectionHaloTable';
import { COSMO, NEAR0 } from '../../../../src/services/engine/frame/slabs';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_DISC_RADIUS_KPC,
} from '../../../../src/data/milkyWay/galacticCenter';
import { Source } from '../../../../src/data/sources';
import type { GalaxyRow } from '../../../../src/@types/engine/GalaxyRow';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';

// A minimal GalaxyRow with x/y/z and a measured diameter.
function galaxyRow(overrides: Partial<GalaxyRow> = {}): GalaxyRow {
  return {
    type: 'galaxyCatalog',
    source: Source.Glade,
    index: 0,
    objId: '1',
    x: 0,
    y: 0,
    z: 100,
    redshift: 0,
    magU: 0,
    magG: 0,
    magR: 0,
    magI: 0,
    magZ: 0,
    diameterKpc: 60,
    axisRatio: 1,
    positionAngleDeg: 0,
    classByte: 0,
    parentSurveyByte: 0,
    ...overrides,
  };
}

function structureRow(): StructureInfo {
  return {
    type: 'structure',
    id: 'virgo',
    name: 'Virgo Cluster',
    category: 'cluster',
    worldPos: [10, 0, 0],
    featured: true,
    physicalRadiusMpc: 2,
  };
}

describe('selectionHalo', () => {
  it('returns null for a null row (nothing selected)', () => {
    expect(selectionHalo(null)).toBeNull();
  });

  it('returns null for a structure row (structure uses the marker pass)', () => {
    expect(selectionHalo(structureRow() as SelectionRow)).toBeNull();
  });

  it('returns null for a body row (true-scale sphere, no Mpc-scale ring)', () => {
    const bodyRow: SelectionRow = {
      type: 'body',
      id: 'earth',
      label: 'Earth',
      positionMpc: [4.8481e-12, 0, 0],
      radiusKm: 6371,
    };
    expect(selectionHalo(bodyRow)).toBeNull();
  });

  it('returns a descriptor for a galaxy row with a measured diameter', () => {
    const halo = selectionHalo(galaxyRow({ diameterKpc: 60, x: 1, y: 2, z: 3 }));
    expect(halo).not.toBeNull();
    // radiusMpc = (60 * 2) / 1000 = 0.12
    expect(halo!.radiusMpc).toBeCloseTo(0.12, 6);
    expect(halo!.worldPos).toEqual([1, 2, 3]);
  });

  // The slab tags are what partition the two ring layers (COSMO vs NEAR0) so
  // only one writes the shared renderer per frame — a swapped tag would revive
  // the writeBuffer/submit race with no compiler or other test to catch it.
  it('tags Mpc-scale kinds (galaxy, Milky Way) COSMO and a survey star NEAR0', () => {
    const star: SelectionRow = {
      type: 'star',
      index: 3,
      positionMpc: [0.001, -0.002, 0.0005],
      absMag: 4.8,
      bpRp: 0.65,
      radiusKm: 696340,
    };
    expect(selectionHalo(galaxyRow())!.slab).toBe(COSMO);
    expect(selectionHalo({ type: 'milkyWay' } as SelectionRow)!.slab).toBe(COSMO);
    expect(selectionHalo(star)!.slab).toBe(NEAR0);
  });

  it('applies the synthetic-fallback floor (diameterKpc = 0) for galaxies', () => {
    const halo = selectionHalo(galaxyRow({ diameterKpc: 0 }));
    expect(halo).not.toBeNull();
    // diameterKpc 0 → fallback 30; radiusMpc = (30 * 2) / 1000 = 0.06
    expect(halo!.radiusMpc).toBeCloseTo(0.06, 6);
  });

  it('returns a descriptor for the milkyWay row anchored at MILKY_WAY_CENTER_WORLD', () => {
    const halo = selectionHalo({ type: 'milkyWay' } as SelectionRow);
    expect(halo).not.toBeNull();
    expect(halo!.radiusMpc).toBeCloseTo(MILKY_WAY_DISC_RADIUS_KPC / 1000, 6);
    expect(halo!.worldPos[0]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[0]);
    expect(halo!.worldPos[1]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[1]);
    expect(halo!.worldPos[2]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[2]);
  });
});
