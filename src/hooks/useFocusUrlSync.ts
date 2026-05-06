/**
 * `useFocusUrlSync` — keep `window.location.hash` in lock-step with the
 * currently selected galaxy, and surface deep-link arrivals back to the
 * App as a `pendingTarget` it can resolve once the clouds finish loading.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why is the logic split into pure helpers + a thin React wrapper?
 * ──────────────────────────────────────────────────────────────────────
 * Vitest runs in the `node` environment in this project (see
 * `vitest.config.ts`).  There is intentionally no DOM, so any
 * `renderHook`-style React-DOM exercise would require pulling in
 * `jsdom`/`happy-dom` as a new dev dependency.  Rather than expand the
 * test infra footprint for one hook, every interesting branch of logic
 * lives in `computeDesiredHash` (pure, takes `{ selected, currentHash }`
 * and returns `{ desiredHashBody, matches }`) and `initialPendingTarget`
 * (pure parse wrapper).  The hook itself is unfailable trivia: a couple
 * of `useEffect`s that read the helpers' output and shovel it into
 * `history.replaceState`.  See `Panel.test.ts` for the same pattern of
 * "test the headless thing in node, leave the DOM-touching glue thin".
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why `replaceState` and not `pushState`?
 * ──────────────────────────────────────────────────────────────────────
 * Each click on a galaxy shouldn't add a back-button stop.  If we
 * `pushState`d on every selection, a user clicking through five galaxies
 * would have to mash Back five times to leave the page — annoying, and
 * worse: each Back would walk through stale focus URLs that the engine
 * has long since drifted past, re-firing the resolver each time.
 * `replaceState` keeps the URL shareable without polluting history.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why scrub the hash on mount after capturing the deep-link target?
 * ──────────────────────────────────────────────────────────────────────
 * Once the resolver consumes the pending target the engine takes over
 * as the source-of-truth, and the *next* selection-change effect will
 * write the (possibly identical) hash back if appropriate.  Leaving the
 * raw hash in place would mean a manual Cmd-R reload re-fires the same
 * deep-link resolve even after the user has navigated elsewhere — so we
 * scrub it the moment we've captured it as `pendingTarget`.  This is
 * also the reason for the `mountedRef` guard: under React 18 strict
 * mode the mount effect double-fires, and we want to capture the hash
 * exactly once.
 *
 * ──────────────────────────────────────────────────────────────────────
 * SSR safety
 * ──────────────────────────────────────────────────────────────────────
 * Every `window`/`history` access is wrapped in `typeof window !==
 * 'undefined'`.  We don't actually SSR this app today, but the guard is
 * cheap and keeps the hook safe to import from places that might run
 * under tooling that pre-evaluates modules in node.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointInfo } from '../@types';
import {
  parseFocusHash,
  selectionToFocusId,
  type FocusTarget,
} from '../services/url/focusUrl';

/**
 * Inputs to the pure desired-hash decision.  The caller passes in the
 * raw `location.hash` string (with or without the leading `#`) because
 * it's cheaper than re-reading `window` from inside the helper, and it
 * keeps the helper testable in the node env.
 */
export type DesiredHashInput = {
  selected: PointInfo | null;
  /** Raw hash, e.g. `"#focus=m31"` or `""`.  Leading `#` optional. */
  currentHash: string;
};

/**
 * Output of the pure desired-hash decision.
 *
 * `desiredHashBody` is the bit *after* `#`, lacking the leading `#`,
 * so the caller can decide whether to write `pathname + '#' + body` or
 * just `pathname` (when the body is empty).  `matches` lets the caller
 * skip the `replaceState` write when the URL already says the right
 * thing, which avoids spurious history-state churn under React strict
 * mode and during noisy state updates that don't actually change the
 * selection.
 */
export type DesiredHashOutput = {
  desiredHashBody: string;
  matches: boolean;
};

/**
 * Pure decision: given the current selection and the URL's current
 * hash, what should the URL's hash *body* be, and does it already
 * agree?
 *
 * Three states:
 *   1. `selected === null` → desired body is `''` (no hash).
 *   2. `selected` is encodable → desired body is `focus=<id>`.
 *   3. `selected` is non-null but `selectionToFocusId` returns null
 *      (Synthetic source) → treat as case 1: clear the hash.  This is
 *      the right fall-through because synthetic galaxies have no
 *      durable identity; surfacing a stale `#focus=…` in the URL after
 *      clicking a synthetic point would mislead anyone who copy-pastes
 *      the link.
 */
