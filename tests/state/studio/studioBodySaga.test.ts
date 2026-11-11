/**
 * studioBodySaga through `watchTakeoverSaga`, the way `#studio=` starts it. The package entry is
 * mocked: these pin the body's contract (load the chunk, run its session for the clip, end on
 * `exitTakeover`), not the session itself, which `packages/studio` tests.
 */
import { describe, it, expect, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

const session = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock('../../../packages/studio/src/studioEntry', () => ({
  *studioSessionSaga(id: string) {
    session.ids.push(id);
    yield new Promise(() => {});
  },
}));

import { rootReducer } from '../../../src/store/rootReducer';
import { watchTakeoverSaga } from '../../../src/state/takeover/watchTakeoverSaga';
import { exitTakeover } from '../../../src/state/takeover/takeoverActions';
import { selectTakeoverSource } from '../../../src/state/takeover/selectors';
import { openStudio } from '../../../src/state/studio/studioActions';
import { hashBodyFor } from '../../../src/state/url/hashBodyFor';

const flush = () => new Promise((r) => setTimeout(r, 0));

function build() {
  const mw = createSagaMiddleware();
  const store = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
  mw.run(watchTakeoverSaga);
  return store;
}

describe('studioBodySaga', () => {
  it('studioBodySaga runs the package session saga for its clip', async () => {
    const store = build();

    store.dispatch(openStudio('cosmicFlows'));
    await flush();

    expect(session.ids).toEqual(['cosmicFlows']);
    expect(selectTakeoverSource(store.getState())).toEqual({ kind: 'studio', id: 'cosmicFlows' });
    expect(hashBodyFor(store.getState())).toContain('studio=cosmicFlows');
  });

  it('exitTakeover ends the studio and drops it from the hash', async () => {
    const store = build();
    store.dispatch(openStudio('flowOrbit'));
    await flush();

    store.dispatch(exitTakeover());
    await flush();

    expect(selectTakeoverSource(store.getState())).toBeNull();
    expect(hashBodyFor(store.getState())).not.toContain('studio=');
  });
});
