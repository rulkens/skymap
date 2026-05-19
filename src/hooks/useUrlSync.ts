/**
 * useUrlSync — single owner of `window.location.hash`, handles both
 * `#focus=<galaxyId>` (galaxy commit) and `#poi=<poiId>` (POI commit)
 * segments in one place.
 *
 * Replaces the legacy `useFocusUrlSync` + `usePoiUrlSync` pair.  Why
 * merging is now clean: both legacy hooks had to coordinate via "is
 * the hash someone else's segment?" prefix guards (`hashIsFocusOrEmpty`
 * / `hashIsPoiOrEmpty`).  One owner can't race itself, so those
 * guards collapse — the write effect just computes the canonical body
 * from whichever state slot is set.  Galaxy wins the mutex tiebreak
 * (matches engine click-handler precedence: POI clicks clear galaxy
 * selection at the engine level today, so "both set" is only ever a
 * transient cross-render race, and we resolve it deterministically
 * here as a belt-and-braces guarantee).
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why the logic is split into pure helpers + a thin React wrapper
 * ──────────────────────────────────────────────────────────────────────
 * Vitest runs in `node` env (no DOM), so all interesting branches live
 * in `computeDesiredHash` and `initialPendingFromHash`, which the hook's
 * effects shovel into `history.pushState`.  Same pattern as the legacy
 * galaxy hook.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why `pushState` (not `replaceState`)
 * ──────────────────────────────────────────────────────────────────────
 * Pinning a galaxy OR focusing a POI is a navigational act — Back
 * should return to the previous selection (galaxy ↔ POI ↔ empty).
 * popstate translates browser-driven hash changes into the same
 * pending-slot mechanism the initial mount uses.  Same rationale the
 * two legacy hooks used independently.
 *
 * ──────────────────────────────────────────────────────────────────────
 * SSR safety
 * ──────────────────────────────────────────────────────────────────────
 * Every `window` / `history` access is wrapped in `typeof window !==
 * 'undefined'`.  Skymap doesn't SSR today but the guard is cheap and
 * matches the legacy hooks' shape.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Five effects
 * ──────────────────────────────────────────────────────────────────────
 *   1. Mount capture + popstate listener — single handler that
 *      disambiguates the URL on popstate via `initialPendingFromHash`,
 *      routes into the right pending slot, and clears stale pending
 *      from the other slot.  An empty hash on popstate calls
 *      `selection.clear()` (which Task 3 widened to tear down both
 *      galaxy and POI selection in one call).
 *
 *   2. State → URL — derives the canonical body via `computeDesiredHash`
 *      and writes it via `pushState`.  Skips no-op writes (`matches`
 *      short-circuit).  Holds off while EITHER pending slot is set
 *      (a still-resolving deep link must not be clobbered).  No
 *      segment-guard skip — we own the hash.
 *
 *   3. Galaxy drain — resolves `pendingTarget` against the loaded
 *      catalogs (same logic as the legacy galaxy hook).  Resolution
 *      is monotonic: `unknown` is treated as "not yet" and the effect
 *      re-fires on data dep changes.
 *
 *   4. POI drain — resolves `pendingPoiId` against the POI table and
 *      dispatches via `camera.focusOn(poi)` (Task 2's unified method,
 *      which accepts both GalaxyInfo and PointOfInterest).  Clears
 *      pending only on successful resolve; missing-id leaves pending
 *      set so a future `pois` change (e.g. famous-meta load) re-fires
 *      the drain.
 *
 *   5. Galaxy supersede — collapses `pendingTarget` once `focused`
 *      lands (deep-link wins vs casual click race; matches the legacy
 *      galaxy hook's effect 3b).  No POI supersede because the POI
 *      table is synchronous.
 */

