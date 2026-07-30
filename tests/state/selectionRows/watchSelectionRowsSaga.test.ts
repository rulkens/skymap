/**
 * watchSelectionRowsSaga — integration tests over a real store + saga middleware.
 *
 * Two core scenarios:
 *   1. A ref change immediately re-extracts the matching slot (cloud present).
 *   2. A deep link where the cloud is absent on dispatch: the row stays null
 *      until a subsequent `catalogLoaded` signals the cloud arrived, at which
 *      point the saga fills the still-null slot.
 *
 * Like `tierSaga.test.ts`, these tests wire a real store with redux-saga and
 * flush a macrotask after each dispatch — `takeEvery` schedules its worker on
 * a macrotask so a bare microtask flush is not sufficient.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchSelectionRowsSaga } from '../../../src/state/selectionRows/watchSelectionRowsSaga';
import {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
  clearSelection,
} from '../../../src/state/selection/selectionSlice';
import { catalogLoaded } from '../../../src/state/catalog/catalogLoaded';
import { engineSourceCountReported } from '../../../src/state/engine/engineSlice';
import { selectionRowsRoute } from '../../../src/store/constants';
import { Source } from '../../../src/data/sources';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import {
  buildStarOctree,
  type OctreeLeafStar,
  type StarOctreeGrid,
} from '../../../tools/stars/buildStarOctree';
import {
  encodeStarCatalog,
  decodeStarCatalog,
} from '../../../src/data/starCatalog/starCatalogFormat';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { StarCatalog } from '../../../src/@types/data/starCatalog/StarCatalog';

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeCloud(): GalaxyCatalog {
  return makeGalaxyCatalog(1, {
    positions: new Float32Array([10, 20, 30]),
    spectroscopicZ: new Float32Array([0.0123]),
    magU: new Float32Array([18.1]),
    magG: new Float32Array([17.4]),
    magR: new Float32Array([16.9]),
    magI: new Float32Array([16.6]),
    magZ: new Float32Array([16.4]),
    // CORRECTION: GalaxyCatalog.objIDs is BigUint64Array (unsigned), not BigInt64Array.
    objIDs: new BigUint64Array([1237668n]),
    diameterKpc: new Float32Array([42]),
    axisRatio: new Float32Array([0.7]),
    positionAngleDeg: new Float32Array([35]),
  });
}

// A one-leaf star octree round-tripped through the real encode/decode path, so
// resolveStarRecord (which extractSelectionRow's star arm calls) resolves record
// index 0 to a real row. Two stars keep the leaf non-degenerate; index 0 lands
// in the dense leaf at grid origin, an exact reconstruction.
const STAR_GRID: StarOctreeGrid = { mortonBitsPerAxis: 9, cellEdgePc: 1.0, gridOrigin: [0, 0, 0] };
async function makeStarCatalog(): Promise<StarCatalog> {
  const stars: OctreeLeafStar[] = [
    { mortonIndex: 0, offset: [1, 2, 3], absMag: 5, bpRp: 0.3 },
    { mortonIndex: 0, offset: [4, 5, 6], absMag: 5, bpRp: 0.3 },
  ];
  return decodeStarCatalog(await encodeStarCatalog(buildStarOctree(stars, STAR_GRID)));
}

describe('watchSelectionRowsSaga', () => {
  let store: ReturnType<typeof build>;
  // Mutable: the cloud is absent at first (deep-link), then arrives.
  let cloudPresent = false;
  // Mutable star catalog: null until the star bin commits (deep-link race).
  let starCatalog: StarCatalog | null = null;

  function build() {
    const sagaMiddleware = createSagaMiddleware();
    const s = configureStore({
      reducer: rootReducer,
      middleware: (g) => g().concat(sagaMiddleware),
    });
    const deps: ResolveDeps = {
      catalogs: { get: (src) => (cloudPresent && src === Source.SDSS ? makeCloud() : undefined) },
      famousGalaxiesMeta: [],
      structures: { byId: () => null },
      stars: { current: () => starCatalog },
    };
    sagaMiddleware.run(watchSelectionRowsSaga);
    sagaMiddleware.setContext({ resolveDeps: () => deps });
    return s;
  }

  beforeEach(() => {
    cloudPresent = true;
    starCatalog = null;
    store = build();
  });

  it('a ref change re-extracts that slot into selectionRows', async () => {
    store.dispatch(updateSelectionSelect({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }));
    await flush();
    expect(store.getState()[selectionRowsRoute].select).toMatchObject({
      type: 'galaxyCatalog',
      objId: '1237668',
    });
  });

  it('clearSelection re-extracts select + focus rows to null, leaving hover untouched', async () => {
    // Regression: clearSelection (Esc / InfoCard ×) nulls the select+focus REFS,
    // but the reconciler must also null the derived ROWS — otherwise the InfoCard,
    // focus ring, and structure-focus subsystem (all read the rows) stay stuck and
    // Esc appears to do nothing.
    const ref = { type: 'galaxyCatalog', source: Source.SDSS, index: 0 } as const;
    store.dispatch(updateSelectionHover(ref));
    store.dispatch(updateSelectionSelect(ref));
    store.dispatch(updateSelectionFocus(ref));
    await flush();
    expect(store.getState()[selectionRowsRoute].select).not.toBeNull();
    expect(store.getState()[selectionRowsRoute].focus).not.toBeNull();

    store.dispatch(clearSelection());
    await flush();
    expect(store.getState()[selectionRowsRoute].select).toBeNull();
    expect(store.getState()[selectionRowsRoute].focus).toBeNull();
    // clearSelection leaves hover alone (it clears select + focus only).
    expect(store.getState()[selectionRowsRoute].hover).not.toBeNull();
  });

  it('a deep link defers: ref present but cloud absent → null row; catalogLoaded fills it', async () => {
    cloudPresent = false;
    store.dispatch(updateSelectionFocus({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }));
    await flush();
    expect(store.getState()[selectionRowsRoute].focus).toBeNull();

    cloudPresent = true;
    store.dispatch(catalogLoaded({ source: Source.SDSS }));
    await flush();
    expect(store.getState()[selectionRowsRoute].focus).toMatchObject({
      type: 'galaxyCatalog',
      objId: '1237668',
    });
  });

  it('a star deep link fills on engineSourceCountReported (the star bin never fires catalogLoaded)', async () => {
    // The Gaia star bin commits by dispatching engineSourceCountReported, NOT
    // catalogLoaded (that pulse is galaxy-cloud-only). A star deep link resolves
    // its ref at bootstrap, before the bin loads → null row. The gap-fill must
    // wake on the star bin's commit pulse too, or the star focus row stays null
    // forever (camera arrives via watchFocusTweenSaga, but no InfoCard/body).
    starCatalog = null;
    store.dispatch(updateSelectionFocus({ type: 'star', index: 0 }));
    await flush();
    expect(store.getState()[selectionRowsRoute].focus).toBeNull();

    starCatalog = await makeStarCatalog();
    store.dispatch(engineSourceCountReported({ source: Source.GaiaStars, count: 2 }));
    await flush();
    expect(store.getState()[selectionRowsRoute].focus).toMatchObject({
      type: 'star',
      index: 0,
    });
  });
});
