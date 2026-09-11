/** One fragment's case reducers, re-based from its cluster onto the settings root. */
// The reducer KEYS survive verbatim, so RTK derives the same action type strings as today.

import type { Draft } from '@reduxjs/toolkit';

import type { SettingsFragmentLike } from './SettingsFragmentLike';

type ActionOf<R> = R extends (cluster: never, action: infer A) => void ? A : never;

export type LiftedCaseReducers<Root, F extends SettingsFragmentLike> = {
  [K in keyof F['reducers']]: (state: Draft<Root>, action: ActionOf<F['reducers'][K]>) => void;
};
