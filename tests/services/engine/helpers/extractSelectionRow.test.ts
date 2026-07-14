import { describe, it, expect } from 'vitest';

import { extractSelectionRow } from '../../../../src/services/engine/helpers/extractSelectionRow';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { ResolveDeps } from '../../../../src/@types/engine/ResolveDeps';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';

function makeCloud(): GalaxyCatalog {
  return {
    count: 1,
    positions: new Float32Array([10, 20, 30]),
    spectroscopicZ: new Float32Array([0.0123]),
    magU: new Float32Array([18.1]),
    magG: new Float32Array([17.4]),
    magR: new Float32Array([16.9]),
    magI: new Float32Array([16.6]),
    magZ: new Float32Array([16.4]),
    objIDs: new BigUint64Array([1237668n]),
    diameterKpc: new Float32Array([42]),
    axisRatio: new Float32Array([0.7]),
    positionAngleDeg: new Float32Array([35]),
    classByte: new Uint8Array([0]),
    parentSurveyByte: new Uint8Array([0]),
  };
}

const structure: StructureInfo = {
  type: 'structure',
  category: 'cluster',
  id: 'abell-2065',
  name: 'Corona Borealis',
  worldPos: [1, 2, 3],
  featured: true,
  physicalRadiusMpc: 5,
} as unknown as StructureInfo;

const deps: ResolveDeps = {
  catalogs: { get: (s) => (s === Source.SDSS ? makeCloud() : undefined) },
  famousMeta: [],
  structures: { byId: (id) => (id === 'abell-2065' ? structure : null) },
};

describe('extractSelectionRow', () => {
  it('null ref → null', () => {
    expect(extractSelectionRow(null, deps)).toBeNull();
  });
  it('galaxy ref → GalaxyRow', () => {
    const row = extractSelectionRow({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }, deps);
    expect(row).toMatchObject({
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 0,
      objId: '1237668',
    });
  });
  it('structure ref → the StructureInfo by id', () => {
    expect(extractSelectionRow({ type: 'structure', id: 'abell-2065' }, deps)).toBe(structure);
  });
  it('milkyWay ref → the milkyWay tag', () => {
    expect(extractSelectionRow({ type: 'milkyWay' }, deps)).toEqual({ type: 'milkyWay' });
  });
  it('galaxy ref to an unloaded cloud → null (deep-link / tier race)', () => {
    expect(
      extractSelectionRow({ type: 'galaxyCatalog', source: Source.Glade, index: 0 }, deps),
    ).toBeNull();
  });

  it('body ref → a self-contained body row from the static SCENE_BODIES seed', () => {
    const row = extractSelectionRow({ type: 'body', id: 'earth' }, deps);
    expect(row).toEqual({
      type: 'body',
      id: SCENE_EARTH.id,
      positionMpc: SCENE_EARTH.positionMpc,
      radiusKm: SCENE_EARTH.radiusKm,
    });
  });

  it('body row position is copied, not aliased to the shared seed constant', () => {
    // The row lands in the RTK store, whose immutability middleware freezes
    // state — an aliased Vec3 would freeze SCENE_EARTH.positionMpc for every
    // other consumer of the seed.
    const row = extractSelectionRow({ type: 'body', id: 'earth' }, deps);
    expect(row !== null && row.type === 'body' && row.positionMpc).not.toBe(
      SCENE_EARTH.positionMpc,
    );
  });

  it('body ref with an unknown seed id → null (garbage, not "loading")', () => {
    expect(extractSelectionRow({ type: 'body', id: 'krypton' }, deps)).toBeNull();
  });
});
