/**
 * useSplash — orchestrates the splash visibility, the readiness gate,
 * dismiss + reopen, and version-busted re-show.
 *
 * ### Why a separate hook
 *
 * App.tsx already wires six hooks.  The splash has its own state shape
 * (visibility, blocked, error) and its own derived predicates (readiness
 * signal).
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
 * `SPLASH_SEEN_VERSION` persisted-value row, not here.
 *
 * ### Readiness signal
 *
 * The CTAs activate as soon as the engine is drawing (`loading` or `ready`),
 * not when the catalogs have finished. The boot downloads total tens of MB —
 * minutes on a slow mobile connection — while the opening view (Earth) needs
 * none of them: the sky fills in behind the visitor, and the HUD's loading bar
 * takes over from the splash's. Both buttons activate together.
 */

import { useCallback, useMemo } from 'react';
import type { UseSplashReturn } from '../@types/splash/UseSplashReturn';
import type { SplashError } from '../@types/splash/SplashError';
import { CURRENT_SPLASH_VERSION } from '../state/ui/splashStorage';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { selectSplashVisible } from '../state/ui/selectors';
import { selectEngineStatus } from '../state/engine/selectors';
import { dismissSplash, reopenSplash } from '../state/ui/uiSlice';

export function useSplash(): UseSplashReturn {
  const status = useAppSelector(selectEngineStatus);

  // ── Slice-backed visibility ───────────────────────────────────────────────
  //
  // The initial value is seeded by buildInitialUiState (deep-link / seen-
  // version gates applied at store construction).  Dismiss/reopen dispatch
  // into the same slice so any subscriber sees the same value.
  const splashVisible = useAppSelector(selectSplashVisible);
  const dispatch = useAppDispatch();

  const blocked = status.kind !== 'loading' && status.kind !== 'ready';

  // ── Dismiss + reopen ─────────────────────────────────────────────────────
  //
  // Both dismiss paths dispatch the same action — the version stamp is the
  // only thing that varies, and both CTAs stamp CURRENT_SPLASH_VERSION.
  // localStorage persistence is handled by the SPLASH_SEEN_VERSION
  // persisted-value row, not here.

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
    error,
    dismissExplore,
    dismissTour,
    reopen,
  };
}
