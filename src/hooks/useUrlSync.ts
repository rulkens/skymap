/**
 * useUrlSync — single owner of `window.location.hash`, keeping
 * `#focus=<id>` in lock-step with the Redux selection store.
 *
 * Two effects replace the old five:
 *
 *   A. Hash READ (mount + hashchange listener)
 *      Parses `#focus=<id>` from the URL on mount and on every
 *      subsequent hashchange. A match dispatches BOTH `requestSelect(id)`
 *      (pins the InfoCard) and `requestFocus(id)` (flies the camera), so
 *      arriving by URL looks the same as a scene click plus a fly.
 *      An empty or unrecognised hash dispatches `clearSelection()`,
 *      but ONLY on hashchange events (back/forward navigation) — not
 *      on the initial mount call, which would fire a spurious
 *      `clearSelection` on every normal page load. The two watch sagas
 *      own resolution and deferral.
 *
 *   B. URL WRITE (runs on every store read the hash depends on)
 *      Reads `selectFocusedFocusable` from the Redux store and
 *      derives the canonical hash body via `computeDesiredHash` +
 *      `URL_HASH_FOR`. Calls `history.pushState` only when the body
 *      actually differs.
 *
 *      It also reads `selectPendingFocusId` and publishes that id
 *      ahead of the resolved target. A `requestFocus` for a galaxy or
 *      star defers inside `resolveFocusRefDeferring` until its catalog
 *      pulses, so on a cold `#focus=<galaxy>` load the write would
 *      otherwise run against an empty focus slot and pushState the bare
 *      URL, destroying the deep link the visitor arrived on. Publishing
 *      the intent keeps the URL truthful across the resolve window;
 *      suppressing the write instead would leave a stale hash sitting on
 *      screen after a `clearSelection` that never resolves anything.
 *
 *      Its MOUNT pass is skipped — see the effect for why the snapshot it
 *      holds on that one commit is always the pre-read boot state.
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

import { useEffect, useRef } from 'react';
import type { FocusableTarget } from '../@types/engine/FocusableTarget';
import type { TimeState } from '../@types/time/TimeState';
import type { OrientationFrameId } from '../@types/camera/OrientationFrameId';
import { HASH_PARAM_SOURCES } from './hashParamSources';
import { parseHashParams } from '../utils/url/parseHashParams';
import { composeHashParams } from '../utils/url/composeHashParams';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectFocusedFocusable, selectPendingFocusId } from '../state/selection/selectors';
import { selectTimeState } from '../state/time/selectors';
import { selectOrientation } from '../state/settings/selectors';

// ── Pure helpers (re-exported for unit tests) ──────────────────────────────

export type DesiredHashInput = {
  focused: FocusableTarget | null;
  currentHash: string;
  // The id of a `requestFocus` that has not resolved yet, read by the `focus`
  // source's write so an in-flight intent still reaches the URL. Required rather
  // than optional (unlike `time`): a caller that forgets it composes a perfectly
  // valid bare hash and silently reintroduces the clobber, so the omission has to
  // be a type error rather than a plausible-looking URL.
  pendingFocusId: string | null;
  // The sim-clock intent, read by the `t` source's write to serialize a manual
  // instant. Optional so focus-only callers (and the existing focus tests) that
  // carry no clock still typecheck: a missing `time` means "no manual instant to
  // put on the URL", which the `t` source treats identically to live mode.
  time?: TimeState;
  // The camera orientation frame, read by the `orientation` source's write.
  // Required (unlike `time`): every caller derives it from the store, and a
  // missing frame has a well-defined default, so `undefined` would be a bug
  // rather than a meaningful "no orientation" state. A default-valued frame
  // simply composes no param.
  orientation: OrientationFrameId;
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
  const pendingFocusId = useAppSelector(selectPendingFocusId);
  const time = useAppSelector(selectTimeState);
  const orientation = useAppSelector(selectOrientation);

  // ── Effect A: hash READ → dispatch ───────────────────────────────────
  // Parse the URL once on mount and on every subsequent hashchange.
  // A `focus=<id>` match dispatches BOTH `requestSelect(id)` (pins the
  // InfoCard) and `requestFocus(id)` (flies the camera), so a URL arrival
  // looks the same as a scene click plus a fly.
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
  // Derives the canonical hash body from the store and writes it via
  // `pushState`. The no-op `matches` check prevents history-state churn
  // under noisy re-renders. The pending id (above) keeps a deferring focus
  // request on the URL for the whole resolve window.
  //
  // The MOUNT pass is skipped. On the mount commit this effect still holds
  // the render snapshot taken BEFORE Effect A ran, so every store read is
  // the boot value even though Effect A has just dispatched the URL's own
  // params — the body composes empty and pushState throws the deep link
  // away. Skipping costs nothing: at mount the store cannot know anything
  // the URL does not already carry, so the URL is the input on that commit,
  // not the output. Effect A's dispatches re-run this effect immediately
  // with real values. (The saga port gets this for free — the write fires
  // only on an action, so there is no start-up pass to suppress.)
  const mountPassDone = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!mountPassDone.current) {
      mountPassDone.current = true;
      return;
    }
    const { desiredHashBody, matches } = computeDesiredHash({
      focused,
      pendingFocusId,
      time,
      orientation,
      currentHash: window.location.hash,
    });
    if (matches) return;
    const base = window.location.pathname + window.location.search;
    const next = desiredHashBody ? `${base}#${desiredHashBody}` : base;
    window.history.pushState(null, '', next);
    // `time` is a dependency because the `t` source serializes the manual
    // instant: a re-anchor (pause, scrub, rate/direction change) produces a new
    // anchor object, so the write re-runs and crystallizes the new moment. Live
    // mode composes no `t`, so a live clock's coarse idle ticks cause no writes.
    // `orientation` is a dependency so an interactive frame switch re-writes the
    // hash (default composes no param, so switching to/from the default toggles
    // the `orientation` bytes on the URL).
    // `pendingFocusId` is a dependency so the write re-runs when a focus request
    // is filed AND again when it retires — the second run is what swaps the raw
    // requested id for the resolved target's canonical encoding.
    //
    // This array is the third of three hand-maintained parallel lists (the
    // `useAppSelector` calls and `DesiredHashInput`'s fields are the other two),
    // all saying "these are the store reads the write depends on". A missing
    // entry composes a valid hash and silently never writes. The saga port
    // deletes all three: `write` takes `RootState`, and the trigger set becomes
    // each source's own declaration.
  }, [focused, pendingFocusId, time, orientation]);
}
