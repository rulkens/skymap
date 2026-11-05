/**
 * Golden capture of every kind's arrival framing and selection halo, recorded from the per-kind
 * `focusFraming` / `selectionHalo` before the generic replacements (selection-kind-facts spec §6).
 * Rows come from each Layer's own extraction at fixed positions or a fixed instant, so a wrong
 * derived constant or a wrong `radiusMpc` fails here. Literals were printed from the old functions, not computed.
 */

import { describe, expect, it } from 'vitest';
import { focusFraming } from '../../../../../src/services/engine/camera/framing/focusFraming';
import { selectionHalo } from '../../../../../src/services/engine/helpers/selectionHaloTable';
import { galaxyCatalogSelectionRow } from '../../../../../src/layers/galaxyCatalog/selection/present/galaxyCatalogSelectionRow';
import { structureSelectionRow } from '../../../../../src/layers/structure/picking/present/structureSelectionRow';
import { milkyWaySelectionRow } from '../../../../../src/layers/milkyWay/card/present/milkyWaySelectionRow';
import { starCatalogSelectionRow } from '../../../../../src/layers/starCatalog/selection/present/starCatalogSelectionRow';
import { blackHoleSelectionRow } from '../../../../../src/layers/blackHoles/markers/present/blackHoleSelectionRow';
import { satellitesSelectionRow } from '../../../../../src/layers/satellites/focus/present/satellitesSelectionRow';
import { buildSatelliteCatalog } from '../../../../../tools/satellites/buildSatelliteCatalog';
import { bodyRowAt } from '../../../../../src/utils/scene/bodyRowAt';
import { unixMsToJulianDays } from '../../../../../src/utils/time/unixMsToJulianDays';
import { Source } from '../../../../../src/data/source';
import { NEAR0, COSMO } from '../../../../../src/services/engine/frame/slabs';
import { makeGalaxyCatalog } from '../../../../fixtures/makeGalaxyCatalog';
import { ISS, GOES_18 } from '../../../../layers/satellites/fixtures/celestrakRecords';
import {
  blackHolePickCode,
  galaxyRowRuntime,
  milkyWayPickCode,
  starRowRuntime,
  structureRowRuntime,
} from '../../../../support/layerPickCodes';
import type { SelectionRow } from '../../../../../src/@types/engine/SelectionRow';
import type { StructureInfo } from '../../../../../src/@types/data/structure/StructureInfo';
import type { SatellitesRuntime } from '../../../../../src/layers/satellites/@types/SatellitesRuntime';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const AT = unixMsToJulianDays(Date.parse('2026-10-28T12:00:00Z'));
const DEG = Math.PI / 180;

const galaxies = galaxyCatalogSelectionRow(
  galaxyRowRuntime({
    catalogs: new Map([
      [
        Source.SDSS,
        makeGalaxyCatalog(2, {
          positions: Float32Array.from([10, 20, 30, -4, 5.5, 6]),
          diameterKpc: Float32Array.from([25, NaN]),
        }),
      ],
    ]),
    famousMeta: [],
  }),
);

const structure = (id: string, over: Partial<StructureInfo>): StructureInfo =>
  ({
    type: 'structure',
    id,
    name: id,
    category: 'galaxy-cluster',
    worldPos: [40, -50, 60],
    featured: true,
    physicalRadiusMpc: 2,
    ...over,
  }) as StructureInfo;
const STRUCTURES = new Map(
  [
    structure('galaxy-cluster-apparent', { apparentRadiusMpc: 5 }),
    structure('galaxy-cluster-infinite', { apparentRadiusMpc: Number.POSITIVE_INFINITY }),
    structure('galaxy-cluster-degenerate', { physicalRadiusMpc: 0 }),
  ].map((record) => [record.id, record]),
);
const structures = structureSelectionRow(
  structureRowRuntime({ byId: (id) => STRUCTURES.get(id) ?? null, byCategory: () => [] }),
);

const { catalog: satelliteCatalog } = buildSatelliteCatalog(
  [{ group: { group: 'active', class: 'active' }, records: [GOES_18, ISS] }],
  0,
);
const satellites = satellitesSelectionRow({
  propagator: { catalog: () => satelliteCatalog },
  pickCode: 37,
} as unknown as SatellitesRuntime);

const BODY_POS: Vec3 = [3e-12, -4e-12, 1e-12];

