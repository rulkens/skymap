/**
 * `usePoiUrlSync` — keep `window.location.hash` in lock-step with the
 * currently-focused POI (cluster / supercluster / void / famous-galaxy
 * anchor), and surface deep-link arrivals back to the App as a
 * `pendingPoiId` it can resolve once the POI table is populated.
 *
 * Sister hook to `useFocusUrlSync` (the galaxy version).  Two URL
 * schemes coexist:
 *
 *   - `#focus=<galaxyId>` — owned by `useFocusUrlSync`.
 *   - `#poi=<poiId>`     — owned by this hook.
 *
 * Each hook is responsible for only ever writing to its own segment of
 * the hash and leaving the other one alone.  Effect 2 below enforces
 * this by reading `location.hash` first and skipping the write entirely
 * when the current body looks like a `#focus=…` (i.e. is owned by the
 * other hook).  The galaxy hook honours the same etiquette by computing
 * a desired body for its own scheme only; an empty/null POI selection
 * therefore won't clobber a coexisting `#focus=…` set by the user.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Three internal effects (same shape as useFocusUrlSync)
 * ──────────────────────────────────────────────────────────────────────
 *   1. **Mount capture + popstate** — parse `location.hash`; if it's
 *      `#poi=<id>` set `pendingPoiId`.  Re-fires on Back/Forward via
 *      a `popstate` listener.  Pending stays set until the drain
 *      resolves or the user navigates back to an empty hash.
 *
 *   2. **focusedPoiId → URL** — when the React mirror of the focused
 *      POI changes, write `#poi=<id>` via `pushState` (or clear via a
 *      no-hash URL on a null selection).  Guards:
 *        - Skip while `pendingPoiId !== null` so a still-resolving
 *          deep link isn't overwritten by `''` before the drain has
 *          had a chance to dispatch.
 *        - Skip when the current hash is a `#focus=…` body — that's
 *          the sister hook's territory; we never touch it.
 *
 *   3. **Drain** — once the engine is `'ready'` AND the POI table has
 *      at least one entry, look up `pendingPoiId` in the table and call
 *      `engine.camera.focusOnPoi(poi)`.  If the id isn't in the table
 *      we LEAVE pending set (a future `pois` change — e.g. famous
 *      anchors finishing async load — re-fires this effect, giving the
 *      drain another shot).  Clearing pending only on a successful
 *      resolve preserves "deep-link wins" semantics: a casual click
 *      that happens during loading doesn't suppress the pending id.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why `pushState` (not `replaceState`)?
 * ──────────────────────────────────────────────────────────────────────
 * Same rationale as `useFocusUrlSync`: focusing a POI is a
 * navigational act — the user expects Back to return them to the
 * previous selection.  `pushState` adds one history entry per
 * commit, and the popstate listener above translates Back/Forward
 * presses into the same `pendingPoiId` mechanism the initial mount
 * uses.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why no React-side supersede effect (unlike useFocusUrlSync)?
 * ──────────────────────────────────────────────────────────────────────
 * The galaxy hook clears `pendingTarget` on a focused-galaxy commit so
 * that a user click during loading pre-empts a still-resolving deep
 * link.  For POIs the table is small and synchronously available (the
 * static anchors don't await any async load), so a deep-link arrival
 * resolves on first paint — there's no meaningful "still loading" window
 * during which a user click could race the drain.  If a future change
 * gates the drain on async POI data (famous-galaxy POIs), revisit and
 * add a supersede effect keyed on `focusedPoiId` matching the spec
 * here.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Testing
 * ──────────────────────────────────────────────────────────────────────
 * The project's vitest config runs in `node` (no DOM), so this hook —
 * which is pure DOM glue around the `parsePoiHash` / `poiIdToHash`
 * codec — has no direct unit tests.  The interesting branches all live
 * in the codec (`tests/services/url/poiUrl.test.ts`) and the static
 * anchor builder (`tests/data/buildStaticAnchorPois.test.ts`); this
 * file's behaviour is verified manually via the Task 15 smoke test.
 *
 * ──────────────────────────────────────────────────────────────────────
 * SSR safety
 * ──────────────────────────────────────────────────────────────────────
 * Every `window`/`history` access is wrapped in `typeof window !==
 * 'undefined'`.  Skymap doesn't SSR today, but the guards keep the
 * hook safe to import from any context that pre-evaluates modules in
 * node (vitest, type-check tooling).
 */

