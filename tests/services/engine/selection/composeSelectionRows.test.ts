/**
 * composeSelectionRows, driven through the six core rows via
 * `selectionResolverOver` — the composed resolver's dispatch and its
 * claim-then-decode focus-id contract. Cases moved from the deleted
 * resolvePick.test.ts, resolvePickTable.test.ts, extractSelectionRow.test.ts
 * and resolveFocusId.test.ts (Task 8's `git rm`), one describe per former
 * source file's subject; new describes at the end pin the composer's own
 * dispatch behaviour that no single row's test could.
 */

import { describe, it, expect, vi } from 'vitest';

import { selectionResolverOver } from '../../../support/selectionResolverOver';
import type { GalaxyRowFixture } from '../../../support/selectionResolverOver';
import { composeSelectionRows } from '../../../../src/services/engine/selection/composeSelectionRows';
import { Source } from '../../../../src/data/sources';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SOLAR_RADIUS_KM } from '../../../../src/data/bodies/solarRadiusKm';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { resolveStarRecord } from '../../../../src/services/engine/helpers/resolveStarRecord';
import { buildStarOctree } from '../../../../tools/stars/buildStarOctree';
import {
  encodeStarCatalog,
  decodeStarCatalog,
} from '../../../../src/data/starCatalog/starCatalogFormat';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';

import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { ResolveDeps } from '../../../../src/@types/engine/ResolveDeps';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { SelectionKindRow } from '../../../../src/@types/engine/layer/SelectionKindRow';

const SIM_DAYS = CONST_J2000;
const EARTH_POS = deriveBodyStates(SIM_DAYS).get('earth')!.positionMpc;

const virgo: StructureInfo = {
  type: 'structure',
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

function makeCloud(objId: bigint, pos: [number, number, number] = [1, 0, 0]): GalaxyCatalog {
  return makeGalaxyCatalog(1, {
    positions: new Float32Array(pos),
    spectroscopicZ: new Float32Array([0.01]),
    magU: new Float32Array([18]),
    magG: new Float32Array([17]),
    magR: new Float32Array([16]),
    magI: new Float32Array([16]),
    magZ: new Float32Array([16]),
    objIDs: new BigUint64Array([objId]),
    diameterKpc: new Float32Array([30]),
    axisRatio: new Float32Array([1]),
  });
}

/** The galaxyCatalog Layer's slice of the composed resolver — its own two live reads. */
const galaxies: GalaxyRowFixture = {
  catalogs: new Map([
    [Source.SDSS, makeCloud(1237668393006604288n, [1, 0, 0])],
    [Source.Glade, makeCloud(99n, [1, 0, 0])],
    [Source.TwoMRS, makeCloud(2789n, [0, 1, 0])],
    [Source.FamousGalaxy, makeCloud(0n, [1, 0, 0])],
  ]),
  famousMeta: [
    { id: 'm31', names: ['M31', 'Andromeda'], description: 'The Andromeda Galaxy', type: 'Sb' },
  ],
} as GalaxyRowFixture;

/** The same fixture with only the named sources loaded. */
function galaxiesWith(...sources: readonly SourceType[]): GalaxyRowFixture {
  return {
    ...galaxies,
    catalogs: new Map([...galaxies.catalogs].filter(([code]) => sources.includes(code))),
  } as GalaxyRowFixture;
}

const deps: ResolveDeps = {
  structures: {
    byId: (id) => (id === 'virgo' ? virgo : null),
    byCategory: (cat) => (cat === 'cluster' ? [virgo] : []),
  },
  stars: { current: () => null },
};

const resolver = selectionResolverOver(deps, galaxies);

// ─── resolvePick dispatch (was resolvePick.test.ts / resolvePickTable.test.ts) ──

describe('resolvePick, composed', () => {
  it('null pick → null', () => {
    expect(resolver.resolvePick(null)).toBeNull();
  });

  it('maps a galaxy code to a positional ref regardless of whether the cloud is loaded', () => {
    expect(resolver.resolvePick({ sourceCode: Source.DesiDeep, localIdx: 3 })).toEqual({
      type: 'galaxyCatalog',
      source: Source.DesiDeep,
      index: 3,
    });
  });

  it('maps a structure code to a durable-id ref, or null with no backing record', () => {
    expect(resolver.resolvePick({ sourceCode: Source.Cluster, localIdx: 0 })).toEqual({
      type: 'structure',
      id: 'virgo',
    });
    expect(resolver.resolvePick({ sourceCode: Source.Cluster, localIdx: 99 })).toBeNull();
  });

  it('maps a milkyWay code to the singleton ref', () => {
    expect(resolver.resolvePick({ sourceCode: Source.MilkyWay, localIdx: 0 })).toEqual({
      type: 'milkyWay',
    });
  });

  it('warns and returns null for a non-pickable code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(resolver.resolvePick({ sourceCode: 30 as SourceType, localIdx: 0 })).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('maps a Gaia-star pick to a positional star ref', () => {
    expect(resolver.resolvePick({ sourceCode: Source.GaiaStars, localIdx: 42 })).toEqual({
      type: 'star',
      index: 42,
    });
  });

  it('the famous-star code resolves to a body ref', () => {
    const idx = SCENE_STARS.length - 1;
    expect(resolver.resolvePick({ sourceCode: Source.FamousStar, localIdx: idx })).toEqual({
      type: 'body',
      id: SCENE_STARS[idx]!.id,
    });
  });

  it('an out-of-range body pick index resolves to null', () => {
    expect(
      resolver.resolvePick({ sourceCode: Source.FamousStar, localIdx: SCENE_STARS.length }),
    ).toBeNull();
    expect(
      resolver.resolvePick({ sourceCode: Source.Planet, localIdx: SCENE_PLANETS.length }),
    ).toBeNull();
    expect(resolver.resolvePick({ sourceCode: Source.Earth, localIdx: 1 })).toBeNull();
  });
});

