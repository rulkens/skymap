import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchRequestSelectSaga } from '../../../src/state/selection/watchRequestSelectSaga';
import { requestSelect } from '../../../src/state/selection/requestSelect';
import { engineSourceCountReported } from '../../../src/state/engine/engineSlice';
import { selectionRoute } from '../../../src/store/constants';
import { Source } from '../../../src/data/sources';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import { selectionResolverOver } from '../../support/selectionResolverOver';
import type { GalaxyRowFixture } from '../../support/selectionResolverOver';
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

describe('watchRequestSelectSaga', () => {
  let store: ReturnType<typeof build>;
  // Mutable: the SDSS cloud is absent at first (deep link before load), then arrives.
  let cloudPresent = false;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    // The galaxyCatalog Layer's slice of the composed resolver, read LIVE so
    // the deferral cases can land the cloud mid-test.
    const galaxies = {
      get catalogs() {
        return cloudPresent ? new Map([[Source.SDSS, makeCloud(1237668393006604288n)]]) : new Map();
      },
      famousMeta: [],
    } as unknown as GalaxyRowFixture;
    const deps: ResolveDeps = {
      structures: { byId: () => null, byCategory: () => [] },
      stars: { current: () => null },
    };
    mw.run(watchRequestSelectSaga);
    mw.setContext({ resolveDeps: () => deps, selection: selectionResolverOver(deps, galaxies) });
    return s;
  }
  beforeEach(() => {
    cloudPresent = true;
    store = build();
  });

  it('resolves a structure id immediately and pins the select slot', async () => {
    store.dispatch(requestSelect('cluster-virgo'));
    await flush();
    expect(store.getState()[selectionRoute].select).toEqual({
      type: 'structure',
      id: 'cluster-virgo',
    });
  });

  it('defers an unresolvable galaxy id, then resolves on the catalog-landed count pulse', async () => {
    cloudPresent = false;
    store.dispatch(requestSelect('sdss-1237668393006604288'));
    await flush();
    expect(store.getState()[selectionRoute].select).toBeNull();

    cloudPresent = true;
    store.dispatch(engineSourceCountReported({ source: Source.SDSS, count: 1 }));
    await flush();
    expect(store.getState()[selectionRoute].select).toEqual({
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 0,
    });
  });

  // Every catalog commits through engineSourceCountReported, star bin and
  // galaxy cloud alike, so the shared deferral loop resolves a deep link on a
  // count report.
  it('defers an unresolvable galaxy id, then resolves on engineSourceCountReported', async () => {
    cloudPresent = false;
    store.dispatch(requestSelect('sdss-1237668393006604288'));
    await flush();
    expect(store.getState()[selectionRoute].select).toBeNull();

    cloudPresent = true;
    store.dispatch(engineSourceCountReported({ source: Source.SDSS, count: 1 }));
    await flush();
    expect(store.getState()[selectionRoute].select).toEqual({
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 0,
    });
  });
});
