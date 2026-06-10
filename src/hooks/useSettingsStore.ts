/**
 * `useSettingsStore` — the single React-side adapter onto the engine-owned
 * settings store.
 *
 * ──────────────────────────────────────────────────────────────────────
 * The handle-timing problem this solves
 * ──────────────────────────────────────────────────────────────────────
 * The engine handle (and with it `handle.settingsStore`) lands in `handleRef`
 * asynchronously — `useEngine` constructs the engine in an effect, so the
 * first render happens with `handleRef.current === null`. `useStore` /
 * `useSyncExternalStore` need a store at every render and must be called
 * unconditionally (Rules of Hooks). This adapter handles the null window
 * inside the hook: while the ref is null it subscribes to a no-op and returns
 * the caller's `fallback` (the same `data/defaults.ts` value the store is
 * seeded from, so the first paint matches the engine truth); once the ref is
 * non-null it reflects the live store value through the same selector.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why `useSyncExternalStore` directly (not zustand's `useStore`)
 * ──────────────────────────────────────────────────────────────────────
 * zustand's `useStore(store, selector)` requires a concrete store at call
 * time — there's no first-class "no store yet" mode. Driving
 * `useSyncExternalStore` ourselves lets us swap in a no-op subscribe + a
 * fallback snapshot for the null window, keeping the hook call unconditional
 * without a sentinel store. The selector stays the same pure function both
 * sides share; this hook is the only place the React subscription lives.
 *
 * The `fallback` is passed per call site rather than read from a defaults map
 * here so the hook carries no dependency on the full settings shape — each
 * caller already knows which `DEFAULT_*` value (or derived seed, e.g.
 * `ALL_VISIBLE_MASK`) matches its selector, exactly as the old
 * `useEngineSettings` cells did.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import type { EngineHandle } from '../@types/engine/EngineHandle';
import type { EngineSettingsState } from '../@types/settings/EngineSettingsState';

/** A no-op `subscribe` for the null-store window — never fires a change. */
function noopSubscribe(): () => void {
  return () => {};
}

export function useSettingsStore<T>(
  handleRef: RefObject<EngineHandle | null>,
  selector: (state: EngineSettingsState) => T,
  fallback: T,
): T {
  const store = handleRef.current?.settingsStore ?? null;

  // Subscribe to the live store when present; otherwise a no-op so the hook
  // call stays unconditional through the null window.
  const subscribe = useCallback(
    (onStoreChange: () => void) => (store ? store.subscribe(onStoreChange) : noopSubscribe()),
    [store],
  );

  // Project the live value through the selector when the store exists; return
  // the caller's defaults-derived fallback while it doesn't.
  const getSnapshot = useCallback(
    () => (store ? selector(store.getState()) : fallback),
    [store, selector, fallback],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
