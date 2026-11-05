/**
 * splashStorage — splash bootstrap inputs.
 *
 * Holds the current splash version and the mount-time URL that the initial
 * splash visibility decision reads. The persisted seen-version is the
 * `SPLASH_SEEN_VERSION` row in `src/state/persistedValues.ts`.
 *
 * Lives in the state layer (not beside useSplash) so buildInitialUiState can
 * read it without the store depending on the hooks layer.
 */

/**
 * Version stamp written to localStorage on dismiss.  Bump when meaningful
 * splash content changes — increments re-show the splash to returning
 * users on their next visit.
 */
export const CURRENT_SPLASH_VERSION = 1;

/**
 * Read the current URL hash + search, returning empty strings under SSR.
 * Captured lazily at store construction so the splash decision does not flip
 * mid-session if the user edits the URL bar after mount.
 */
export function readUrlAtMount(): { hash: string; search: string } {
  if (typeof window === 'undefined') return { hash: '', search: '' };
  return { hash: window.location.hash, search: window.location.search };
}
