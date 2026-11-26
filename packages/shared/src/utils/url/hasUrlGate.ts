/**
 * hasUrlGate — unified read of a boolean URL query-string flag.
 *
 * The skymap project uses URL-gated dev features (e.g. `?debug`,
 * `?gpuTimings`).  Before this helper landed, each call site spelled
 * the window read + parse boilerplate out; four copies of that was
 * one too many.  This helper collapses it to `hasUrlGate('foo')`.
 *
 * The parse itself (presence semantics + malformed-string
 * defensiveness) lives in the pure `searchHasGate`; this wrapper
 * adds only the live `window.location.search` read. The
 * `typeof window === 'undefined'` guard covers SSR-like environments,
 * and the `?.search ?? ''` optional-chain covers the narrower case of
 * minimal-jsdom shims that have a `window` but lack `location`.
 *
 * ### Why "has", not "get"
 *
 * Every existing gate (and the new `gpuTimings` gate) is a bare-flag:
 * the param's *presence* matters, the value is ignored.  Returning
 * the parsed value would force every caller to coerce again.  When
 * a future feature genuinely needs the value, add a parallel
 * `urlGateValue(name): string | null` rather than overloading this.
 */

import { searchHasGate } from './searchHasGate';

export function hasUrlGate(name: string): boolean {
  if (typeof window === 'undefined') return false;
  return searchHasGate(window.location?.search ?? '', name);
}
