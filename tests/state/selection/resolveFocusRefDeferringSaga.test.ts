import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { resolveFocusRefDeferringSaga } from '../../../src/state/selection/resolveFocusRefDeferringSaga';
import { engineStatusChanged } from '../../../src/state/engine/engineSlice';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('resolveFocusRefDeferringSaga', () => {
  it('resolves once the Layer rows land, without waiting for a catalog', async () => {
    // A Layer-only id (milkyWay) is unresolvable until createLayers appends its
    // row — this flag stands in for that, flipped once "createLayers" has run.
    let layerRowsLanded = false;
    let result: SelectionRef | null | undefined;

    const mw = createSagaMiddleware();
    const store = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.setContext({
      selection: {
        resolveFocusId: () => (layerRowsLanded ? { type: 'milkyWay' } : null),
      },
    });
    mw.run(function* () {
      result = yield* resolveFocusRefDeferringSaga('milkyWay');
    });

    await flush();
    expect(result).toBeUndefined();

    layerRowsLanded = true;
    // wireSlots dispatches this synchronously right after createLayers, with no
    // catalog having landed yet — the regression this test pins.
    store.dispatch(engineStatusChanged({ kind: 'loading' }));
    await flush();

    expect(result).toEqual({ type: 'milkyWay' });
  });
});