// ─── extractRow dispatch (was extractSelectionRow.test.ts) ──────────────────

describe('extractRow, composed', () => {
  it('null ref → null', () => {
    expect(resolver.extractRow(null, SIM_DAYS)).toBeNull();
  });

  it('galaxy ref → GalaxyRow', () => {
    const row = resolver.extractRow(
      { type: 'galaxyCatalog', source: Source.SDSS, index: 0 },
      SIM_DAYS,
    );
    expect(row).toMatchObject({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 });
  });

  it('galaxy ref to an unloaded cloud → null', () => {
    expect(
      resolver.extractRow({ type: 'galaxyCatalog', source: Source.DesiDeep, index: 0 }, SIM_DAYS),
    ).toBeNull();
  });

  it('structure ref → the StructureInfo by id', () => {
    expect(resolver.extractRow({ type: 'structure', id: 'virgo' }, SIM_DAYS)).toBe(virgo);
  });

  it('milkyWay ref → the singleton tag', () => {
    expect(resolver.extractRow({ type: 'milkyWay' }, SIM_DAYS)).toEqual({ type: 'milkyWay' });
  });

  it('body ref → a self-contained row resolved at the passed simDays', () => {
    const row = resolver.extractRow({ type: 'body', id: 'earth' }, SIM_DAYS);
    expect(row).toEqual({
      type: 'body',
      id: SCENE_EARTH.id,
      label: SCENE_EARTH.label,
      positionMpc: EARTH_POS,
    });

    const laterSimDays = SIM_DAYS + 200;
    const expectedLater = deriveBodyStates(laterSimDays).get('earth')!.positionMpc;
    const rowLater = resolver.extractRow({ type: 'body', id: 'earth' }, laterSimDays);
    expect(rowLater).toEqual({
      type: 'body',
      id: SCENE_EARTH.id,
      label: SCENE_EARTH.label,
      positionMpc: [...expectedLater],
    });
  });

  it('body ref with an unknown seed id → null', () => {
    expect(resolver.extractRow({ type: 'body', id: 'krypton' }, SIM_DAYS)).toBeNull();
  });

  it('star ref resolves against the loaded catalog', async () => {
    const catalog = await makeStarCatalog();
    const starResolver = selectionResolverOver(
      { ...deps, stars: { current: () => catalog } },
      galaxies,
    );
    const record = resolveStarRecord(catalog, 1)!;
    expect(starResolver.extractRow({ type: 'star', index: 1 }, SIM_DAYS)).toEqual({
      type: 'star',
      index: 1,
      positionMpc: record.positionMpc,
      absMag: record.absMag,
      bpRp: record.bpRp,
      radiusM: SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M,
    });
  });

  it('star ref against no loaded catalog → null', () => {
    expect(resolver.extractRow({ type: 'star', index: 0 }, SIM_DAYS)).toBeNull();
  });
});

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

