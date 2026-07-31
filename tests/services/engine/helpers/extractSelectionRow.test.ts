import { describe, it, expect } from 'vitest';

import { extractSelectionRow } from '../../../../src/services/engine/helpers/extractSelectionRow';
import { resolveStarRecord } from '../../../../src/services/engine/helpers/resolveStarRecord';
import { buildStarOctree } from '../../../../tools/stars/buildStarOctree';
import {
  encodeStarCatalog,
  decodeStarCatalog,
} from '../../../../src/data/starCatalog/starCatalogFormat';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { SOLAR_RADIUS_KM } from '../../../../src/data/bodies/solarRadiusKm';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { Source } from '../../../../src/data/sources';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';

import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { ResolveDeps } from '../../../../src/@types/engine/ResolveDeps';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';

// Earth's row position comes from the derived J2000 snapshot — the same source
// the resolver's `body` arm reads (identity id/label/radius stay off the record).
const EARTH_POS = deriveBodyStates(CONST_J2000).get('earth')!.positionMpc;

function makeCloud(): GalaxyCatalog {
  return makeGalaxyCatalog(1, {
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
  });
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
  famousGalaxiesMeta: [],
  structures: { byId: (id) => (id === 'abell-2065' ? structure : null) },
  stars: { current: () => null },
};

/** A small real star catalog through the octree + encode/decode path. */
async function makeStarCatalog(): Promise<StarCatalog> {
  const octree = buildStarOctree(
    [
      { mortonIndex: 0, offset: [3, 1, 2], absMag: 5, bpRp: 0.3 },
      { mortonIndex: 0, offset: [7, 8, 9], absMag: 4, bpRp: 0.5 },
    ],
    { mortonBitsPerAxis: 9, cellEdgePc: 1.0, gridOrigin: [0, 0, 0] },
  );
  return decodeStarCatalog(await encodeStarCatalog(octree));
}

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
      label: SCENE_EARTH.label,
      positionMpc: EARTH_POS,
      radiusKm: SCENE_EARTH.radiusKm,
    });
  });

  it('star body row position is copied, not aliased to the shared anchor', () => {
    // A star's snapshot position IS its `SCENE_ANCHORS` array, shared by
    // reference (an anchor never moves, so the derive never copies it). The row
    // must COPY that Vec3: it lands in the RTK store, whose immutability
    // middleware freezes state — an aliased Vec3 would freeze the shared anchor
    // in place, poisoning every other consumer of the constant.
    const anchor = deriveBodyStates(CONST_J2000).get('sirius')!.positionMpc;
    const row = extractSelectionRow({ type: 'body', id: 'sirius' }, deps);
    expect(row !== null && row.type === 'body' && row.positionMpc).toEqual([...anchor]);
    expect(row !== null && row.type === 'body' && row.positionMpc).not.toBe(anchor);
  });

  it('body ref with an unknown seed id → null (garbage, not "loading")', () => {
    expect(extractSelectionRow({ type: 'body', id: 'krypton' }, deps)).toBeNull();
  });

  it('star ref resolves against the loaded catalog (matches resolveStarRecord)', async () => {
    const catalog = await makeStarCatalog();
    const starDeps: ResolveDeps = { ...deps, stars: { current: () => catalog } };
    const record = resolveStarRecord(catalog, 1)!;
    expect(extractSelectionRow({ type: 'star', index: 1 }, starDeps)).toEqual({
      type: 'star',
      index: 1,
      positionMpc: record.positionMpc,
      absMag: record.absMag,
      bpRp: record.bpRp,
      radiusKm: SOLAR_RADIUS_KM,
    });
  });

  it('star snapshots the nominal solar radius', async () => {
    // The bin quantises position + photometry only, so the extractor stamps the
    // one representative radius (the Sun's) onto every star row — the size
    // downstream framing/gating read for a field star that carries no measured one.
    const catalog = await makeStarCatalog();
    const starDeps: ResolveDeps = { ...deps, stars: { current: () => catalog } };
    const row = extractSelectionRow({ type: 'star', index: 0 }, starDeps);
    expect(row !== null && row.type === 'star' && row.radiusKm).toBe(SOLAR_RADIUS_KM);
  });

  it('star ref with no loaded catalog → null (cloud not loaded yet)', () => {
    // The shared deps' stars.current() returns null — a deep link / mid-load
    // race, not a garbage id, so the reconciler retries.
    expect(extractSelectionRow({ type: 'star', index: 0 }, deps)).toBeNull();
  });
});
