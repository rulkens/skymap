/**
 * useUrlSync — single owner of `window.location.hash`, keeping
 * `#focus=<id>` in lock-step with the Redux selection store.
 *
 * Two effects replace the old five:
 *
 *   A. Hash READ (mount + hashchange listener)
 *      Parses `#focus=<id>` from the URL on mount and on every
 *      subsequent hashchange. A match dispatches `requestFocus(id)`.
 *      An empty or unrecognised hash dispatches `clearSelection()`,
 *      but ONLY on hashchange events (back/forward navigation) — not
 *      on the initial mount call, which would fire a spurious
 *      `clearSelection` on every normal page load. The
 *      `watchRequestFocusSaga` owns resolution and deferral.
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
import { HASH_PARAM_SOURCES } from './hashParamSources';
import { parseHashParams } from '../utils/url/parseHashParams';
import { composeHashParams } from '../utils/url/composeHashParams';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectFocusedFocusable } from '../state/selection/selectors';

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
 * The body is composed over `HASH_PARAM_SOURCES`: each source's `write` derives
 * its value from the input (or `null` to omit its param), and `composeHashParams`
 * joins the non-null values in table order. Only `focus` exists today, so the
 * body is `focus=<id>` for an encodable target and `''` otherwise — byte-identical
 * to the pre-seam single-param output. The feature adds `t` as a second row,
 * which composes as `focus=<id>&t=<iso>` for free.
 *
 * `focus`'s own row (`hashParamSources.ts`) yields the id via `URL_HASH_FOR`:
 * a galaxy runs the codec ladder (null when non-encodable, e.g. Synthetic), a
 * structure/body/star yields its own id token, the Milky Way the fixed literal.
 *
 * `matches` is the strip-leading-#-and-compare result, used by the write
 * effect to skip no-op `pushState` calls.
 */
export function computeDesiredHash(input: DesiredHashInput): DesiredHashOutput {
  const params = new Map<string, string>();
  for (const source of HASH_PARAM_SOURCES) {
    const value = source.write(input);
    if (value !== null) params.set(source.key, value);
  }
  const desiredHashBody = composeHashParams(params);
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
  // A `focus=<id>` match always dispatches `requestFocus(id)`.
  // An empty or unrecognised hash dispatches `clearSelection()` only on
  // hashchange (back/forward navigation) — not on the initial mount call,
  // which would fire a spurious `clearSelection` on every normal page load.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const apply = (isInitial: boolean) => {
      const h = window.location.hash;
      const body = h.startsWith('#') ? h.slice(1) : h;
      const params = parseHashParams(body);
      // Hand each source its value (or `undefined` when absent) plus the
      // mount-vs-hashchange flag; the source owns its own dispatch decision.
      for (const source of HASH_PARAM_SOURCES) {
        source.read({ value: params.get(source.key), isInitial, dispatch });
      }
    };
    apply(true);
    const onHashChange = () => apply(false);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
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
