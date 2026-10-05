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
import type { GalaxyRowFixture, StarRowFixture } from '../../../support/selectionResolverOver';
import { composeSelectionRows } from '../../../../src/services/engine/selection/composeSelectionRows';
import { ALL_KINDS_ENABLED } from '../../../support/allKindsEnabled';
import { Source } from '../../../../src/data/sources';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { SCENE_S_STARS } from '../../../../src/data/bodies/sceneSStars';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SOLAR_RADIUS_KM } from '../../../../src/data/bodies/solarRadiusKm';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { SURFACE_STANDOFF_RADII } from '../../../../src/utils/camera/clampDistance';
import { bodyDriverGeometry } from '../../../../src/utils/scene/bodyDriverGeometry';
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
};

/** The starCatalog Layer's slice of the composed resolver — its own live read. */
function starsFixture(catalog: StarCatalog | null): StarRowFixture {
  return {
    renderer: {
      loadedCatalogs: () =>
        (catalog ? [{ source: Source.GaiaStars, catalog }] : [])[Symbol.iterator](),
    },
  } as unknown as StarRowFixture;
}

const resolver = selectionResolverOver(deps, galaxies, starsFixture(null));

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

  it('maps every star code to the one positional star ref', () => {
    // The seeded codes used to resolve to a BODY ref (spec §7 reverses that):
    // identity follows the physics, so all four codes land on the star arm.
    expect(resolver.resolvePick({ sourceCode: Source.GaiaStars, localIdx: 42 })).toEqual({
      type: 'starCatalog',
      source: Source.GaiaStars,
      index: 42,
    });
    const idx = SCENE_STARS.length - 1;
    expect(resolver.resolvePick({ sourceCode: Source.FamousStar, localIdx: idx })).toEqual({
      type: 'starCatalog',
      source: Source.FamousStar,
      index: idx,
    });
    expect(resolver.resolvePick({ sourceCode: Source.Sun, localIdx: 0 })).toEqual({
      type: 'starCatalog',
      source: Source.Sun,
      index: 0,
    });
  });

  it('an out-of-range body pick index resolves to null', () => {
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
    expect(resolver.extractRow({ type: 'structure', id: 'virgo' }, SIM_DAYS)).toEqual(virgo);
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
      driver: bodyDriverGeometry('earth'),
    });

    const laterSimDays = SIM_DAYS + 200;
    const expectedLater = deriveBodyStates(laterSimDays).get('earth')!.positionMpc;
    const rowLater = resolver.extractRow({ type: 'body', id: 'earth' }, laterSimDays);
    expect(rowLater).toEqual({
      type: 'body',
      id: SCENE_EARTH.id,
      label: SCENE_EARTH.label,
      positionMpc: [...expectedLater],
      driver: bodyDriverGeometry('earth'),
    });
  });

  it('body ref with an unknown seed id → null', () => {
    expect(resolver.extractRow({ type: 'body', id: 'krypton' }, SIM_DAYS)).toBeNull();
  });

  it('survey star ref resolves against the loaded catalog', async () => {
    const catalog = await makeStarCatalog();
    const starResolver = selectionResolverOver(deps, galaxies, starsFixture(catalog));
    const record = resolveStarRecord(catalog, 1)!;
    expect(
      starResolver.extractRow(
        { type: 'starCatalog', source: Source.GaiaStars, index: 1 },
        SIM_DAYS,
      ),
    ).toEqual({
      type: 'starCatalog',
      source: Source.GaiaStars,
      index: 1,
      id: null,
      label: 'Field star',
      positionMpc: record.positionMpc,
      radiusM: SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M,
      absMag: record.absMag,
      bpRp: record.bpRp,
      // A survey star poses from no table: `poseId` null is what keeps the
      // follow rows and the approach tilt off it, as `focusDriverId` once did.
      driver: {
        poseId: null,
        boundingRadiusM: SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M,
        footprintRadiusM: SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M,
        groundRadiusM: SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M,
        standoffRadii: SURFACE_STANDOFF_RADII,
      },
    });
  });

  it('survey star ref against no loaded catalog → null', () => {
    expect(
      resolver.extractRow({ type: 'starCatalog', source: Source.GaiaStars, index: 0 }, SIM_DAYS),
    ).toBeNull();
  });

  it('a seeded star ref carries its durable id, label and photosphere, with no bin loaded', () => {
    const idx = SCENE_STARS.findIndex((star) => star.id === 'sirius');
    const sirius = SCENE_STARS[idx]!;
    expect(
      resolver.extractRow({ type: 'starCatalog', source: Source.FamousStar, index: idx }, SIM_DAYS),
    ).toEqual({
      type: 'starCatalog',
      source: Source.FamousStar,
      index: idx,
      id: 'sirius',
      label: sirius.label,
      positionMpc: [...deriveBodyStates(SIM_DAYS).get('sirius')!.positionMpc],
      radiusM: sirius.surface.datumRadiusM,
      // A seeded star poses from its own seed id — the S-star / famous-star
      // half of the arm→poseId mapping.
      driver: {
        poseId: 'sirius',
        boundingRadiusM: sirius.surface.datumRadiusM,
        footprintRadiusM: sirius.surface.datumRadiusM,
        groundRadiusM: sirius.surface.datumRadiusM,
        standoffRadii: SURFACE_STANDOFF_RADII,
      },
    });
  });

  it('an out-of-range seeded star index → null', () => {
    expect(
      resolver.extractRow(
        { type: 'starCatalog', source: Source.FamousStar, index: SCENE_STARS.length },
        SIM_DAYS,
      ),
    ).toBeNull();
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
    // A star is not a body id any more (spec §6), so its old link decodes to nothing.
    expect(resolver.resolveFocusId('body-sirius')).toBeNull();
    const id = resolver.focusIdOf({ type: 'body', id: 'earth' });
    expect(id).toBe('body-earth');
    expect(resolver.resolveFocusId(id!)).toEqual({ type: 'body', id: 'earth' });
  });

  it('round-trips a seeded star id from every seeded table', async () => {
    const siriusIdx = SCENE_STARS.findIndex((star) => star.id === 'sirius');
    const cases: readonly (readonly [string, SelectionRef])[] = [
      ['star-sirius', { type: 'starCatalog', source: Source.FamousStar, index: siriusIdx }],
      ['star-sun', { type: 'starCatalog', source: Source.Sun, index: 0 }],
      [
        'star-s2',
        {
          type: 'starCatalog',
          source: Source.SStar,
          index: SCENE_S_STARS.findIndex((star) => star.id === 's2'),
        },
      ],
    ];
    for (const [id, ref] of cases) {
      // Seeded ids decode with no bin loaded at all — only a survey index defers.
      expect(resolver.resolveFocusId(id)).toEqual(ref);
      expect(resolver.focusIdOf(ref)).toBe(id);
    }
    expect(resolver.resolveFocusId('star-krypton')).toBeNull();
  });

  it('star-<index> defers until a survey catalog is loaded, then round-trips', async () => {
    // D6'1: the link defers at the REF stage, so the deep link lands when the
    // bin commits instead of resolving to a record nothing can extract.
    expect(resolver.resolveFocusId('star-42')).toBeNull();

    const loaded = selectionResolverOver(deps, galaxies, starsFixture(await makeStarCatalog()));
    const ref: SelectionRef = { type: 'starCatalog', source: Source.GaiaStars, index: 42 };
    expect(loaded.resolveFocusId('star-42')).toEqual(ref);
    expect(loaded.focusIdOf(ref)).toBe('star-42');
    expect(loaded.resolveFocusId('star-0')).toEqual({
      type: 'starCatalog',
      source: Source.GaiaStars,
      index: 0,
    });
    expect(loaded.resolveFocusId('star-abc')).toBeNull();
    expect(loaded.resolveFocusId('star--1')).toBeNull();
    expect(loaded.resolveFocusId('star-1e3')).toBeNull();
    expect(loaded.resolveFocusId('star-1.5')).toBeNull();
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
    const composed = composeSelectionRows(
      () => rows,
      () => ALL_KINDS_ENABLED,
    );
    expect(composed.resolveFocusId('x-1')).toBeNull();
    expect(decodeY).not.toHaveBeenCalled();
  });

  it('an unclaimed id resolves to null without consulting any decode', () => {
    const decode = vi.fn(() => ({ type: 'x' }));
    const rows = [stubRow('x', 'x-', decode)];
    const composed = composeSelectionRows(
      () => rows,
      () => ALL_KINDS_ENABLED,
    );
    expect(composed.resolveFocusId('z-1')).toBeNull();
    expect(decode).not.toHaveBeenCalled();
  });

  it('two rows claiming the same id throw, naming the id and both rows', () => {
    const rows = [stubRow('x', 'x-', () => null), stubRow('y', 'x-', () => null)];
    const composed = composeSelectionRows(
      () => rows,
      () => ALL_KINDS_ENABLED,
    );
    expect(() => composed.resolveFocusId('x-1')).toThrow(/x-1/);
  });

  it('rowsOf is read on every call', () => {
    let calls = 0;
    const composed = composeSelectionRows(
      () => {
        calls++;
        return calls === 1 ? [] : [stubRow('x', 'x-', () => ({ type: 'x' }))];
      },
      () => ALL_KINDS_ENABLED,
    );
    expect(composed.resolveFocusId('x-1')).toBeNull();
    expect(composed.resolveFocusId('x-1')).toEqual({ type: 'x' });
    expect(calls).toBe(2);
  });
});

