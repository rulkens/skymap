import { describe, it, expect, vi } from 'vitest';

import { extractSelectionRow } from '../../../../src/services/engine/helpers/extractSelectionRow';
import { resolveStarRecord } from '../../../../src/services/engine/helpers/resolveStarRecord';
import { buildStarOctree } from '../../../../tools/stars/buildStarOctree';
import {
  encodeStarCatalog,
  decodeStarCatalog,
} from '../../../../src/data/starCatalog/starCatalogFormat';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SGR_A_STAR } from '../../../../src/data/bodies/sceneSgrAStar';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { SOLAR_RADIUS_KM } from '../../../../src/data/bodies/solarRadiusKm';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { Source } from '../../../../src/data/sources';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';

import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { ResolveDeps } from '../../../../src/@types/engine/ResolveDeps';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';

// vi.mock factories are hoisted above imports/consts — vi.hoisted is the
// sanctioned way to share a literal between a factory and its assertions.
const { MESH_BODY_FIXTURE_ID, MESH_BODY_FIXTURE_DESCRIPTION } = vi.hoisted(() => ({
  MESH_BODY_FIXTURE_ID: 'mesh-body-fixture',
  MESH_BODY_FIXTURE_DESCRIPTION: 'A humpback whale, breaching in slow motion.',
}));

// A MeshBody-shaped row (id/label/radiusM/albedo/meshKey/description) appended
// to the real SCENE_BODIES — MeshBody-SHAPED, not MeshBody-typed: SceneBody
// hasn't been widened to include it yet, and this test's job is the
// description path, not that widening.
vi.mock('../../../../src/data/bodies/sceneBodies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/data/bodies/sceneBodies')>();
  return {
    ...actual,
    SCENE_BODIES: [
      ...actual.SCENE_BODIES,
      {
        id: MESH_BODY_FIXTURE_ID,
        label: 'Fixture Whale',
        radiusM: 15,
        albedo: [0.5, 0.5, 0.5],
        meshKey: 'whale',
        description: MESH_BODY_FIXTURE_DESCRIPTION,
      },
    ],
  };
});

// Its ORBITAL_ELEMENTS counterpart: extractSelectionRow's body arm reads the
// position via `deriveBodyStates(simDays).get(body.id)!` — a fixture id absent
// from both this table and SCENE_ANCHORS would throw rather than resolve.
vi.mock('../../../../src/data/bodies/orbitalElements', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/data/bodies/orbitalElements')>();
  return {
    ...actual,
    ORBITAL_ELEMENTS: [
      ...actual.ORBITAL_ELEMENTS,
      {
        id: MESH_BODY_FIXTURE_ID,
        focusId: 'sun',
        semiMajorMpc: 1,
        eccentricity: 0,
        inclinationRad: 0,
        ascendingNodeRad: 0,
        argPeriapsisRad: 0,
        meanAnomalyRad: 0,
        color: [0.5, 0.5, 0.5],
      },
    ],
  };
});

