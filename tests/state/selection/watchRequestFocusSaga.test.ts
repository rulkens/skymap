import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchRequestFocusSaga } from '../../../src/state/selection/watchRequestFocusSaga';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { catalogLoaded } from '../../../src/state/catalog/catalogLoaded';
import { selectionRoute } from '../../../src/store/constants';
import { Source } from '../../../src/data/sources';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

const flush = () => new Promise((r) => setTimeout(r, 0));

// One-row SDSS cloud whose objID matches the sdss-<id> deep link below.
// objIDs is BigUint64Array (unsigned) — NOT BigInt64Array.
function makeCloud(objId: bigint): GalaxyCatalog {
  return makeGalaxyCatalog(1, {
    positions: new Float32Array([1, 0, 0]),
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

describe('watchRequestFocusSaga', () => {
  let store: ReturnType<typeof build>;
  // Mutable: the SDSS cloud is absent at first (deep link before load), then arrives.
  let cloudPresent = false;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    const deps: ResolveDeps = {
      catalogs: {
        get: (src) =>
          cloudPresent && src === Source.SDSS ? makeCloud(1237668393006604288n) : undefined,
      },
      famousGalaxiesMeta: [],
      structures: { byId: () => null },
      stars: { current: () => null },
    };
    mw.run(watchRequestFocusSaga);
    mw.setContext({ resolveDeps: () => deps });
    return s;
  }
  beforeEach(() => {
    cloudPresent = true;
    store = build();
  });

  it('resolves a structure id immediately (prefix-only, no cloud needed)', async () => {
    store.dispatch(requestFocus('cluster-virgo'));
    await flush();
    expect(store.getState()[selectionRoute].focus).toEqual({
      type: 'structure',
      id: 'cluster-virgo',
    });
  });

  it('defers an unresolvable galaxy id, then resolves on catalogLoaded', async () => {
    cloudPresent = false;
    store.dispatch(requestFocus('sdss-1237668393006604288'));
    await flush();
    expect(store.getState()[selectionRoute].focus).toBeNull();

    cloudPresent = true;
    store.dispatch(catalogLoaded({ source: Source.SDSS }));
    await flush();
    expect(store.getState()[selectionRoute].focus).toEqual({
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 0,
    });
  });
});
