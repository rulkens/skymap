/**
 * isPerfSearch — does a URL search string carry the `?perf` flag?
 *
 * The pure core of the perf-mode predicate: it takes the search string as
 * an argument instead of reading `window.location` itself, so callers that
 * already hold a URL capture can make their decision a pure function of that
 * capture — no hidden live read that could disagree with the captured value.
 * `isPerfMode()` is the convenience wrapper that feeds it the live
 * `window.location.search`.
 *
 * No parsing of its own: it binds the shared pure core `searchHasGate` (the
 * same one `hasUrlGate` reads through) to the 'perf' flag, so this file
 * only pins the flag's spelling.
 */

import { searchHasGate } from './searchHasGate';

export function isPerfSearch(search: string): boolean {
  return searchHasGate(search, 'perf');
}