import { useEffect, useRef, useState } from 'react';
import { parsePoiHash, poiIdToHash } from '../services/url/poiUrl';
import type { UsePoiUrlSyncInput } from '../@types/engine/UsePoiUrlSyncInput';
import type { PoiSyncReturn } from '../@types/engine/PoiSyncReturn';

export function usePoiUrlSync(input: UsePoiUrlSyncInput): PoiSyncReturn {
  const { focusedPoiId, ready, pois, engineHandleRef } = input;
  const [pendingPoiId, setPendingPoiId] = useState<string | null>(null);

  // ── 1. Mount capture + popstate listener ────────────────────────────────
  // Parse the URL once on mount; install a `popstate` listener so
  // Back/Forward presses also drive `pendingPoiId` through the same
  // resolution path.  An empty / non-`#poi=` hash resets pending to
  // null — but we deliberately do NOT call any "clear POI selection"
  // engine method here (unlike `useFocusUrlSync`, which clears the
  // galaxy selection on a back-to-empty pop).  The POI subsystem's
  // selection mirroring lives entirely on the React-side state via
  // `onPoiFocusChange`; nothing on the engine needs to be told.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // SSR guard before flipping the ref: if this ever ran in a Node
    // render (we don't SSR today, but the guard is cheap), we want the
    // client-side hydration pass to still mount cleanly rather than be
    // short-circuited by a ref flipped during render.
    if (mountedRef.current) return;
    mountedRef.current = true;

    const id = parsePoiHash(window.location.hash);
    if (id) setPendingPoiId(id);

    const onPopState = () => {
      const i = parsePoiHash(window.location.hash);
      setPendingPoiId(i);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // engineHandleRef is a ref — its identity doesn't change.  The
    // empty deps array is intentional: this effect mounts once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. focusedPoiId → URL ───────────────────────────────────────────────
  // Mirror the React-side focused-POI state into `location.hash`.  The
  // two skip-guards have very different jobs:
  //
  //   - `pendingPoiId !== null` — there's a still-resolving deep link
  //     in flight; writing the desired body now would clobber it before
  //     the drain dispatches.  Wait for the drain to clear pending,
  //     then the next render writes the right body.
  //
  //   - `currentBody` starts with `focus=` — the sister `useFocusUrlSync`
  //     owns this segment.  Stepping on it would force a galaxy
  //     deselection on the next paint when the galaxy hook reconciles.
  //     We only ever write the hash when it's empty or already a `#poi=`
  //     body.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pendingPoiId !== null) return;

    const desiredBody = focusedPoiId ? poiIdToHash(focusedPoiId) : '';
    const currentBody = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;

    // Don't fight a coexisting `#focus=…` set by the galaxy hook —
    // that segment is the sister hook's territory.  Any other prefix
    // (or empty) is fair game for us to write.
    const hashIsPoiOrEmpty = currentBody === '' || currentBody.startsWith('poi=');
    if (!hashIsPoiOrEmpty) return;
    if (currentBody === desiredBody) return;

    const base = window.location.pathname + window.location.search;
    const next = desiredBody ? `${base}#${desiredBody}` : base;
    window.history.pushState(null, '', next);
  }, [focusedPoiId, pendingPoiId]);

  // ── 3. Drain ────────────────────────────────────────────────────────────
  // Resolve `pendingPoiId` against the POI table once the engine is
  // ready.  We deliberately do NOT clear pending when the id isn't
  // found — a tier swap or async famous-meta load can add entries
  // later, and re-firing the drain on `pois` changes will pick them
  // up.  Clearing only on a successful resolve preserves the
  // "deep-link arrival waits as long as it takes" contract.
  useEffect(() => {
    if (!pendingPoiId) return;
    if (!ready) return;
    if (pois.length === 0) return;
    const handle = engineHandleRef.current;
    if (!handle) return;

    const poi = pois.find((p) => p.id === pendingPoiId);
    if (!poi) return;

    handle.camera.focusOnPoi(poi);
    setPendingPoiId(null);
  }, [pendingPoiId, ready, pois, engineHandleRef]);

  return { pendingPoiId };
}