// Earth's row position comes from the derived body-state snapshot at the
// simDays passed in — the same source the resolver's `body` arm reads
// (identity id/label/radius stay off the record). Non-body-focused tests pass
// this same instant; its value is otherwise arbitrary for them.
const SIM_DAYS = CONST_J2000;
const EARTH_POS = deriveBodyStates(SIM_DAYS).get('earth')!.positionMpc;

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
    expect(extractSelectionRow(null, deps, SIM_DAYS)).toBeNull();
  });
  it('galaxy ref → GalaxyRow', () => {
    const row = extractSelectionRow(
      { type: 'galaxyCatalog', source: Source.SDSS, index: 0 },
      deps,
      SIM_DAYS,
    );
    expect(row).toMatchObject({
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 0,
      objId: '1237668',
    });
  });
  it('structure ref → the StructureInfo by id', () => {
    expect(extractSelectionRow({ type: 'structure', id: 'abell-2065' }, deps, SIM_DAYS)).toBe(
      structure,
    );
  });
  it('milkyWay ref → the milkyWay tag', () => {
    expect(extractSelectionRow({ type: 'milkyWay' }, deps, SIM_DAYS)).toEqual({
      type: 'milkyWay',
    });
  });
  it('galaxy ref to an unloaded cloud → null (deep-link / tier race)', () => {
    expect(
      extractSelectionRow(
        { type: 'galaxyCatalog', source: Source.Glade, index: 0 },
        deps,
        SIM_DAYS,
      ),
    ).toBeNull();
  });

  it('body ref → a self-contained body row from the static SCENE_BODIES seed', () => {
    const row = extractSelectionRow({ type: 'body', id: 'earth' }, deps, SIM_DAYS);
    expect(row).toEqual({
      type: 'body',
      id: SCENE_EARTH.id,
      label: SCENE_EARTH.label,
      positionMpc: EARTH_POS,
      radiusM: SCENE_EARTH.radiusM,
    });
  });

  it('body ref for a body with no standoffRadii override → the row field is undefined', () => {
    // Earth carries no `standoffRadii` on its seed. Explicit `.toBeUndefined()`
    // (not the earlier `toEqual` case, which is lenient about missing keys) so
    // a reversed `'standoffRadii' in body` condition — one that would instead
    // stamp a real number onto every non-overriding body — fails here too.
    const row = extractSelectionRow({ type: 'body', id: 'earth' }, deps, SIM_DAYS);
    expect(row !== null && row.type === 'body' && row.standoffRadii).toBeUndefined();
  });

  it('body ref for Sgr A* carries its standoffRadii override through', () => {
    // The real regression this guards: `extractSelectionRow`'s
    // `'standoffRadii' in body` narrowing is exercised here against the ACTUAL
    // SCENE_BODIES seed (not a hand-built row with the field already set, the
    // way every downstream zoom test constructs its fixtures) — a typo'd
    // property name or a reversed condition would silently drop Sgr A*'s Q10
    // floor while every other test in the suite stays green.
    const row = extractSelectionRow({ type: 'body', id: SGR_A_STAR.id }, deps, SIM_DAYS);
    expect(row !== null && row.type === 'body' && row.standoffRadii).toBe(SGR_A_STAR.standoffRadii);
    expect(SGR_A_STAR.standoffRadii).toBe(2.0); // guards against both sides drifting to `undefined`
  });

  it('body ref for Sgr A* carries its focusDistanceRadii override through', () => {
    // Same regression shape as the standoffRadii guard above, for the
    // arrival-distance override: a typo'd property name or a reversed
    // `'focusDistanceRadii' in body` condition would silently drop the user's
    // framed ~30.4 r_s arrival distance while the rest of the suite stays green.
    const row = extractSelectionRow({ type: 'body', id: SGR_A_STAR.id }, deps, SIM_DAYS);
    expect(row !== null && row.type === 'body' && row.focusDistanceRadii).toBe(
      SGR_A_STAR.focusDistanceRadii,
    );
    expect(SGR_A_STAR.focusDistanceRadii).toBe(30.4); // guards against drift to `undefined`
  });

  it('body ref resolves the position at the PASSED simDays, not a fixed epoch', () => {
    // The whole point of the fix: two different simDays for the same orbiting
    // body must yield two different positions, sourced from deriveBodyStates at
    // exactly the value passed in.
    const laterSimDays = SIM_DAYS + 200; // ~200 days along Earth's orbit
    const rowAtEpoch = extractSelectionRow({ type: 'body', id: 'earth' }, deps, SIM_DAYS);
    const rowLater = extractSelectionRow({ type: 'body', id: 'earth' }, deps, laterSimDays);
    const expectedLater = deriveBodyStates(laterSimDays).get('earth')!.positionMpc;

    expect(rowAtEpoch !== null && rowAtEpoch.type === 'body' && rowAtEpoch.positionMpc).toEqual(
      EARTH_POS,
    );
    expect(rowLater !== null && rowLater.type === 'body' && rowLater.positionMpc).toEqual([
      ...expectedLater,
    ]);
    expect(rowLater).not.toEqual(rowAtEpoch);
  });

  it('star body row position is copied, not aliased to the shared anchor', () => {
    // A star's snapshot position IS its `SCENE_ANCHORS` array, shared by
    // reference (an anchor never moves, so the derive never copies it). The row
    // must COPY that Vec3: it lands in the RTK store, whose immutability
    // middleware freezes state — an aliased Vec3 would freeze the shared anchor
    // in place, poisoning every other consumer of the constant.
    const anchor = deriveBodyStates(SIM_DAYS).get('sirius')!.positionMpc;
    const row = extractSelectionRow({ type: 'body', id: 'sirius' }, deps, SIM_DAYS);
    expect(row !== null && row.type === 'body' && row.positionMpc).toEqual([...anchor]);
    expect(row !== null && row.type === 'body' && row.positionMpc).not.toBe(anchor);
  });

  it('body ref with an unknown seed id → null (garbage, not "loading")', () => {
    expect(extractSelectionRow({ type: 'body', id: 'krypton' }, deps, SIM_DAYS)).toBeNull();
  });

  it("extractSelectionRow carries a body's description when present", () => {
    const row = extractSelectionRow({ type: 'body', id: MESH_BODY_FIXTURE_ID }, deps, SIM_DAYS);
    expect(row !== null && row.type === 'body' && row.description).toBe(
      MESH_BODY_FIXTURE_DESCRIPTION,
    );
  });

  it('extractSelectionRow omits description when absent', () => {
    // Earth carries no `description` on its seed — same absent-field shape as
    // the standoffRadii guard above, exercising the same `in` idiom.
    const row = extractSelectionRow({ type: 'body', id: 'earth' }, deps, SIM_DAYS);
    expect(row !== null && row.type === 'body' && row.description).toBeUndefined();
  });

  it('star ref resolves against the loaded catalog (matches resolveStarRecord)', async () => {
    const catalog = await makeStarCatalog();
    const starDeps: ResolveDeps = { ...deps, stars: { current: () => catalog } };
    const record = resolveStarRecord(catalog, 1)!;
    expect(extractSelectionRow({ type: 'star', index: 1 }, starDeps, SIM_DAYS)).toEqual({
      type: 'star',
      index: 1,
      positionMpc: record.positionMpc,
      absMag: record.absMag,
      bpRp: record.bpRp,
      radiusM: SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M,
    });
  });

  it('star snapshots the nominal solar radius', async () => {
    // The bin quantises position + photometry only, so the extractor stamps the
    // one representative radius (the Sun's) onto every star row — the size
    // downstream framing/gating read for a field star that carries no measured one.
    const catalog = await makeStarCatalog();
    const starDeps: ResolveDeps = { ...deps, stars: { current: () => catalog } };
    const row = extractSelectionRow({ type: 'star', index: 0 }, starDeps, SIM_DAYS);
    expect(row !== null && row.type === 'star' && row.radiusM).toBe(
      SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M,
    );
  });

  it('star ref with no loaded catalog → null (cloud not loaded yet)', () => {
    // The shared deps' stars.current() returns null — a deep link / mid-load
    // race, not a garbage id, so the reconciler retries.
    expect(extractSelectionRow({ type: 'star', index: 0 }, deps, SIM_DAYS)).toBeNull();
  });
});
