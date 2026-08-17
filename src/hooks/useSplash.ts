/**
 * useSplash — orchestrates the splash visibility, the readiness gate, the
 * "Continue anyway" escape, dismiss + reopen, and version-busted re-show.
 *
 * ### Why a separate hook
 *
 * App.tsx already wires six hooks.  The splash has its own state shape
 * (visibility, blocked, error, canContinueAnyway), its own derived
 * predicates (readiness signal), and its own side effects (8 s timer).
 * Bolting all of that onto App.tsx would push the file past its already-
 * substantial size and would scatter "splash logic" across the file.  A
 * dedicated hook gives the splash a single home with a clean public contract.
 *
 * ### Slice-backed visibility
 *
 * `splashVisible` is read from the `ui` Redux slice via `selectSplashVisible`.
 * Dismiss (either CTA) dispatches `dismissSplash(CURRENT_SPLASH_VERSION)`,
 * which atomically writes `visible: false` and records the version.  Reopen
 * dispatches `reopenSplash()`, which sets `visible: true` without touching
 * `dismissedVersion` (reopening is informational, not a first-time event).
 *
 * The first-visit / deep-link / seen-version decision is seeded once into the
 * slice by `buildInitialUiState` at store construction.  localStorage
 * persistence (writing `seenVersion` on dismiss) is handled by the
 * `persistSplashVersion` store effect, not here.
 *
 * ### Readiness signal
 *
 * The CTAs activate when
 *   1.  the engine is in `ready` state (WebGPU init done + first frame), and
 *   2.  no catalog fetch is currently in flight (`loadProgress === null`).
 * The hook does NOT differentiate between Explore and Tour readiness —
 * both buttons activate together so the user never sees "Tour disabled,
 * Explore enabled" intermediate UI.
 *
 * **Why famous-galaxies-meta is not a third condition.** The sidecar loads through its
 * asset slot, and that slot's demand is conditional: it waits for the
 * famous-galaxy `.bin` to leave `idle`, which in turn requires
 * `galaxyCatalogs.items.famousGalaxy.enabled`. With that category switched off
 * the slot never loads and never reports, so a readiness flag derived from it
 * would never settle — stranding the CTAs behind the 8 s escape hatch for a
 * payload that was never coming. Gating on a signal that can legitimately never
 * arrive is worse than not gating: the Tour may open before its InfoCard text
 * exists, which degrades one panel, where the alternative blocks the whole
 * entry point.
 *
 * `status` and `loadProgress` are read from the Redux engine slice via
 * `useAppSelector` rather than threaded in as props.
 *
 * ### 8 s "Continue anyway" timer
 *
 * Starts when the splash becomes visible AND blocked.  Fired once,
 * flipping `canContinueAnyway` to true so the splash can show the
 * escape link.  Cleared on unmount and re-armed if the splash is
 * reopened.  Does NOT fire when the splash isn't visible (deep-link
 * path) — the timer is a UX affordance for slow loads, not a global
 * timeout.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UseSplashReturn } from '../@types/splash/UseSplashReturn';
import type { SplashError } from '../@types/splash/SplashError';
import { CURRENT_SPLASH_VERSION } from '../state/ui/splashStorage';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { selectSplashVisible } from '../state/ui/selectors';
import { selectEngineStatus, selectLoadProgress } from '../state/engine/selectors';
import { dismissSplash, reopenSplash } from '../state/ui/uiSlice';

/** Milliseconds before the "Continue anyway" escape appears. */
export const CONTINUE_ANYWAY_DELAY_MS = 8_000;