/** One row per kind (and per framing branch), each from its Layer's own extraction. */
const ROWS: Readonly<Record<string, () => SelectionRow | null>> = {
  'galaxy, 25 kpc': () =>
    galaxies.extractRow({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }, AT),
  'galaxy, no diameter': () =>
    galaxies.extractRow({ type: 'galaxyCatalog', source: Source.SDSS, index: 1 }, AT),
  'structure, apparent radius': () =>
    structures.extractRow({ type: 'structure', id: 'galaxy-cluster-apparent' }, AT),
  'structure, infinite radius': () =>
    structures.extractRow({ type: 'structure', id: 'galaxy-cluster-infinite' }, AT),
  'structure, zero radius': () =>
    structures.extractRow({ type: 'structure', id: 'galaxy-cluster-degenerate' }, AT),
  'Milky Way': () => milkyWaySelectionRow(milkyWayPickCode()).extractRow({ type: 'milkyWay' }, AT),
  Earth: () => bodyRowAt('earth', BODY_POS),
  // The craft and Earth-scene rows are a body row under their own tag, as their Layers build them.
  'Voyager 1': () => ({ ...bodyRowAt('voyager1', BODY_POS), type: 'craft' }),
  Søndermarken: () => ({ ...bodyRowAt('soendermarken', BODY_POS), type: 'earthScene' }),
  'Alpha Centauri': () =>
    starCatalogSelectionRow(starRowRuntime({} as never)).extractRow(
      { type: 'starCatalog', source: Source.FamousStar, index: 1 },
      AT,
    ),
  'Sgr A*': () =>
    blackHoleSelectionRow(blackHolePickCode()).extractRow(
      { type: 'blackHole', id: 'sgr-a-star' },
      AT,
    ),
  ISS: () => satellites.extractRow({ type: 'satellite', noradId: 25544 }, AT),
};

/** Today's outputs, printed once from `focusFraming` and `selectionHalo`. */
const GOLDEN: Readonly<
  Record<
    string,
    {
      readonly at60: ReturnType<typeof focusFraming>;
      readonly at30: ReturnType<typeof focusFraming>;
      readonly halo: ReturnType<typeof selectionHalo>;
    }
  >
