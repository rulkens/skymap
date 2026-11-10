/**
 * Golden capture of every kind's arrival framing and selection halo, recorded from the per-kind
 * `focusFraming` / `selectionHalo` before the generic `arrivalFraming` / `selectionHaloOf`
 * replaced them (selection-kind-facts spec §6). Galaxy and structure rows come from their Layer's
 * extraction over literal inputs, so a wrong `radiusMpc` rule fails here; every other row is a
 * literal placement, so an ephemeris or catalog change never moves the golden. Literals were
 * printed from the old functions, not computed, except the three 30° rows the FOV ruling moved.
 */

import { describe, expect, it } from 'vitest';
import { arrivalFor } from '../../../../../src/services/engine/camera/framing/arrivalFor';
import { selectionHaloOf } from '../../../../../src/services/engine/helpers/selectionHaloOf';
import { galaxyCatalogSelectionRow } from '../../../../../src/layers/galaxyCatalog/selection/galaxyCatalogSelectionRow';
import { structureSelectionRow } from '../../../../../src/layers/structure/selection/structureSelectionRow';
import { NEAR0, COSMO } from '../../../../../src/services/engine/frame/slabs';
import { makeGalaxyCatalog } from '../../../../fixtures/makeGalaxyCatalog';
import { galaxyRowRuntime, structureRowRuntime } from '../../../../support/layerPickCodes';
import type { FocusFraming } from '../../../../../src/@types/camera/pose/FocusFraming';
import type { SelectionHalo } from '../../../../../src/@types/engine/selection/SelectionHalo';
import type { PlacedRow } from '../../../../../src/@types/engine/selection/PlacedRow';
import type { StructureInfo } from '../../../../../src/@types/data/structure/StructureInfo';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { installAppSelectionKinds } from '../../../../support/installAppSelectionKinds';

installAppSelectionKinds();

const DEG = Math.PI / 180;

const galaxies = galaxyCatalogSelectionRow(
  galaxyRowRuntime({
    catalogs: new Map([
      [
        'sdss',
        makeGalaxyCatalog(2, {
          positions: Float32Array.from([10, 20, 30, -4, 5.5, 6]),
          diameterKpc: Float32Array.from([25, NaN]),
        }),
      ],
    ]),
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

const placed = (type: string, positionMpc: Vec3, radiusMpc: number) => (): PlacedRow => ({
  type,
  positionMpc,
  radiusMpc,
});
const extracted = (row: unknown) => (): PlacedRow => row as PlacedRow;

const GALACTIC_CENTRE: Vec3 = [
  -0.0004469860712306233, -0.007138118108456056, -0.0039657480154262886,
];
const BODY_POS: Vec3 = [3e-12, -4e-12, 1e-12];

/** One row per kind (and per framing branch). */
const ROWS: Readonly<Record<string, () => PlacedRow>> = {
  'galaxy, 25 kpc': extracted(
    galaxies.extractRow({ type: 'galaxyCatalog', source: 'sdss', index: 0 }, 0),
  ),
  'galaxy, no diameter': extracted(
    galaxies.extractRow({ type: 'galaxyCatalog', source: 'sdss', index: 1 }, 0),
  ),
  'structure, apparent radius': extracted(
    structures.extractRow({ type: 'structure', id: 'galaxy-cluster-apparent' }, 0),
  ),
  'structure, infinite radius': extracted(
    structures.extractRow({ type: 'structure', id: 'galaxy-cluster-infinite' }, 0),
  ),
  'structure, zero radius': extracted(
    structures.extractRow({ type: 'structure', id: 'galaxy-cluster-degenerate' }, 0),
  ),
  'Milky Way': placed('milkyWay', GALACTIC_CENTRE, 0.0175),
  // Craft, Earth scenes, stars and satellites share Earth's BODY_FOCUS; their radii are pinned
  // by each Layer's extractRow test.
  Earth: placed('body', BODY_POS, 2.067568250898234e-16),
  'Sgr A*': placed('blackHole', GALACTIC_CENTRE, 4.1136414639818914e-13),
};

/** Today's outputs, printed once from `focusFraming` and `selectionHalo`. */
const GOLDEN: Readonly<
  Record<
    string,
    {
      readonly at60: FocusFraming;
      readonly at30: FocusFraming;
      readonly halo: SelectionHalo | null;
    }
  >
> = {
  'galaxy, 25 kpc': {
    at60: { target: [10, 20, 30], distance: 0.2, radius: 0.0125 },
    // Ruled: arrival size is FOV-independent, so the 60° distance scales by tan 30° / tan 15°.
    at30: { target: [10, 20, 30], distance: 0.43094010767585034, radius: 0.0125 },
    halo: { radiusMpc: 0.05, worldPos: [10, 20, 30], slab: COSMO },
  },
  'galaxy, no diameter': {
    at60: { target: [-4, 5.5, 6], distance: 0.24, radius: 0.015 },
    // Ruled: arrival size is FOV-independent, so the 60° distance scales by tan 30° / tan 15°.
    at30: { target: [-4, 5.5, 6], distance: 0.5171281292110204, radius: 0.015 },
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
    at60: { target: GALACTIC_CENTRE, distance: 0.15, radius: 0 },
    // Ruled: arrival size is FOV-independent, so the 60° distance scales by tan 30° / tan 15°.
    at30: { target: GALACTIC_CENTRE, distance: 0.3232050807568877, radius: 0 },
    halo: { radiusMpc: 0.0175, worldPos: GALACTIC_CENTRE, slab: COSMO },
  },
  Earth: {
    at60: { target: BODY_POS, distance: 8.952833146680144e-16, radius: 2.067568250898234e-16 },
    at30: { target: BODY_POS, distance: 1.9290674401171313e-15, radius: 2.067568250898234e-16 },
    halo: { radiusMpc: 2.067568250898234e-16, worldPos: BODY_POS, slab: NEAR0 },
  },
  'Sgr A*': {
    at60: {
      target: GALACTIC_CENTRE,
      distance: 1.250547005050495e-11,
      radius: 4.1136414639818914e-13,
    },
    // Ruled: arrival size is FOV-independent, so the 60° distance scales by tan 30° / tan 15°.
    at30: {
      target: GALACTIC_CENTRE,
      distance: 2.694554305050862e-11,
      radius: 4.1136414639818914e-13,
    },
    halo: { radiusMpc: 4.1136414639818914e-13, worldPos: GALACTIC_CENTRE, slab: NEAR0 },
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
    const row = ROWS[name]!();
    const golden = GOLDEN[name]!;

    it.each([
      [60, golden.at60],
      [30, golden.at30],
    ] as const)('frames at %i degrees as recorded', (fovDeg, expected) => {
      const framing = arrivalFor(row, fovDeg * DEG);
      expectVecNear(framing.target, expected.target);
      expectNear(framing.distance, expected.distance);
      expectNear(framing.radius, expected.radius);
    });

    it('rings as recorded', () => {
      const halo = selectionHaloOf(row);
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
