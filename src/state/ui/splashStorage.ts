/**
 * splashStorage — splash bootstrap I/O.
 *
 * Holds the persisted seen-version and the mount-time URL that the initial
 * splash visibility decision reads, with SSR + private-browsing guards.
 *
 * ### Why a separate module
 *
 * Originally these functions lived inside useSplash.ts. That caused a layering
 * inversion: buildInitialUiState (state layer) needed to call them to seed the
 * Redux store, but they were defined inside the hooks layer. Importing from
 * hooks into state is the wrong direction — the store should not depend on
 * React. Moving I/O here lets the state layer read them without touching hooks,
 * and useSplash can import them back, which is the correct hooks → state
 * direction.
 */

/** Persisted storage key — never rename without a migration. */
export const SPLASH_STORAGE_KEY = 'skymap.splash.seenVersion';

/**
 * Version stamp written to localStorage on dismiss.  Bump when meaningful
 * splash content changes — increments re-show the splash to returning
 * users on their next visit.
 */
export const CURRENT_SPLASH_VERSION = 1;

/**
 * Read seenVersion from localStorage.  Returns null when the key is absent,
 * the value is non-integer, or the environment is SSR / private-browsing.
 * Null means "not seen" — no 0-sentinel magic needed.
 */
export function readSeenVersion(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SPLASH_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Write seenVersion to localStorage.  Swallows storage errors silently. */
export function writeSeenVersion(version: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SPLASH_STORAGE_KEY, String(version));
  } catch {
    // Private browsing or storage quota — best-effort; the splash will
    // re-show next time, which is acceptable degraded behaviour.
  }
}

/**
 * Read the current URL hash + search, returning empty strings under SSR.
 * Captured lazily at store construction so the splash decision does not flip
 * mid-session if the user edits the URL bar after mount.
 */
export function readUrlAtMount(): { hash: string; search: string } {
  if (typeof window === 'undefined') return { hash: '', search: '' };
  return { hash: window.location.hash, search: window.location.search };
}
