/**
 * Selection selectors — unit tests for the RootState-scoped selection-family
 * read seam.
 *
 * The test builds partial RootState-shaped objects (cast via
 * `as unknown as RootState`) rather than constructing real store fixtures for
 * every case: the selectors are thin lifts and the slice's own initialState
 * shape is asserted in the slice tests. The `createAppStore`-backed tests
 * exercise the memoized `selectXFocusable` selectors through a live store to
 * verify each kind's `toFocusable` round-trips correctly.
 *
 * The derived `selectHoveredFocusable` / `selectSelectedFocusable` selectors
 * each build a fresh card target from their slot's row — the memoization means the same row reference
 * returns the same target reference, which is the core invariant tested here.
 */

import { describe, it, expect } from 'vitest';

import { createAppStore } from '../../../src/store/createAppStore';
import {
  selectIsSelectionActive,
  selectHoveredFocusable,
  selectSelectedFocusable,
  selectFocusedFocusable,
  selectFocusId,
} from '../../../src/state/selection/selectors';
import {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
} from '../../../src/state/selection/selectionSlice';
import { setSelectionRow } from '../../../src/state/selectionRows/selectionRowsSlice';
import { selectionRoute, selectionRowsRoute } from '../../../src/store/constants';
import { makeGalaxyRow } from '../../fixtures/makeGalaxyRow';
import type { RootState } from '../../../src/store/types';
import type { GalaxyRow } from '../../../src/layers/galaxyCatalog/records/@types/GalaxyRow';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';
import { MILKY_WAY_ROW } from '../../fixtures/milkyWayRow';
import { placedStructureRow } from '../../../src/layers/structure/selection/utils/placedStructureRow';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { galaxyCatalogSelectionRow } from '../../../src/layers/galaxyCatalog/selection/galaxyCatalogSelectionRow';
import { starCatalogSelectionRow } from '../../../src/layers/starCatalog/selection/starCatalogSelectionRow';
import { bodySelectionRow } from '../../../src/layers/body/selection/bodySelectionRow';
import { craftSelectionRow } from '../../../src/layers/missions/selection/craftSelectionRow';
import { earthSceneSelectionRow } from '../../../src/layers/earthScenes/selection/earthSceneSelectionRow';
import { structureSelectionRow } from '../../../src/layers/structure/selection/structureSelectionRow';
import { milkyWaySelectionRow } from '../../../src/layers/milkyWay/selection/milkyWaySelectionRow';
import { blackHoleSelectionRow } from '../../../src/layers/blackHoles/selection/blackHoleSelectionRow';
import { satellitesSelectionRow } from '../../../src/layers/satellites/selection/satellitesSelectionRow';
import { zoneOfAvoidanceSelectionRow } from '../../../src/layers/zoneOfAvoidance/selection/zoneOfAvoidanceSelectionRow';
import { buildSatelliteCatalog } from '../../../tools/satellites/buildSatelliteCatalog';
import { ISS } from '../../layers/satellites/fixtures/celestrakRecords';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import {
  blackHolePickCode,
  bodyPickCodes,
  galaxyRowRuntime,
  milkyWayPickCode,
  missionsPickCode,
  satellitesPickCode,
  starRowRuntime,
  structureRowRuntime,
  zoneOfAvoidancePickCode,
} from '../../support/layerPickCodes';
import type { SelectionKindRow } from '../../../src/@types/engine/layer/SelectionKindRow';
import type { SatellitesRuntime } from '../../../src/layers/satellites/@types/SatellitesRuntime';
import { installAppSelectionKinds } from '../../support/installAppSelectionKinds';
import type { SelectionRefBase } from '../../../src/@types/engine/selection/SelectionRefBase';

installAppSelectionKinds();

// --- fixtures -----------------------------------------------------------------

const galaxyRef: SelectionRefBase = { type: 'galaxyCatalog', source: 'sdss', index: 7 };

const galaxyRow = makeGalaxyRow({
  index: 7,
  objId: '1237668347496587264',
  x: 100,
  y: 200,
  z: 300,
  redshift: 0.05,
  magU: 17.1,
  magG: 16.2,
  magR: 15.8,
  magI: 15.5,
  magZ: 15.3,
  diameterKpc: 18,
  axisRatio: 0.7,
  positionAngleDeg: 45,
  classByte: 3,
});

const virgoEntry = {
  type: 'structure',
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'galaxy-cluster',
  worldPos: [0.27, 0.22, 0.15],
  featured: true,
  physicalRadiusMpc: 1.7,
} as StructureInfo;
const structureInfo = placedStructureRow(virgoEntry);

// --- selectIsSelectionActive --------------------------------------------------

describe('selectIsSelectionActive', () => {
  it('returns false on a fresh store', () => {
    const { store } = createAppStore();
    expect(selectIsSelectionActive(store.getState())).toBe(false);
  });

  it('returns true after a select ref is set', () => {
    const { store } = createAppStore();
    store.dispatch(updateSelectionSelect({ type: 'milkyWay' }));
    expect(selectIsSelectionActive(store.getState())).toBe(true);
  });
});

