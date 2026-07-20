/**
 * isPerfMode — is the page running under the `?perf` URL flag?
 *
 * Perf mode is the performance-harness capture surface: it turns on the
 * GPU timing service without also requiring the developer-facing
 * `?gpuTimings` gate, so a perf run collects per-slot timings by URL alone.
 * The live-read call sites share this wrapper so the flag's spelling lives
 * in one place; the decision itself is the pure `isPerfSearch`, which
 * callers holding a URL capture use directly instead of a hidden live read.
 *
 * A plain function, not a hook: the value can't change without a full page
 * reload, so there is nothing to subscribe to. The `window` guard mirrors
 * `hasUrlGate`'s SSR defensiveness.
 */

import { isPerfSearch } from './isPerfSearch';

export function isPerfMode(): boolean {
  if (typeof window === 'undefined') return false;
  return isPerfSearch(window.location.search);
}
