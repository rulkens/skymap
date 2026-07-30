/**
 * stateAfter — fold a sequence of actions over the REAL `rootReducer`, starting
 * from its boot state, and return the `RootState` reached.
 *
 * The alternative — hand-assembling a partial `RootState` object literal — goes
 * stale the moment any touched slice gains a field, and silently produces a
 * state no real store could ever be in (reducers enforce invariants across
 * their own actions that a literal can skip). Folding real actions through the
 * real reducer is the only way to build a state a test can trust: every slice
 * the actions touch ends up exactly as the app would leave it, and slices the
 * actions never touch stay at their real boot defaults.
 */

import type { Action } from '@reduxjs/toolkit';

import { rootReducer } from '../../src/store/rootReducer';

import type { RootState } from '../../src/store/types';

export function stateAfter(...actions: readonly Action[]): RootState {
  return actions.reduce<RootState>(
    (state, action) => rootReducer(state, action),
    rootReducer(undefined, { type: '@@test/init' }),
  );
}
