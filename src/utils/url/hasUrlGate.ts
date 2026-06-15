/**
 * hasUrlGate — unified read of a boolean URL query-string flag.
 *
 * The skymap project uses URL-gated dev features (e.g. `?debug`,
 * `?gpuTimings`).  Before this helper landed, each call site spelled
 * the predicate out:
 *
 *   typeof window !== 'undefined' &&
 *     (() => { try { return new URLSearchParams(window.location.search).has('foo'); }
 *              catch { return false; } })()
 *
 * Four copies of that boilerplate is one too many.  This helper
 * collapses it to `hasUrlGate('foo')`.
 *
 * ### Defensiveness
 *
 *   - `typeof window === 'undefined'` guards SSR-like environments
 *     (jsdom has window, but be defensive — vitest unit-test runs
 *     sometimes inject minimal-jsdom shims that lack `location`).
 *   - The try/catch absorbs the (rare) `URLSearchParams` throw on
 *     malformed search strings.  In practice this never fires in a
 *     real browser; the catch exists for paranoia and ergonomics —
 *     callers shouldn't have to defend against URL parsing failures
 *     for a debug toggle.
 *
 * ### Why "has", not "get"
 *
 * Every existing gate (and the new `gpuTimings` gate) is a bare-flag:
 * the param's *presence* matters, the value is ignored.  Returning
 * the parsed value would force every caller to coerce again.  When
 * a future feature genuinely needs the value, add a parallel
 * `urlGateValue(name): string | null` rather than overloading this.
 */

export function hasUrlGate(name: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has(name);
  } catch {
    return false;
  }
}
