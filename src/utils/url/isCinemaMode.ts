/**
 * isCinemaMode — is the page running under the `?cinema` URL flag?
 *
 * Cinema mode is the recorder's capture surface: App renders only the
 * canvas plus the tour overlay, the splash gate is skipped, and the
 * recorder hook installs itself on `window`. Those three call sites
 * (App's render branch, `buildInitialUiState`, the recorder bootstrap)
 * all need the same predicate — a named wrapper over
 * `hasUrlGate('cinema')` keeps the flag's spelling in one place instead
 * of three string literals that could drift.
 *
 * A plain function, not a hook: the recorder bootstrap runs outside
 * React, and the value can't change without a full page reload anyway,
 * so there is nothing to subscribe to.
 */

import { hasUrlGate } from './hasUrlGate';

export function isCinemaMode(): boolean {
  return hasUrlGate('cinema');
}