// ─── resolveFocusId / focusIdOf (was resolveFocusId.test.ts) ────────────────

describe('resolveFocusId, composed', () => {
  it('empty id → null', () => {
    expect(resolver.resolveFocusId('')).toBeNull();
  });

  it('sdss-<objId> → galaxy ref at the matching index; unloaded or unmatched → null', () => {
    expect(resolver.resolveFocusId('sdss-1237668393006604288')).toEqual({
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 0,
    });
    expect(resolver.resolveFocusId('sdss-9999')).toBeNull();
    const noSdss = selectionResolverOver(deps, galaxiesWith());
    expect(noSdss.resolveFocusId('sdss-1237668393006604288')).toBeNull();
  });

  it('pgc-<objId> → GLADE first, then 2MRS', () => {
    expect(resolver.resolveFocusId('pgc-99')).toEqual({
      type: 'galaxyCatalog',
      source: Source.Glade,
      index: 0,
    });
    expect(resolver.resolveFocusId('pgc-2789')).toEqual({
      type: 'galaxyCatalog',
      source: Source.TwoMRS,
      index: 0,
    });
  });

  it('famous id → galaxy ref; unknown famous id → null', () => {
    expect(resolver.resolveFocusId('m31')).toEqual({
      type: 'galaxyCatalog',
      source: Source.FamousGalaxy,
      index: 0,
    });
    expect(resolver.resolveFocusId('ngc9999')).toBeNull();
  });

  it('an unloaded famous id is unclaimed by the cloud, decoding to null (claimed, not resolved)', () => {
    // Meta present but the FamousGalaxy cloud absent: claimed (matches the
    // permissive id class + meta scan) but decode returns null — D6'2's
    // deferral, not an unclaimed miss.
    const noCloud = selectionResolverOver(
      deps,
      galaxiesWith(Source.SDSS, Source.Glade, Source.TwoMRS),
    );
    expect(noCloud.resolveFocusId('m31')).toBeNull();
  });

  it('cluster-<seed> → structure ref with the durable id', () => {
    expect(resolver.resolveFocusId('cluster-virgo')).toEqual({
      type: 'structure',
      id: 'cluster-virgo',
    });
  });

  it('structure id with invalid chars → null', () => {
    expect(resolver.resolveFocusId('cluster-virgo m87')).toBeNull();
  });

  it('round-trips a milkyWay ref through encode → decode', () => {
    const id = resolver.focusIdOf({ type: 'milkyWay' });
    expect(id).not.toBeNull();
    expect(resolver.resolveFocusId(id!)).toEqual({ type: 'milkyWay' });
  });

  it('body-<unknownSeed> → null; round-trips a known body ref', () => {
    expect(resolver.resolveFocusId('body-krypton')).toBeNull();
    const id = resolver.focusIdOf({ type: 'body', id: 'earth' });
    expect(id).toBe('body-earth');
    expect(resolver.resolveFocusId(id!)).toEqual({ type: 'body', id: 'earth' });
  });

  it('round-trips star-<index> and rejects a malformed suffix', () => {
    expect(resolver.resolveFocusId('star-42')).toEqual({ type: 'star', index: 42 });
    expect(resolver.focusIdOf({ type: 'star', index: 42 })).toBe('star-42');
    expect(resolver.resolveFocusId('star-abc')).toBeNull();
    expect(resolver.resolveFocusId('star--1')).toBeNull();
    expect(resolver.resolveFocusId('star-1e3')).toBeNull();
    expect(resolver.resolveFocusId('star-1.5')).toBeNull();
    expect(resolver.resolveFocusId('star-0')).toEqual({ type: 'star', index: 0 });
  });

  it('pos@ra,dec → nearest galaxy ref within 30 arcsec; beyond it and malformed → null', () => {
    const posOnly = selectionResolverOver(deps, galaxiesWith(Source.SDSS));
    expect(posOnly.resolveFocusId('pos@0.0000,0.0000')).toEqual({
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 0,
    });
    expect(resolver.resolveFocusId('pos@90.0000,89.0000')).toBeNull();
    expect(resolver.resolveFocusId('pos@1,2,3')).toBeNull();
  });
});

