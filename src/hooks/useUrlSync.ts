/**
 * useUrlSync — single owner of `window.location.hash`, keeping
 * `#focus=<id>` in lock-step with the Redux selection store.
 *
 * Two effects replace the old five:
 *
 *   A. Hash READ (mount + hashchange listener)
 *      Parses `#focus=<id>` from the URL on mount and on every
 *      subsequent hashchange. A match dispatches `requestFocus(id)`;
 *      an empty or unrecognised hash dispatches `clearSelection()`.
 *      The `watchRequestFocus` saga owns resolution and deferral —
 *      the hook is dispatch-only. Back-navigation to an empty hash
 *      clears selection via the same `clearSelection()` path.
 *
 *   B. URL WRITE (runs on every store-derived `focused` change)
 *      Reads `selectFocusedFocusable` from the Redux store and
 *      derives the canonical hash body via `computeDesiredHash` +
 *      `URL_HASH_FOR`. Calls `history.pushState` only when the body
 *      actually differs. No pending-slot gating — the saga owns
 *      deferral, so the write is open immediately after a `focused`
 *      value lands.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why pushState fires no hashchange (no write↔read loop)
 * ──────────────────────────────────────────────────────────────────────
 * `history.pushState` is silent — it neither fires `hashchange` nor
 * `popstate`. Effect A's `hashchange` listener is therefore never
 * triggered by Effect B's write, eliminating any read↔write cycle.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why pushState (not replaceState)
 * ──────────────────────────────────────────────────────────────────────
 * Focusing a galaxy or structure is a navigational act — Back should
 * return to the previous selection (galaxy ↔ structure ↔ empty).
 * The hashchange listener re-fires on popstate-driven changes, which
 * dispatches `requestFocus` or `clearSelection` to restore the prior
 * state.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why interesting branches live in pure helpers
 * ──────────────────────────────────────────────────────────────────────
 * Vitest runs in `node` env (no DOM), so `computeDesiredHash` contains
 * the hash-encoding logic under test. The hook's effects are thin
 * glue over `history.pushState` and `dispatch`.
 *
 * ──────────────────────────────────────────────────────────────────────
 * SSR safety
 * ──────────────────────────────────────────────────────────────────────
 * Every `window` / `history` access is wrapped in `typeof window !==
 * 'undefined'`. Skymap doesn't SSR today but the guard is cheap.
 */

import { useEffect } from 'react';
import type { FocusableTarget } from '../@types/engine/FocusableTarget';
import { URL_HASH_FOR } from './urlHashFor';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectFocusedFocusable } from '../state/selection/selectors';
import { clearSelection } from '../state/selection/selectionSlice';
import { requestFocus } from '../state/selection/requestFocus';

// ── Pure helpers (re-exported for unit tests) ──────────────────────────────

export type DesiredHashInput = {
  focused: FocusableTarget | null;
  currentHash: string;
};

export type DesiredHashOutput = {
  desiredHashBody: string;
  matches: boolean;
};

/**
 * Pure decision: given the current focus target and the URL's current
 * hash, what should the URL's hash *body* be, and does it already agree?
 *
 * Body shape:
 *   1. focused is a galaxy    → `focus=<id>` (or `''` if non-encodable,
 *      e.g. Synthetic source).
 *   2. focused is a structure → `focus=<id>`.
 *   3. focused is null        → `''`.
 *
 * `matches` is the strip-leading-#-and-compare result, used by the write
 * effect to skip no-op `pushState` calls.
 */
export function computeDesiredHash(input: DesiredHashInput): DesiredHashOutput {
  let desiredHashBody = '';
  if (input.focused !== null) {
    // Table dispatch on the union tag: galaxy ids run the codec ladder
    // (null when non-encodable), structures yield their own id.
    const id = URL_HASH_FOR[input.focused.type](input.focused);
    if (id) desiredHashBody = `focus=${id}`;
  }
  const currentBody = input.currentHash.startsWith('#')
    ? input.currentHash.slice(1)
    : input.currentHash;
  return { desiredHashBody, matches: currentBody === desiredHashBody };
}

// ── React hook ─────────────────────────────────────────────────────────────

export function useUrlSync(): void {
  const dispatch = useAppDispatch();
  const focused = useAppSelector(selectFocusedFocusable);

  // ── Effect A: hash READ → dispatch ───────────────────────────────────
  // Parse the URL once on mount and on every subsequent hashchange.
  // A `focus=<id>` match dispatches `requestFocus(id)`; the
  // `watchRequestFocus` saga resolves + defers. An empty or
  // unrecognised hash dispatches `clearSelection()`, which handles both
  // back-navigation to an empty hash and any non-focus segment.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const apply = () => {
      const h = window.location.hash;
      const body = h.startsWith('#') ? h.slice(1) : h;
      const m = /^focus=(.+)$/.exec(body);
      if (m) dispatch(requestFocus(m[1]!));
      else dispatch(clearSelection());
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [dispatch]);

  // ── Effect B: store → URL WRITE ──────────────────────────────────────
  // Derives the canonical hash body from the resolved focus target and
  // writes it via `pushState`. The no-op `matches` check prevents
  // history-state churn under React Strict Mode and noisy re-renders.
  // No pending-slot gating — the saga owns deferral, so the write opens
  // the moment a `focused` value lands in the store.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { desiredHashBody, matches } = computeDesiredHash({
      focused,
      currentHash: window.location.hash,
    });
    if (matches) return;
    const base = window.location.pathname + window.location.search;
    const next = desiredHashBody ? `${base}#${desiredHashBody}` : base;
    window.history.pushState(null, '', next);
  }, [focused]);
}
