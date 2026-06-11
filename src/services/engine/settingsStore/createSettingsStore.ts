/**
 * createSettingsStore — the engine-owned settings store factory.
 *
 * ### Why a vanilla zustand store in the engine core
 *
 * `state.settings` is the authoritative home for every render setting. React
 * needs to observe changes to it without the old echo-mirror protocol (the
 * engine firing a typed callback per change while React keeps a parallel
 * `useState` copy that can drift). A zustand vanilla store gives us an
 * observable cell — `subscribe` / `getState` / `setState` — that the engine
 * owns and React reads via `useStore`. We import from `zustand/vanilla` rather
 * than `zustand` so the core (`services/`) carries no React dependency; the
 * React seam lives only in `components/` and `hooks/`.
 *
 * ### Why the state shape is `EngineSettingsState` verbatim
 *
 * The store holds *only* `EngineSettingsState`, with no actions co-located on
 * the state object. Keeping the held shape identical to `EngineSettingsState`
 * means the engine's `state.settings` getter can return `store.getState()`
 * directly with no projection or type surgery — the dozens of
 * `state.settings.X` read sites stay untouched. Reducers (pure copy-on-write
 * transitions), actions (thin `setState` wrappers), and selectors (pure
 * projections) all live as FREE functions in sibling folders, taking the state
 * or the store as an argument — never methods bolted onto the held value.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

import type { EngineSettingsState } from '../../../@types/settings/EngineSettingsState';

export type SettingsStore = StoreApi<EngineSettingsState>;

/**
 * Seed a settings store from an already-constructed `EngineSettingsState`
 * (the engine builds that literal from `data/defaults.ts`). No initializer
 * function or merge logic — the store simply holds the value it's handed.
 */
export function createSettingsStore(initial: EngineSettingsState): SettingsStore {
  return createStore<EngineSettingsState>(() => initial);
}