import { useEffect, useRef, useState } from 'react';
import type { UseUrlSyncInput } from '../@types/engine/UseUrlSyncInput';
import type { UrlSyncReturn } from '../@types/engine/UrlSyncReturn';
import type { GalaxyInfo } from '../@types/engine/GalaxyInfo';
import type { GalaxyCatalog } from '../@types/data/GalaxyCatalog';
import type { FocusTarget } from '../@types/camera/FocusTarget';
import { parseFocusHash, selectionToFocusId } from '../services/url/focusUrl';
import { parsePoiHash, poiIdToHash } from '../services/url/poiUrl';
import { resolveFocusTarget } from '../services/engine/camera/resolveFocusTarget';
import { ALL_SOURCES, Source } from '../data/sources';

// ── Pure helpers (re-exported for unit tests) ──────────────────────────────

export type DesiredHashInput = {
  focused: GalaxyInfo | null;
  focusedPoiId: string | null;
  currentHash: string;
};

export type DesiredHashOutput = {
  desiredHashBody: string;
  matches: boolean;
};

/**
 * Pure decision: given the current galaxy + POI selections and the URL's
 * current hash, what should the URL's hash *body* be, and does it already
 * agree?
 *
 * Body precedence (tiebreak: galaxy wins):
 *   1. focused set → `focus=<id>` (or `''` if the galaxy is non-encodable,
 *      e.g. Synthetic source).
 *   2. else focusedPoiId set → `poi=<id>`.
 *   3. neither → `''`.
 *
 * `matches` is the strip-leading-#-and-compare result, used by the write
 * effect to skip no-op `pushState` calls.
 */
export function computeDesiredHash(input: DesiredHashInput): DesiredHashOutput {
  let desiredHashBody = '';
  if (input.focused) {
    const id = selectionToFocusId(input.focused);
    if (id) desiredHashBody = `focus=${id}`;
  } else if (input.focusedPoiId) {
    desiredHashBody = poiIdToHash(input.focusedPoiId);
  }
  const currentBody = input.currentHash.startsWith('#')
    ? input.currentHash.slice(1)
    : input.currentHash;
  return { desiredHashBody, matches: currentBody === desiredHashBody };
}

export type InitialPending =
  | { kind: 'galaxy'; target: FocusTarget }
  | { kind: 'poi'; poiId: string }
  | { kind: null };

/**
 * Pure parse-on-mount helper.  Tries the galaxy parser first, then the
 * POI parser, then returns `kind: null` for everything else.  Each
 * parser returns null for hashes that don't match its scheme, so
 * disambiguation is just "first match wins."
 */
export function initialPendingFromHash(hash: string): InitialPending {
  const galaxy = parseFocusHash(hash);
  if (galaxy) return { kind: 'galaxy', target: galaxy };
  const poi = parsePoiHash(hash);
  if (poi) return { kind: 'poi', poiId: poi };
  return { kind: null };
}

// ── React hook ─────────────────────────────────────────────────────────────

