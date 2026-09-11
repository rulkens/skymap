/**
 * LiftedCaseReducers — one fragment's case reducers as `createSlice` sees them
 * once `liftClusterReducers` has re-based them from the cluster onto the root.
 *
 * The reducer KEYS survive verbatim, so RTK derives the same action type strings
 * it does today. Only the state parameter widens.
 */

import type { Draft } from '@reduxjs/toolkit';

import type { SettingsFragmentLike } from './SettingsFragmentLike';

type ActionOf<R> = R extends (cluster: never, action: infer A) => void ? A : never;

export type LiftedCaseReducers<Root, F extends SettingsFragmentLike> = {
  [K in keyof F['reducers']]: (state: Draft<Root>, action: ActionOf<F['reducers'][K]>) => void;
};
