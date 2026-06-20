/**
 * watchSelectionRows — integration tests over a real store + saga middleware.
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
import { watchSelectionRows } from '../../../src/state/selectionRows/selectionRowsSaga';
import {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
  clearSelection,
} from '../../../src/state/selection/selectionSlice';
import { catalogLoaded } from '../../../src/state/catalog/catalogLoaded';
import { selectionRowsRoute } from '../../../src/store/constants';
import { Source } from '../../../src/data/sources';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

const flush = () => new Promise((r) => setTimeout(r, 0));

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
    // CORRECTION: GalaxyCatalog.objIDs is BigUint64Array (unsigned), not BigInt64Array.
    objIDs: new BigUint64Array([1237668n]),
    diameterKpc: new Float32Array([42]),
    axisRatio: new Float32Array([0.7]),
    positionAngleDeg: new Float32Array([35]),
    classByte: new Uint8Array([0]),
    parentSurveyByte: new Uint8Array([0]),
  } as unknown as GalaxyCatalog;
}

describe('watchSelectionRows', () => {
  let store: ReturnType<typeof build>;
  // Mutable: the cloud is absent at first (deep-link), then arrives.
  let cloudPresent = false;

  function build() {
    const sagaMiddleware = createSagaMiddleware();
    const s = configureStore({
      reducer: rootReducer,
      middleware: (g) => g().concat(sagaMiddleware),
    });
    const deps: ResolveDeps = {
      catalogs: { get: (src) => (cloudPresent && src === Source.SDSS ? makeCloud() : undefined) },
      famousMeta: [],
      structures: { byId: () => null },
    };
    sagaMiddleware.run(watchSelectionRows);
    sagaMiddleware.setContext({ resolveDeps: () => deps });
    return s;
  }

  beforeEach(() => {
    cloudPresent = true;
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
});
