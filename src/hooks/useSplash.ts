/**
 * useSplash — orchestrates the splash visibility, the readiness gate, the
 * "Continue anyway" escape, dismiss + reopen, and version-busted re-show.
 *
 * ### Why a separate hook
 *
 * App.tsx already wires six hooks.  The splash has its own state shape
 * (visibility, blocked, error, canContinueAnyway), its own derived
 * predicates (deep-link detection, readiness signal), and its own side
 * effects (localStorage persistence, 8 s timer).  Bolting all of that
 * onto App.tsx would push the file past its already-substantial size
 * and would scatter "splash logic" across the file.  A dedicated hook
 * gives the splash a single home with a clean public contract.
 *
 * ### Readiness signal
 *
 * The grill (Q4) resolved to "medium gating": the CTAs activate when
 *   1.  the engine is in `ready` state (WebGPU init done + first frame),
 *   2.  no catalog fetch is currently in flight (`loadProgress === null`),
 *   3.  famous-meta has settled (`famousMetaReady`).
 * The hook does NOT differentiate between Explore and Tour readiness —
 * both buttons activate together so the user never sees "Tour disabled,
 * Explore enabled" intermediate UI.  Famous-meta failure is treated as
 * "ready" downstream (the hook's input plumbing receives `ready=true`
 * from useFamousMeta in both success and error cases), but the splash
 * does render a disabled Tour tooltip — that's wired in Task 6's error
 * mapping plus the Splash component's disabled-state CSS.
 *
 * ### localStorage versioning
 *
 * Key: `skymap.splash.seenVersion` — an integer.  Hook reads on first
 * mount; if missing or lower than `CURRENT_SPLASH_VERSION`, splash is
 * shown.  Dismiss (either CTA) writes the current version; bumping
 * `CURRENT_SPLASH_VERSION` re-shows the splash to all returning users.
 * `reopen()` (called by the AboutPill) shows the splash WITHOUT touching
 * storage — informational reopens shouldn't reset the version stamp.
 *
 * ### Deep-link bypass
 *
 * A URL with `#focus=` or `?tour=` (see `hasDeepLink`) skips
 * the splash on first arrival and never auto-shows it.  About pill
 * `reopen()` still works.  Power-user gates (`?debug`, etc.) do NOT
 * count as deep links.
 *
 * ### 8 s "Continue anyway" timer
 *
 * Starts when the splash becomes visible AND blocked.  Fires once,
 * flipping `canContinueAnyway` to true so the splash can show the
 * escape link.  Cleared on unmount and re-armed if the splash is
 * reopened.  Does NOT fire when the splash isn't visible (deep-link
 * path) — the timer is a UX affordance for slow loads, not a global
 * timeout.
 *
 * ### SSR-safety
 *
 * `typeof window` guards wrap localStorage and location reads so unit
 * tests that render `useSplash` without a jsdom env don't blow up.
 * The deep-link helper itself takes plain strings — no `window`
 * dependency.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasDeepLink } from '../utils/url/hasDeepLink';
import type { UseSplashInput } from '../@types/splash/UseSplashInput';
import type { UseSplashReturn } from '../@types/splash/UseSplashReturn';
import type { SplashError } from '../@types/splash/SplashError';
import {
  CURRENT_SPLASH_VERSION,
  readSeenVersion,
  writeSeenVersion,
  readUrlAtMount,
} from '../state/ui/splashStorage';

// Re-export so existing importers (e.g. tests) don't need updating this task.
export { SPLASH_STORAGE_KEY, CURRENT_SPLASH_VERSION } from '../state/ui/splashStorage';

/** Milliseconds before the "Continue anyway" escape appears. */
export const CONTINUE_ANYWAY_DELAY_MS = 8_000;

export function useSplash(input: UseSplashInput): UseSplashReturn {
  const { status, loadProgress, famousMetaReady, famousMetaFailed = false } = input;

  // ── Initial visibility (snapshot at mount) ───────────────────────────────
  //
  // Three gates compose:
  //   1. Deep link present → never auto-show.
  //   2. Stored seenVersion >= CURRENT_SPLASH_VERSION → don't re-show.
  //   3. Otherwise → show.
  //
  // We capture once via a lazy initializer so the splash decision doesn't
  // flip mid-session if the user manually edits the URL.  `reopen()`
  // overrides this snapshot via the `userOpened` slot below.
  const [splashVisible, setSplashVisible] = useState<boolean>(() => {
    const { hash, search } = readUrlAtMount();
    if (hasDeepLink({ hash, search })) return false;
    const seen = readSeenVersion();
    if (seen !== null && seen >= CURRENT_SPLASH_VERSION) return false;
    return true;
  });

  // ── Readiness signal ─────────────────────────────────────────────────────
  //
  // The CTAs activate when the engine reports `ready`, no catalog fetches
  // are in flight, and famous-meta has settled.  `blocked` is the
  // negation — true while we're still waiting.
  const ready = useMemo(
    () => status.kind === 'ready' && loadProgress === null && famousMetaReady,
    [status, loadProgress, famousMetaReady],
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

  const dismissExplore = useCallback(() => {
    writeSeenVersion(CURRENT_SPLASH_VERSION);
    setSplashVisible(false);
  }, []);

  const dismissTour = useCallback(() => {
    writeSeenVersion(CURRENT_SPLASH_VERSION);
    setSplashVisible(false);
  }, []);

  const reopen = useCallback(() => {
    // Intentionally does NOT write seenVersion — reopening from the About
    // pill is informational, not a "first-time dismissal" event.
    setSplashVisible(true);
  }, []);

  // ── Error mapping ────────────────────────────────────────────────────────
  //
  // Engine errors (status.kind === 'error') take precedence over famous-meta
  // failures because an engine error blocks the whole app — the famous-meta
  // tooltip would be misleading next to a "catalog failed to load" headline.
  // We discriminate engine errors by inspecting the message: anything
  // mentioning "WebGPU" is reported as a webgpu-init failure (since the
  // synchronous "no navigator.gpu at all" case is handled in main.tsx, the
  // only thing left to surface here is the requestAdapter-returned-null
  // path).  Everything else is bucketed as a catalog fetch failure, which
  // is the dominant non-WebGPU error mode (a network blip on sdss.bin /
  // glade.bin / 2mrs.bin).
  const error = useMemo<SplashError | null>(() => {
    if (status.kind === 'error') {
      if (/webgpu/i.test(status.message)) {
        return { kind: 'webgpu-init-failed', message: status.message };
      }
      return { kind: 'catalog-fetch-failed', message: status.message };
    }
    if (famousMetaFailed) {
      return { kind: 'famous-meta-failed' };
    }
    return null;
  }, [status, famousMetaFailed]);

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