export function useUrlSync(input: UseUrlSyncInput): UrlSyncReturn {
  const {
    focused,
    status,
    sourceCounts,
    famousMeta,
    famousXrefs,
    aliasMap,
    focusedPoiId,
    ready,
    pois,
    engineHandleRef,
  } = input;

  const [pendingTarget, setPendingTarget] = useState<FocusTarget | null>(null);
  const [pendingPoiId, setPendingPoiId] = useState<string | null>(null);

  // ── Effect 1: mount + popstate ────────────────────────────────────────
  // Parse the URL once on mount; install a `popstate` listener so
  // Back/Forward presses also drive both pending slots through the same
  // resolution paths.  A single handler disambiguates via
  // `initialPendingFromHash` and clears the stale slot from the other
  // kind — the two legacy hooks had to guard against clobbering each
  // other's segment; here we are the sole owner so a switch in hash
  // kind (e.g. back-nav from `#focus=m31` to `#poi=virgo`) is just
  // "set the new slot, clear the old one."
  const mountedRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // SSR guard before flipping the ref: if this ever ran in a Node
    // render (we don't SSR today, but the guard is cheap), we want the
    // client-side hydration pass to still mount cleanly rather than be
    // short-circuited by a ref flipped during render.
    if (mountedRef.current) return;
    mountedRef.current = true;

    const initial = initialPendingFromHash(window.location.hash);
    if (initial.kind === 'galaxy') setPendingTarget(initial.target);
    else if (initial.kind === 'poi') setPendingPoiId(initial.poiId);

    const onPopState = () => {
      const next = initialPendingFromHash(window.location.hash);
      if (next.kind === 'galaxy') {
        setPendingTarget(next.target);
        setPendingPoiId(null);
      } else if (next.kind === 'poi') {
        setPendingPoiId(next.poiId);
        setPendingTarget(null);
      } else {
        // Back-step to empty hash — clear any stale pending AND tell
        // the engine to drop both kinds of selection (Task 3 widened
        // `clear()` to handle both).  Without this, the next render
        // would write the previous body back over the empty one.
        setPendingTarget(null);
        setPendingPoiId(null);
        engineHandleRef.current?.selection.clear();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // engineHandleRef is a ref — its identity doesn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect 2: state → URL ─────────────────────────────────────────────
  // Write the hash to match the selection.  Two guards:
  //   - `pendingTarget !== null || pendingPoiId !== null`: don't fight
  //     either pending slot.  If we wrote the desired body while a deep
  //     link is still resolving we'd clobber the URL that drove the
  //     pending state in the first place.  The write opens once both
  //     pending slots are clear.
  //   - `matches`: skip no-op writes when the URL already says the
  //     right thing.  Avoids history-state churn under React strict
  //     mode and during noisy re-renders.
  //
  // No segment-guard skip — we own the whole hash, so there's no
  // sister hook's territory to dodge.  `computeDesiredHash` already
  // encodes the correct tiebreak (galaxy wins), so we write exactly
  // what the current selection state calls for.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Don't fight a still-resolving deep link on either side.
    if (pendingTarget !== null || pendingPoiId !== null) return;
    const { desiredHashBody, matches } = computeDesiredHash({
      focused,
      focusedPoiId,
      currentHash: window.location.hash,
    });
    if (matches) return;
    const base = window.location.pathname + window.location.search;
    const next = desiredHashBody ? `${base}#${desiredHashBody}` : base;
    window.history.pushState(null, '', next);
  }, [focused, focusedPoiId, pendingTarget, pendingPoiId]);

  // ── Effect 3: galaxy drain ────────────────────────────────────────────
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
  }, [pendingTarget, status, sourceCounts, famousMeta, famousXrefs, aliasMap, engineHandleRef]);

  // ── Effect 4: POI drain ───────────────────────────────────────────────
  // Resolve `pendingPoiId` against the POI table once the engine is
  // ready.  We deliberately do NOT clear pending when the id isn't
  // found — a tier swap or async famous-meta load can add entries
  // later, and re-firing the drain on `pois` changes will pick them
  // up.  Clearing only on a successful resolve preserves the
  // "deep-link arrival waits as long as it takes" contract.
  //
  // `camera.focusOn` is the unified method that accepts both GalaxyInfo
  // and PointOfInterest, routing each to its own commit path internally.
  useEffect(() => {
    if (!pendingPoiId) return;
    if (!ready) return;
    if (pois.length === 0) return;
    const handle = engineHandleRef.current;
    if (!handle) return;
    const poi = pois.find((p) => p.id === pendingPoiId);
    if (!poi) return; // Leave pending set — re-fires when `pois` grows.
    handle.camera.focusOn(poi); // Task 2's unified focusOn.
    setPendingPoiId(null);
  }, [pendingPoiId, ready, pois, engineHandleRef]);

  // ── Effect 5: galaxy supersede ────────────────────────────────────────
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
  // matches the user's URL-pasted intent.  POI deep links resolve on
  // first paint (synchronous POI table), so no POI supersede is needed.
  useEffect(() => {
    if (focused !== null) setPendingTarget(null);
  }, [focused]);

  return { pendingTarget, pendingPoiId };
}