// ─── kindsEnabled gate (resolvePick only) ───────────────────────────────────

describe('composeSelectionRows — picking gate', () => {
  const structureRow: SelectionKindRow = {
    type: 'structure',
    pickSources: [Source.Cluster],
    resolvePick: () => ({ type: 'structure', id: 'virgo' }),
    extractRow: () => virgo,
    focusId: {
      claims: (id) => id.startsWith('cluster-'),
      decode: () => ({ type: 'structure', id: 'virgo' }),
      encode: () => 'cluster-virgo',
    },
  };

  it('resolvePick returns null for a disabled kind and the ref for an enabled one', () => {
    const pick = { sourceCode: Source.Cluster, localIdx: 0 };
    const allEnabled = composeSelectionRows(
      () => [structureRow],
      () => ({
        galaxyCatalog: true,
        structure: true,
        milkyWay: true,
        zoneOfAvoidance: true,
        body: true,
        starCatalog: true,
        blackHole: true,
      }),
    );
    expect(allEnabled.resolvePick(pick)).toEqual({ type: 'structure', id: 'virgo' });

    const structureDisabled = composeSelectionRows(
      () => [structureRow],
      () => ({
        galaxyCatalog: true,
        structure: false,
        milkyWay: true,
        zoneOfAvoidance: true,
        body: true,
        starCatalog: true,
        blackHole: true,
      }),
    );
    expect(structureDisabled.resolvePick(pick)).toBeNull();
  });

  it('extractRow and resolveFocusId ignore the gate — a disabled kind still resolves', () => {
    const structureDisabled = composeSelectionRows(
      () => [structureRow],
      () => ({
        galaxyCatalog: true,
        structure: false,
        milkyWay: true,
        zoneOfAvoidance: true,
        body: true,
        starCatalog: true,
        blackHole: true,
      }),
    );
    expect(structureDisabled.extractRow({ type: 'structure', id: 'virgo' }, SIM_DAYS)).toBe(virgo);
    expect(structureDisabled.resolveFocusId('cluster-virgo')).toEqual({
      type: 'structure',
      id: 'virgo',
    });
    expect(structureDisabled.focusIdOf({ type: 'structure', id: 'virgo' })).toBe('cluster-virgo');
  });
});
