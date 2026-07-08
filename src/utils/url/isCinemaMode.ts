/**
 * isCinemaMode — is the page running under the `?cinema` URL flag?
 *
 * Cinema mode is the recorder's capture surface: App renders only the
 * canvas plus the tour overlay, the splash gate is skipped, and the
 * recorder hook installs itself on `window`. The live-read call sites
 * (App's render branch, the recorder bootstrap) share this wrapper so
 * the flag's spelling lives in one place; the decision itself is the
 * pure `isCinemaSearch`, which callers holding a URL capture (e.g.
 * `buildInitialUiState`) use directly instead of a hidden live read.
 *
 * A plain function, not a hook: the recorder bootstrap runs outside
 * React, and the value can't change without a full page reload anyway,
 * so there is nothing to subscribe to. The `window` guard mirrors
 * `hasUrlGate`'s SSR defensiveness.
 */

import { isCinemaSearch } from './isCinemaSearch';

export function isCinemaMode(): boolean {
  if (typeof window === 'undefined') return false;
  return isCinemaSearch(window.location.search);
}
