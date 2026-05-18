/**
 * `useFocusUrlSync` — keep `window.location.hash` in lock-step with the
 * currently *focused* galaxy (deliberate camera commitment, distinct
 * from a bare-click "pinned" selection), and surface deep-link
 * arrivals back to the App as a `pendingTarget` it can resolve once
 * the clouds finish loading.  The selected/focused split is what makes
 * a casual click NOT pollute browser history with `#focus=…` entries —
 * only a Focus button press, `f` shortcut, palette pick, or deep-link
 * resolve does.  See `EngineCallbacks.onFocusChange` for the engine
 * side of that contract.
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
 * Why `pushState` (not `replaceState`) for selection-driven writes?
 * ──────────────────────────────────────────────────────────────────────
 * Pinning a galaxy is a navigational act — the user wants Back to
 * return them to the previous pin (and Forward to redo).  pushState
 * adds a real history entry per pin transition; the popstate listener
 * below catches Back/Forward and re-fires the deep-link resolver
 * against whichever URL the browser navigated to.  The mount-time
 * "we just landed with `#focus=…`" path uses replaceState (no entry
 * yet) — see effect 2 below.  Re-fires are idempotent: pendingTarget
 * is set, drain resolves, selection-effect sees `matches: true` and
 * writes nothing.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why we DON'T scrub the hash on mount
 * ──────────────────────────────────────────────────────────────────────
 * An earlier draft scrubbed `#focus=…` on mount to prevent a manual
 * reload from re-firing the resolver.  But re-firing is harmless: the
 * resolver is pure, the drain is idempotent, and once `selected`
 * matches the URL the selection-effect short-circuits via `matches:
 * true`.  Leaving the hash in place gives the user a stable visible
 * URL the whole way through, and — combined with `pushState` for
 * subsequent pin changes — makes Back/Forward navigation work
 * naturally.
 *
 * ──────────────────────────────────────────────────────────────────────
 * SSR safety
 * ──────────────────────────────────────────────────────────────────────
 * Every `window`/`history` access is wrapped in `typeof window !==
 * 'undefined'`.  We don't actually SSR this app today, but the guard is
 * cheap and keeps the hook safe to import from places that might run
 * under tooling that pre-evaluates modules in node.
 */

import { useEffect, useRef, useState } from 'react';
import type { GalaxyCatalog } from '../@types/data/GalaxyCatalog';
import { ALL_SOURCES, Source } from '../data/sources';
import { parseFocusHash, selectionToFocusId } from '../services/url/focusUrl';
import type { FocusTarget } from '../@types/camera/FocusTarget';
import { resolveFocusTarget } from '../services/engine/camera/resolveFocusTarget';
import type { DesiredHashInput } from '../@types/engine/DesiredHashInput';
import type { DesiredHashOutput } from '../@types/engine/DesiredHashOutput';
import type { UseFocusUrlInput } from '../@types/engine/UseFocusUrlInput';
import type { FocusSyncReturn } from '../@types/engine/FocusSyncReturn';

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