export function useSplash(): UseSplashReturn {
  // ── Engine state from the Redux slice ────────────────────────────────────
  //
  // `status` and `loadProgress` come from the engine slice rather than being
  // threaded in as input props.  The engine dispatches `engineStatusChanged`
  // and `engineLoadProgressChanged`; these selectors read the accumulated
  // result so every subscriber sees a consistent snapshot.
  const status = useAppSelector(selectEngineStatus);
  const loadProgress = useAppSelector(selectLoadProgress);

  // ── Slice-backed visibility ───────────────────────────────────────────────
  //
  // The initial value is seeded by buildInitialUiState (deep-link / seen-
  // version gates applied at store construction).  Dismiss/reopen dispatch
  // into the same slice so any subscriber sees the same value.
  const splashVisible = useAppSelector(selectSplashVisible);
  const dispatch = useAppDispatch();

  // ── Readiness signal ─────────────────────────────────────────────────────
  //
  // The CTAs activate when the engine reports `ready` and no catalog fetches
  // are in flight.  `blocked` is the negation — true while we're still waiting.
  const ready = useMemo(
    () => status.kind === 'ready' && loadProgress === null,
    [status, loadProgress],
  );
  const blocked = !ready;

  // ── 8 s "Continue anyway" timer ──────────────────────────────────────────
  //
  // Starts when the splash is visible AND blocked.  Cleared on unmount and
  // re-armed if the splash is reopened.  Does not fire if the splash is
  // not visible (deep-link path).
  const [canContinueAnyway, setCanContinueAnyway] = useState(false);
  useEffect(() => {
    if (!splashVisible || !blocked) {
      // Re-arm when the splash becomes visible again (reopen flow).
      // We don't reset `canContinueAnyway` on the unblocked path because
      // the splash hides itself on dismiss anyway; whether the link was
      // ever visible doesn't matter after that.
      return;
    }
    const t = setTimeout(() => setCanContinueAnyway(true), CONTINUE_ANYWAY_DELAY_MS);
    return () => clearTimeout(t);
  }, [splashVisible, blocked]);

  // Reset canContinueAnyway when the splash is reopened so the link
  // appears again only after another 8 s if loading is somehow slow
  // again (rare — content is cached — but cheap to handle).
  useEffect(() => {
    if (!splashVisible) setCanContinueAnyway(false);
  }, [splashVisible]);

  // ── Dismiss + reopen ─────────────────────────────────────────────────────
  //
  // Both dismiss paths dispatch the same action — the version stamp is the
  // only thing that varies, and both CTAs stamp CURRENT_SPLASH_VERSION.
  // localStorage persistence is handled by the persistSplashVersion store
  // effect, not here.

  const dismissExplore = useCallback(
    () => dispatch(dismissSplash(CURRENT_SPLASH_VERSION)),
    [dispatch],
  );

  const dismissTour = useCallback(
    () => dispatch(dismissSplash(CURRENT_SPLASH_VERSION)),
    [dispatch],
  );

  const reopen = useCallback(() => dispatch(reopenSplash()), [dispatch]);

  // ── Error mapping ────────────────────────────────────────────────────────
  //
  // `cause` is checked first: `installFormatVersionAlert` sets it to
  // `'format-version'` on a machine-readable status, so a version mismatch is
  // discriminated without touching the message at all. Everything else falls
  // through to the existing message-sniffing split: anything mentioning
  // "WebGPU" is a webgpu-init failure (the synchronous "no navigator.gpu at
  // all" case is handled in main.tsx before React mounts, so the only thing
  // left to surface here is the requestAdapter-returned-null path); the rest
  // is bucketed as a catalog fetch failure, the dominant non-WebGPU error mode
  // (a network blip on sdss.bin / glade.bin / 2mrs.bin).
  const error = useMemo<SplashError | null>(() => {
    if (status.kind === 'error') {
      if (status.cause === 'format-version') {
        return { kind: 'data-version-mismatch', message: status.message };
      }
      if (/webgpu/i.test(status.message)) {
        return { kind: 'webgpu-init-failed', message: status.message };
      }
      return { kind: 'catalog-fetch-failed', message: status.message };
    }
    return null;
  }, [status]);

  return {
    splashVisible,
    blocked,
    canContinueAnyway,
    error,
    dismissExplore,
    dismissTour,
    reopen,
  };
}
