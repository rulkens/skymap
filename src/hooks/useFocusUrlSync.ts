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

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { EngineHandle, EngineStatus, PointCloud, PointInfo } from '../@types';
import { ALL_SOURCES, Source } from '../data/sources';
import {
  parseFocusHash,
  selectionToFocusId,
  type FocusTarget,
} from '../services/url/focusUrl';
import {
  resolveFocusTarget,
} from '../services/engine/resolveFocusTarget';
import type {
  FamousMetaEntry,
  FamousXrefMap,
} from '../services/engine/famousMetaLoader';

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
 * Inputs to the deep-link orchestrator hook.  The reactive ones drive
 * the drain effect's re-runs as data lands; `engineHandleRef` is a
 * mutable ref because the engine handle is constructed asynchronously
 * during App mount and should not retrigger this hook on assignment.
 */
export type UseFocusUrlInput = {
  selected: PointInfo | null;
  status: EngineStatus;
  sourceCounts: Partial<Record<Source, number>>;
  famousMeta: readonly FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
  engineHandleRef: RefObject<EngineHandle | null>;
};

/**
 * What the hook returns to the caller.  `pendingTarget` is non-null
 * when a deep-link arrival is waiting to be resolved against the
 * loaded clouds — currently surfaced so a future tier-mismatch banner
 * can render off it.  Other paths (success, supersede) clear it
 * internally without the caller having to act.
 */
export type FocusSyncReturn = {
  pendingTarget: FocusTarget | null;
};

/**
 * React hook owning the entire URL ↔ selection lifecycle for the
 * deep-link `#focus=…` feature.  Three internal effects:
 *
 *   1. **Mount capture** — parse `location.hash`, set `pendingTarget`,
 *      scrub the hash so a manual reload doesn't re-fire the same
 *      target after the user has navigated elsewhere.
 *
 *   2. **Selection → URL** — when `selected` changes, write the
 *      canonical hash (or clear it for a synthetic / null selection)
 *      via `replaceState`.  Skips no-op writes via the `matches`
 *      short-circuit on `computeDesiredHash`.
 *
 *   3. **Drain + supersede** — once the engine reaches `'ready'`
 *      (which guarantees `state.cam` is constructed), runs the
 *      resolver against every loaded cloud + the famous sidecars +
 *      the alias map and dispatches `engine.selectByAlias` on a
 *      successful match.  Resolution during loading is monotonic, so
 *      `unknown` is treated as "not yet" — pending stays set and the
 *      effect re-fires on the next data dep change.  Pending is
 *      collapsed by the supersede effect the moment any selection
 *      lands (deep-link resolved OR user clicked something else).
 *
 * The hook intentionally has minimal direct test coverage — its
 * behaviour is the composition of `computeDesiredHash` (covered),
 * `resolveFocusTarget` (covered), and a couple of browser primitives.
 * The `mountedRef` guard exists for React 18 strict-mode double-mount.
 */
export function useFocusUrlSync(input: UseFocusUrlInput): FocusSyncReturn {
  const {
    selected,
    status,
    sourceCounts,
    famousMeta,
    famousXrefs,
    aliasMap,
    engineHandleRef,
  } = input;

  const [pendingTarget, setPendingTarget] = useState<FocusTarget | null>(null);

  // ── 1. Mount capture ────────────────────────────────────────────────────
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

  // ── 2. Selection → URL ──────────────────────────────────────────────────
  // Write the hash to match the selection, but only when it actually
  // differs.  The `matches` short-circuit avoids a flurry of identical
  // `replaceState` calls when the App re-renders for unrelated reasons.
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

  // ── 3a. Drain ───────────────────────────────────────────────────────────
  // Resolve pendingTarget against the engine's currently loaded data
  // and dispatch a selection.  Re-runs on every data dep change because
  // resolution is monotonic — a transient `unknown` is just "not yet."
  // We deliberately do NOT clear pending on `unknown`; the supersede
  // effect below collapses pending the moment any selection lands.
  useEffect(() => {
    if (!pendingTarget) return;
    // Wait for the engine to fully boot — `status.kind === 'ready'` is
    // the moment the render loop has started, which guarantees both the
    // first cloud upload AND `state.cam` are in place.  Resolving any
    // earlier means `selectByAlias` enters the tween dispatch with
    // `state.cam === null` and silently bails.
    if (status.kind !== 'ready') return;
    const handle = engineHandleRef.current;
    if (!handle?.getCloud || !handle?.selectByAlias) return;

    // Build the resolver's `clouds` input from currently-loaded sources.
    // Skip Synthetic — the resolver excludes it anyway because synthetic
    // objIDs are sequential 0..N-1 and would collide spuriously with
    // low PGCs, and keeping it out of the input saves a pass over the
    // large `pos@` branch.
    const clouds: { source: Source; cloud: PointCloud }[] = [];
    for (const source of ALL_SOURCES) {
      if (source === Source.Synthetic) continue;
      const cloud = handle.getCloud(source);
      if (cloud) clouds.push({ source, cloud });
    }
    if (clouds.length === 0) return;

    const result = resolveFocusTarget({
      target: pendingTarget,
      clouds,
      famousMeta,
      aliasMap,
    });

    if (result.resolved) {
      // Pass App's own famousMeta + xrefs so `buildPointInfo` inside
      // `selectByAlias` doesn't read the engine's still-loading copy.
      // See the EngineHandle JSDoc on `selectByAlias` for the race
      // this avoids.
      handle.selectByAlias({
        source: result.source,
        localIdx: result.localIdx,
        famousMeta,
        famousXrefs,
      });
    }
    // tier and unknown: leave pendingTarget set.  `tier` is read by the
    // eventual banner; `unknown` simply waits for more data.
  }, [
    pendingTarget,
    status,
    sourceCounts,
    famousMeta,
    famousXrefs,
    aliasMap,
    engineHandleRef,
  ]);

  // ── 3b. Supersede ───────────────────────────────────────────────────────
  // Once any selection lands — drain-resolved deep-link OR user click —
  // the original deep-link target stops being load-bearing.  This is the
  // single place we collapse "we have a deep link to honour" state, so
  // the drain can stay focused on the resolve-and-dispatch path.
  useEffect(() => {
    if (selected !== null && pendingTarget !== null) setPendingTarget(null);
  }, [selected, pendingTarget]);

  return { pendingTarget };
}