describe('selectFocusId', () => {
  // The URL's `#focus=` row reads this; the per-slot ids must not leak another slot's id into it.
  it('selectFocusId reads ids.focus', () => {
    const { store } = createAppStore();
    store.dispatch(setSelectionRow({ slot: 'select', row: MILKY_WAY_ROW, id: 'milkyWay' }));
    expect(selectFocusId(store.getState())).toBeNull();
    store.dispatch(setSelectionRow({ slot: 'focus', row: galaxyRow, id: 'sdss-1' }));
    expect(selectFocusId(store.getState())).toBe('sdss-1');
  });
});

// --- derived card-target selectors via live store -------------------------

describe('selectHoveredFocusable', () => {
  it('returns null when hover row is null', () => {
    const { store } = createAppStore();
    expect(selectHoveredFocusable(store.getState())).toBeNull();
  });

  it('builds a GalaxyInfo from a galaxy row in the hover slot', () => {
    const { store } = createAppStore();
    store.dispatch(updateSelectionHover(galaxyRef));
    store.dispatch(setSelectionRow({ slot: 'hover', row: galaxyRow, id: null }));
    const target = selectHoveredFocusable(store.getState());
    expect(target).toMatchObject({ type: 'galaxyCatalog', source: 'sdss' });
  });

  it('returns the StructureInfo with its ref for a structure row', () => {
    const { store } = createAppStore();
    store.dispatch(setSelectionRow({ slot: 'hover', row: structureInfo, id: null }));
    expect(selectHoveredFocusable(store.getState())).toEqual({
      ...structureInfo,
      ref: { type: 'structure', id: 'virgo' },
    });
  });
});

describe('selectSelectedFocusable', () => {
  it('memoizes across an unrelated-slot write: changing hover does not recompute the select focusable', () => {
    const { store } = createAppStore();
    store.dispatch(setSelectionRow({ slot: 'select', row: MILKY_WAY_ROW, id: null }));
    const a = selectSelectedFocusable(store.getState());
    // A write to the hover slot changes the selectionRows state object but leaves
    // the select slot's row reference untouched — createSelector must return the
    // cached focusable, so identity is preserved. (A plain non-memoized selector
    // would rebuild a fresh object here and fail this assertion.)
    store.dispatch(setSelectionRow({ slot: 'hover', row: MILKY_WAY_ROW, id: null }));
    const b = selectSelectedFocusable(store.getState());
    expect(a).toBe(b);
  });
});

// --- one real row per kind ----------------------------------------------------

const { catalog: satellites } = buildSatelliteCatalog(
  [{ group: { group: 'active', class: 'active' }, records: [ISS] }],
  0,
);

/** Each kind's own row extractor and a ref it resolves. */
function kindCase<Ref extends SelectionRefBase>(row: SelectionKindRow<Ref>, ref: Ref) {
  return { row: row as unknown as SelectionKindRow, ref: ref as SelectionRefBase };
}

const KIND_CASES = [
  kindCase(
    galaxyCatalogSelectionRow(
      galaxyRowRuntime({
        catalogs: new Map([['sdss', makeGalaxyCatalog(16)]]),
      }),
    ),
    { type: 'galaxyCatalog', source: 'sdss', index: 12 },
  ),
  kindCase(
    starCatalogSelectionRow(starRowRuntime({ renderer: null as never, chunkStreams: new Map() })),
    { type: 'starCatalog', source: 'famousStar', index: 3 },
  ),
  kindCase(bodySelectionRow({ pickCodes: bodyPickCodes() }), {
    type: 'body',
    id: SCENE_PLANETS[1]!.id,
  }),
  kindCase(craftSelectionRow(missionsPickCode()), { type: 'craft', id: asSceneBodyId('hubble') }),
  kindCase(earthSceneSelectionRow(), {
    type: 'earthScene',
    id: asSceneBodyId('soendermarken'),
  }),
  kindCase(
    structureSelectionRow(
      structureRowRuntime({
        byId: (id) => (id === virgoEntry.id ? virgoEntry : null),
        byCategory: () => [virgoEntry],
      }),
    ),
    { type: 'structure', id: 'virgo' },
  ),
  kindCase(milkyWaySelectionRow(milkyWayPickCode()), { type: 'milkyWay' }),
  kindCase(blackHoleSelectionRow(blackHolePickCode()), { type: 'blackHole', id: 'sgr-a-star' }),
  kindCase(
    satellitesSelectionRow({
      propagator: { catalog: () => satellites },
      pickCode: satellitesPickCode(),
    } as unknown as SatellitesRuntime),
    { type: 'satellite', noradId: 25544 },
  ),
  kindCase(zoneOfAvoidanceSelectionRow(zoneOfAvoidancePickCode()), { type: 'zoneOfAvoidance' }),
];

describe('selectFocusedFocusable', () => {
  // The InfoCard's Focus pill dispatches `target.ref`; a kind stamping a wrong or partial ref
  // would focus something else, or nothing.
  it.each(KIND_CASES.map((c) => [c.ref.type, c] as const))(
    'the focused target of every kind carries its ref (%s)',
    (_type, { row, ref }) => {
      const { store } = createAppStore();
      const focusRow = row.extractRow(ref, 0);
      expect(focusRow).not.toBeNull();
      store.dispatch(setSelectionRow({ slot: 'focus', row: focusRow, id: null }));
      expect(selectFocusedFocusable(store.getState())?.ref).toEqual(ref);
    },
  );
});
