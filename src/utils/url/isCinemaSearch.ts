/**
 * isCinemaSearch — does a URL search string carry the `?cinema` flag?
 *
 * The pure core of the cinema-mode predicate: it takes the search string as
 * an argument instead of reading `window.location` itself, so callers that
 * already hold a URL capture (buildInitialUiState's `readUrlAtMount()`) can
 * make their decision a pure function of that capture — no hidden live read
 * that could disagree with the captured value. `isCinemaMode()` is the
 * convenience wrapper that feeds it the live `window.location.search`.
 *
 * No parsing of its own: it binds the shared pure core `searchHasGate` (the
 * same one `hasUrlGate` reads through) to the 'cinema' flag, so this file
 * only pins the flag's spelling.
 */

import { searchHasGate } from './searchHasGate';

export function isCinemaSearch(search: string): boolean {
  return searchHasGate(search, 'cinema');
}