export function computeDesiredHash(input: DesiredHashInput): DesiredHashOutput {
  const { selected, currentHash } = input;

  // Compute the desired body.  null selection or non-encodable
  // selection both fall through to "no hash".
  let desiredHashBody = '';
  if (selected) {
    const id = selectionToFocusId(selected);
    if (id) desiredHashBody = `focus=${id}`;
  }

  // Strip the leading `#` from the comparison string — `location.hash`
  // includes it, but our `desiredHashBody` does not, and we want the
  // comparison to operate on equivalent representations.
  const currentBody = currentHash.startsWith('#')
    ? currentHash.slice(1)
    : currentHash;

  return { desiredHashBody, matches: currentBody === desiredHashBody };
}

/**
 * Pure parse-on-mount helper.  Thin re-export of the codec's
 * `parseFocusHash` under a name that documents intent at the callsite:
 * "what target should this app start with, given the URL it loaded
 * with?"  Direct callers in tests use this; the React hook below also
 * routes through it so the unit-tested branch is the one that runs in
 * production.
 */
export function initialPendingTarget(hash: string): FocusTarget | null {
  return parseFocusHash(hash);
}

/**
 * What the hook returns to the caller.  `pendingTarget` is non-null
 * when a deep-link arrival is waiting to be resolved against the
 * loaded clouds; the App calls `clearPending()` once it has dispatched
 * the resolve (success *or* abandonment) to acknowledge consumption.
 */
export type FocusSyncReturn = {
  pendingTarget: FocusTarget | null;
  clearPending: () => void;
};

/**
 * React hook: parses the URL on mount, keeps the URL in sync with the
 * current selection on change.
 *
 * The hook intentionally has minimal direct test coverage — its
 * behaviour is the composition of `computeDesiredHash` (covered) and
 * `replaceState` (a browser primitive).  The `mountedRef` guard exists
 * for React 18 strict-mode double-mount: if we set state from a mount
 * effect that re-fires, we'd briefly thrash `pendingTarget` and re-clear
 * a hash we've already cleared, which is harmless but confusing.
 */
export function useFocusUrlSync({
  selected,
}: {
  selected: PointInfo | null;
}): FocusSyncReturn {
  const [pendingTarget, setPendingTarget] = useState<FocusTarget | null>(null);

  // Mount-only: capture deep link, scrub it from the URL.
  const mountedRef = useRef(false);
  useEffect(() => {
    // SSR guard before flipping the ref: if this ever ran in a Node
    // render (we don't SSR today, but the guard is cheap), we want the
    // client-side hydration pass to still mount cleanly rather than be
    // short-circuited by a ref flipped during render.
    if (typeof window === 'undefined') return;
    if (mountedRef.current) return;
    mountedRef.current = true;
    const target = initialPendingTarget(window.location.hash);
    if (target) {
      setPendingTarget(target);
      // Scrub the hash so a manual reload doesn't re-fire the same
      // deep-link resolve after the user has navigated elsewhere.
      const url = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', url);
    }
  }, []);

  // Selection-change: write the hash to match the selection, but only
  // when it actually differs.  The `matches` short-circuit is what
  // lets us avoid a flurry of identical `replaceState` calls when the
  // App re-renders for unrelated reasons.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { desiredHashBody, matches } = computeDesiredHash({
      selected,
      currentHash: window.location.hash,
    });
    if (matches) return;
    const base = window.location.pathname + window.location.search;
    const next = desiredHashBody ? `${base}#${desiredHashBody}` : base;
    window.history.replaceState(null, '', next);
  }, [selected]);

  // `clearPending` is wrapped in `useCallback` so the consumer's `useEffect`
  // deps stay referentially stable across re-renders.  Without this, App's
  // drain effect (which lists `clearPending` in its deps) re-fires on every
  // parent render while `pendingTarget` is non-null — a real concern for
  // the `pos@` resolver branch, which scans every loaded cloud's positions.
  const clearPending = useCallback(() => setPendingTarget(null), []);

  return {
    pendingTarget,
    clearPending,
  };
}
