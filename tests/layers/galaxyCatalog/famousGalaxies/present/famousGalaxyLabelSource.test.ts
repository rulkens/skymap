/**
 * Name row `i` labels catalog row `i` and picks instance `i` of the famous point batch; a names
 * table from another generation (count mismatch) names nothing rather than shifting every name
 * onto a neighbour.
 */

import { describe, expect, it, vi } from 'vitest';

import { famousGalaxyLabelSource } from '../../../../../src/layers/galaxyCatalog/famousGalaxies/present/famousGalaxyLabelSource';
import { catalogPickCodes } from '../../../../../src/utils/picking/catalogPickCodes';
import { GALAXY_CATALOG_SOURCE_ROWS } from '../../../../../src/layers/galaxyCatalog/sources/galaxyCatalogSourceRows';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { GalaxyCatalog } from '../../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import { testPickCode } from '../../../../support/testPickCode';

vi.mock(
  '../../../../../src/layers/galaxyCatalog/famousGalaxies/data/famousGalaxyNames.generated',
  () => ({
    FAMOUS_GALAXY_NAMES: [
      { id: 'm31', names: ['M31'], commonName: 'Andromeda Galaxy' },
      { id: 'm33', names: ['M33'] },
    ],
  }),
);

const STATE = {} as EngineState;
const PICK_CODES = catalogPickCodes(GALAXY_CATALOG_SOURCE_ROWS, testPickCode('galaxyCatalog'));
const catalogOf = (diameters: number[]) =>
  ({
    count: diameters.length,
    positions: new Float32Array([0.78, 0, 0, 0, 0.84, 0, 0, 0, 1]).subarray(
      0,
      3 * diameters.length,
    ),
    diameterKpc: new Float32Array(diameters),
  }) as unknown as GalaxyCatalog;
const runtimeOf = (catalog: GalaxyCatalog | null) => ({
  catalogs: new Map<GalaxyCatalogId, GalaxyCatalog>(catalog ? [['famousGalaxy', catalog]] : []),
  pickCodes: PICK_CODES,
});

describe('famousGalaxyLabelSource', () => {
  it('famous galaxies describe their labels', () => {
    const catalog = catalogOf([40, 18]);
    const source = famousGalaxyLabelSource(runtimeOf(catalog));
    expect(source.changes!(STATE)).toBe(catalog);

    const labels = source.items(STATE).map((item, i) => source.describe(item, i)!);
    expect(labels.map((l) => l.text)).toEqual(['Andromeda Galaxy', 'M33']);
    expect(labels[1]!.position).toEqual([0, Math.fround(0.84), 0]);
    expect(labels[1]!.subjectRadiusMpc).toBeCloseTo(9 * SCALE_UNITS.KPC_TO_MPC, 12);
    expect(labels[1]!.pick).toEqual({ code: PICK_CODES.pickCodeOf('famousGalaxy'), index: 1 });
    expect(labels[1]!.fadeKey).toBe('famousGalaxy');

    expect(famousGalaxyLabelSource(runtimeOf(catalogOf([40, 18, 5]))).items(STATE)).toEqual([]);
    expect(famousGalaxyLabelSource(runtimeOf(null)).items(STATE)).toEqual([]);
  });
});
