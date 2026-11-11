import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchRequestViewSaga } from '../../../src/state/selection/watchRequestViewSaga';
import { watchRequestFocusSaga } from '../../../src/state/selection/watchRequestFocusSaga';
import { watchRequestSelectSaga } from '../../../src/state/selection/watchRequestSelectSaga';
import { updateSelectionFocus } from '../../../src/state/selection/selectionSlice';
import { actionsForPaletteAction } from '../../../src/utils/palette/actionsForPaletteAction';
import { selectionRoute } from '../../../src/store/constants';
import { selectionResolverOver } from '../../support/selectionResolverOver';
import type { GalaxyRowFixture, StructureRowFixture } from '../../support/selectionResolverOver';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('watchRequestViewSaga', () => {
  it('a palette pick still selects and flies', async () => {
    const seen: UnknownAction[] = [];
    const record: Middleware = () => (next) => (action) => {
      seen.push(action as UnknownAction);
      return next(action);
    };
    const mw = createSagaMiddleware();
    const store = configureStore({
      reducer: rootReducer,
      middleware: (g) => g().concat(record, mw),
    });
    const galaxies = { catalogs: new Map() } as unknown as GalaxyRowFixture;
    const structures: StructureRowFixture = { byId: () => null, byCategory: () => [] };
    mw.setContext({ selection: selectionResolverOver(structures, galaxies) });
    for (const saga of [watchRequestViewSaga, watchRequestFocusSaga, watchRequestSelectSaga]) {
      mw.run(saga);
    }

    for (const action of actionsForPaletteAction({ kind: 'focus', focusId: 'body-mars' })) {
      store.dispatch(action);
    }
    await flush();

    const selection = store.getState()[selectionRoute];
    expect(selection.select).toEqual({ type: 'body', id: 'mars' });
    expect(selection.focus).toEqual({ type: 'body', id: 'mars' });
    const focusWrite = seen.find(updateSelectionFocus.match);
    expect(focusWrite?.meta).toEqual({ transition: 'fly' });
  });
});