// UseFocusUrlInput / FocusSyncReturn moved to @types/engine/.

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
 *      the alias map and dispatches `engine.selection.selectByAlias` on a
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
    focused,
    status,
    sourceCounts,
    famousMeta,
    famousXrefs,
    aliasMap,
    engineHandleRef,
  } = input;

  const [pendingTarget, setPendingTarget] = useState<FocusTarget | null>(null);

  // ── 1. Mount capture + popstate listener ────────────────────────────────
  // The mount path also installs a `popstate` listener that turns
  // browser-driven hash changes (Back/Forward) into the same
  // pendingTarget mechanism the initial mount uses — so navigating
  // back to a previous `#focus=<id>` re-resolves and re-pins the
  // galaxy, while navigating back to no-hash clears the selection.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // SSR guard before flipping the ref: if this ever ran in a Node
    // render (we don't SSR today, but the guard is cheap), we want the
    // client-side hydration pass to still mount cleanly rather than be
    // short-circuited by a ref flipped during render.
    if (mountedRef.current) return;
    mountedRef.current = true;

    const target = initialPendingTarget(window.location.hash);
    if (target) setPendingTarget(target);

    const onPopState = () => {
      const t = initialPendingTarget(window.location.hash);
      if (t) {
        setPendingTarget(t);
      } else {
        // Empty / unparseable hash: this back-step represents
        // "before any pin existed".  Tell the engine to clear so the
        // selection-effect's next run sees `selected === null` and
        // doesn't try to write an old hash back over the empty one.
        engineHandleRef.current?.selection.clear();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // engineHandleRef is a ref — its identity doesn't change.  The
    // empty deps array is intentional: this effect mounts once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. Selection → URL ──────────────────────────────────────────────────
  // Write the hash to match the selection.  Two guards:
  //   - `matches`: skip no-op writes when the URL already says the
  //     right thing.  Avoids history-state churn under React strict
  //     mode and during noisy re-renders.
  //   - `pendingTarget !== null`: don't fight a still-resolving deep
  //     link.  In the brief window between mount and resolve,
  //     `selected` is null but the URL legitimately holds a target
  //     we're trying to honour; writing `''` here would clobber it.
  //     Once the drain resolves and supersede clears pending, this
  //     guard opens and the canonical hash for the new selection is
  //     written (or already matches).
  //
  // pushState (not replaceState) for the back-button UX — see the
  // module header.  popstate above handles the inverse direction.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pendingTarget !== null) return;
    const { desiredHashBody, matches } = computeDesiredHash({
      selected: focused,
      currentHash: window.location.hash,
    });
    if (matches) return;
    // Don't fight a coexisting `#poi=…` set by the sister
    // `usePoiUrlSync` hook — that segment is its territory.  Without
    // this guard, a fresh tab loaded with a `#poi=cluster-virgo-m87`
    // deep link would have its hash clobbered to `''` on mount because
    // `focused` is null and `desiredHashBody === ''`.  Symmetric to the
    // `hashIsPoiOrEmpty` check in usePoiUrlSync — each hook only ever
    // writes to its own segment.
    const currentBody = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashIsFocusOrEmpty = currentBody === '' || currentBody.startsWith('focus=');
    if (!hashIsFocusOrEmpty) return;
    const base = window.location.pathname + window.location.search;
    const next = desiredHashBody ? `${base}#${desiredHashBody}` : base;
    window.history.pushState(null, '', next);
  }, [focused, pendingTarget]);

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
    if (!handle?.sources || !handle?.selection) return;

    // Build the resolver's `catalogs` input from currently-loaded sources.
    // Skip Synthetic — the resolver excludes it anyway because synthetic
    // objIDs are sequential 0..N-1 and would collide spuriously with
    // low PGCs, and keeping it out of the input saves a pass over the
    // large `pos@` branch.
    const catalogs: { source: Source; catalog: GalaxyCatalog }[] = [];
    for (const source of ALL_SOURCES) {
      if (source === Source.Synthetic) continue;
      const catalog = handle.sources.getCloud(source);
      if (catalog) catalogs.push({ source, catalog });
    }
    if (catalogs.length === 0) return;

    const result = resolveFocusTarget({
      target: pendingTarget,
      catalogs,
      famousMeta,
      aliasMap,
    });

    if (result.resolved) {
      // Pass App's own famousMeta + xrefs so `buildGalaxyInfo` inside
      // `selectByAlias` doesn't read the engine's still-loading copy.
      // See the EngineHandle JSDoc on `selectByAlias` for the race
      // this avoids.
      handle.selection.selectByAlias({
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
  // The trigger is a FOCUS change, not a pendingTarget change.  Why
  // that distinction matters: a back-button press drives popstate to
  // set pendingTarget to a new target while `focused` is still the
  // current camera commitment.  If we depended on `pendingTarget` here
  // we'd clear the freshly-set pending the same render it arrives,
  // defeating the back-button entirely.  Keying off `focused` only
  // fires this when a deliberate focus actually lands — drain-resolved
  // deep-link OR user-triggered focus action — which is the moment the
  // "deep link to honour" state stops being relevant.
  //
  // Bare canvas clicks set `selected` but NOT `focused`, so they don't
  // pre-empt a still-resolving deep link — the deep-link wins, which
  // matches the user's URL-pasted intent.
  useEffect(() => {
    if (focused !== null) setPendingTarget(null);
  }, [focused]);

  return { pendingTarget };
}