> = {
  'galaxy, 25 kpc': {
    at60: { target: [10, 20, 30], distance: 0.2, radius: 0.0125 },
    at30: { target: [10, 20, 30], distance: 0.2, radius: 0.0125 },
    halo: { radiusMpc: 0.05, worldPos: [10, 20, 30], slab: COSMO },
  },
  'galaxy, no diameter': {
    at60: { target: [-4, 5.5, 6], distance: 0.24, radius: 0.015 },
    at30: { target: [-4, 5.5, 6], distance: 0.24, radius: 0.015 },
    halo: { radiusMpc: 0.06, worldPos: [-4, 5.5, 6], slab: COSMO },
  },
  'structure, apparent radius': {
    at60: { target: [40, -50, 60], distance: 3.936479108111085, radius: 0 },
    at30: { target: [40, -50, 60], distance: 8.48193365356563, radius: 0 },
    halo: null,
  },
  'structure, infinite radius': {
    at60: { target: [40, -50, 60], distance: 800, radius: 0 },
    at30: { target: [40, -50, 60], distance: 800, radius: 0 },
    halo: null,
  },
  'structure, zero radius': {
    at60: { target: [40, -50, 60], distance: 0.1, radius: 0 },
    at30: { target: [40, -50, 60], distance: 0.1, radius: 0 },
    halo: null,
  },
  'Milky Way': {
    at60: {
      target: [-0.0004469860712306233, -0.007138118108456056, -0.0039657480154262886],
      distance: 0.15,
      radius: 0,
    },
    at30: {
      target: [-0.0004469860712306233, -0.007138118108456056, -0.0039657480154262886],
      distance: 0.15,
      radius: 0,
    },
    halo: {
      radiusMpc: 0.0175,
      worldPos: [-0.0004469860712306233, -0.007138118108456056, -0.0039657480154262886],
      slab: COSMO,
    },
  },
  Earth: {
    at60: {
      target: [3e-12, -4e-12, 1e-12],
      distance: 8.952833146680144e-16,
      radius: 2.067568250898234e-16,
    },
    at30: {
      target: [3e-12, -4e-12, 1e-12],
      distance: 1.9290674401171313e-15,
      radius: 2.067568250898234e-16,
    },
    halo: { radiusMpc: 2.067568250898234e-16, worldPos: [3e-12, -4e-12, 1e-12], slab: NEAR0 },
  },
  'Voyager 1': {
    at60: {
      target: [3e-12, -4e-12, 1e-12],
      distance: 2.041077277770001e-21,
      radius: 4.713666063029354e-22,
    },
    at30: {
      target: [3e-12, -4e-12, 1e-12],
      distance: 4.397910309284678e-21,
      radius: 4.713666063029354e-22,
    },
    halo: { radiusMpc: 4.713666063029354e-22, worldPos: [3e-12, -4e-12, 1e-12], slab: NEAR0 },
  },
  Søndermarken: {
    at60: {
      target: [3e-12, -4e-12, 1e-12],
      distance: 2.2813664760240654e-20,
      radius: 5.268590196210728e-21,
    },
    at30: {
      target: [3e-12, -4e-12, 1e-12],
      distance: 4.9156615741294296e-20,
      radius: 5.268590196210728e-21,
    },
    halo: { radiusMpc: 5.268590196210728e-21, worldPos: [3e-12, -4e-12, 1e-12], slab: NEAR0 },
  },
  'Alpha Centauri': {
    at60: {
      target: [-5.006001220857776e-7, -4.1859784742606946e-7, -1.169228959570351e-6],
      distance: 1.1921509923978274e-13,
      radius: 2.7531547855022603e-14,
    },
    at30: {
      target: [-5.006001220857776e-7, -4.1859784742606946e-7, -1.169228959570351e-6],
      distance: 2.5687283851489575e-13,
      radius: 2.7531547855022603e-14,
    },
    halo: {
      radiusMpc: 2.7531547855022603e-14,
      worldPos: [-5.006001220857776e-7, -4.1859784742606946e-7, -1.169228959570351e-6],
      slab: NEAR0,
    },
  },
  'Sgr A*': {
    at60: {
      target: [-0.0004469860712306233, -0.007138118108456056, -0.0039657480154262886],
      distance: 1.250547005050495e-11,
      radius: 4.1136414639818914e-13,
    },
    at30: {
      target: [-0.0004469860712306233, -0.007138118108456056, -0.0039657480154262886],
      distance: 1.250547005050495e-11,
      radius: 4.1136414639818914e-13,
    },
    halo: {
      radiusMpc: 4.1136414639818914e-13,
      worldPos: [-0.0004469860712306233, -0.007138118108456056, -0.0039657480154262886],
      slab: NEAR0,
    },
  },
  ISS: {
    at60: {
      target: [3.959622253338562e-12, 2.5166252367332133e-12, 1.0908589143290826e-12],
      distance: 7.016492981793255e-18,
      radius: 1.6203896447221824e-18,
    },
    at30: {
      target: [3.959622253338562e-12, 2.5166252367332133e-12, 1.0908589143290826e-12],
      distance: 1.5118441205404168e-17,
      radius: 1.6203896447221824e-18,
    },
    halo: {
      radiusMpc: 1.6203896447221824e-18,
      worldPos: [3.959622253338562e-12, 2.5166252367332133e-12, 1.0908589143290826e-12],
      slab: NEAR0,
    },
  },
};

/** Equal to 1e-9 relative; exact for zero and infinities. */
function expectNear(actual: number, expected: number): void {
  if (expected === 0 || !Number.isFinite(expected)) expect(actual).toBe(expected);
  else expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * 1e-9);
}

function expectVecNear(actual: Vec3, expected: Vec3): void {
  for (const i of [0, 1, 2] as const) expectNear(actual[i], expected[i]);
}

describe('arrival framing and halo, per kind (golden)', () => {
  it('covers every fixture row', () => {
    expect(Object.keys(GOLDEN)).toEqual(Object.keys(ROWS));
  });

  describe.each(Object.keys(ROWS))('%s', (name) => {
    const row = ROWS[name]!()!;
    const golden = GOLDEN[name]!;

    it.each([
      [60, golden.at60],
      [30, golden.at30],
    ] as const)('frames at %i degrees as recorded', (fovDeg, expected) => {
      const framing = focusFraming(row, fovDeg * DEG);
      expectVecNear(framing.target, expected.target);
      expectNear(framing.distance, expected.distance);
      expectNear(framing.radius, expected.radius);
    });

    it('rings as recorded', () => {
      const halo = selectionHalo(row);
      if (golden.halo === null) {
        expect(halo).toBeNull();
        return;
      }
      expect(halo!.slab).toBe(golden.halo.slab);
      expectNear(halo!.radiusMpc, golden.halo.radiusMpc);
      expectVecNear(halo!.worldPos, golden.halo.worldPos);
    });
  });
});
