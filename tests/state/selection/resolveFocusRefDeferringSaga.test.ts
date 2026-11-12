import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { resolveFocusRefDeferringSaga } from '../../../src/state/selection/resolveFocusRefDeferringSaga';
import { engineStatusChanged } from '../../../src/state/engine/engineSlice';
import type { SelectionRefBase } from '../../../src/@types/engine/selection/SelectionRefBase';
import type { FocusResolution } from '../../../src/@types/engine/selection/FocusResolution';

const flush = () => new Promise((r) => setTimeout(r, 0));

const MILKY_WAY = { type: 'milkyWay' };

function run(resolveFocusId: () => FocusResolution) {
  const mw = createSagaMiddleware();
  const store = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
  mw.setContext({ selection: { resolveFocusId } });
  const outcome: { result?: SelectionRefBase | null } = {};
  mw.run(function* () {
    outcome.result = yield* resolveFocusRefDeferringSaga('milkyWay');
  });
  return { store, outcome };
}

describe('resolveFocusRefDeferringSaga', () => {
  it('keeps waiting while pending', async () => {
    let resolution: FocusResolution = { kind: 'pending' };
    const { store, outcome } = run(() => resolution);
    await flush();
    expect(outcome).not.toHaveProperty('result');

    // A non-count pulse retries too: `wireSlots` fires this with no catalog landed.
    store.dispatch(engineStatusChanged({ kind: 'loading' }));
    await flush();
    expect(outcome).not.toHaveProperty('result');

    resolution = { kind: 'hit', ref: MILKY_WAY };
    store.dispatch(engineStatusChanged({ kind: 'loading' }));
    await flush();
    expect(outcome.result).toEqual(MILKY_WAY);
  });

  it('returns null on absent without waiting', async () => {
    const { outcome } = run(() => ({ kind: 'absent' }));
    await flush();
    expect(outcome.result).toBeNull();
  });
});