describe('focusIdOf ∘ resolveFocusId round-trip', () => {
  it('SDSS ref (large objId) → sdss-<objId> → same ref', () => {
    const ref: SelectionRef = { type: 'galaxyCatalog', source: Source.SDSS, index: 0 };
    const id = resolver.focusIdOf(ref);
    expect(id).toBe('sdss-1237668393006604288');
    expect(resolver.resolveFocusId(id!)).toEqual(ref);
  });

  it('GLADE ref (objId 0n) → pos@ra,dec → same ref', () => {
    // objId 0 is the "no durable id" sentinel, so the encoder falls back to
    // the positional form — only GLADE is loaded, and with that objId.
    const posDeps = selectionResolverOver(deps, {
      ...galaxies,
      catalogs: new Map([[Source.Glade, makeCloud(0n, [1, 0, 0])]]),
    } as GalaxyRowFixture);
    const ref: SelectionRef = { type: 'galaxyCatalog', source: Source.Glade, index: 0 };
    const id = posDeps.focusIdOf(ref);
    expect(id).toBe('pos@0.0000,0.0000');
    expect(posDeps.resolveFocusId(id!)).toEqual(ref);
  });

  it('FamousGalaxy ref → famous seed id → same ref', () => {
    const ref: SelectionRef = { type: 'galaxyCatalog', source: Source.FamousGalaxy, index: 0 };
    const id = resolver.focusIdOf(ref);
    expect(id).toBe('m31');
    expect(resolver.resolveFocusId(id!)).toEqual(ref);
  });
});

// ─── the composer's own contract, over stub rows ────────────────────────────

describe('composeSelectionRows — claim-then-decode contract', () => {
  function stubRow(
    type: string,
    prefix: string,
    decode: (id: string) => unknown,
  ): SelectionKindRow {
    return {
      type,
      pickSources: [],
      resolvePick: () => null,
      extractRow: () => null,
      focusId: {
        claims: (id: string) => id.startsWith(prefix),
        decode,
        encode: () => null,
      },
    } as unknown as SelectionKindRow;
  }

  it('a claiming row is authoritative even when its decode is null', () => {
    const decodeY = vi.fn(() => ({ type: 'y' }));
    const rows = [stubRow('x', 'x-', () => null), stubRow('y', 'y-', decodeY)];
    const composed = composeSelectionRows(() => rows);
    expect(composed.resolveFocusId('x-1')).toBeNull();
    expect(decodeY).not.toHaveBeenCalled();
  });

  it('an unclaimed id resolves to null without consulting any decode', () => {
    const decode = vi.fn(() => ({ type: 'x' }));
    const rows = [stubRow('x', 'x-', decode)];
    const composed = composeSelectionRows(() => rows);
    expect(composed.resolveFocusId('z-1')).toBeNull();
    expect(decode).not.toHaveBeenCalled();
  });

  it('two rows claiming the same id throw, naming the id and both rows', () => {
    const rows = [stubRow('x', 'x-', () => null), stubRow('y', 'x-', () => null)];
    const composed = composeSelectionRows(() => rows);
    expect(() => composed.resolveFocusId('x-1')).toThrow(/x-1/);
  });

  it('rowsOf is read on every call', () => {
    let calls = 0;
    const composed = composeSelectionRows(() => {
      calls++;
      return calls === 1 ? [] : [stubRow('x', 'x-', () => ({ type: 'x' }))];
    });
    expect(composed.resolveFocusId('x-1')).toBeNull();
    expect(composed.resolveFocusId('x-1')).toEqual({ type: 'x' });
    expect(calls).toBe(2);
  });
});
