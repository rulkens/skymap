/**
 * searchHasGate — does a URL search string carry the named boolean gate?
 *
 * The pure core both gate predicates share: `hasUrlGate` wraps it with the
 * live `window.location.search` read, `isCinemaSearch` binds it to the
 * 'cinema' flag over a caller-supplied capture. Keeping the parse here means
 * the two can never drift on what "present" means (bare `?foo` and valued
 * `?foo=1` both count — `URLSearchParams.has`, presence not value).
 *
 * A malformed search string returns false rather than throwing: the callers
 * sit in paths that must not die on a bad URL — App's render branch and the
 * store-seed ladder — and for a boolean gate, "unparseable" and "absent" are
 * the same answer. In practice URLSearchParams throws essentially never in a
 * real browser; the catch is paranoia the callers shouldn't each re-buy.
 */

export function searchHasGate(search: string, gate: string): boolean {
  try {
    return new URLSearchParams(search).has(gate);
  } catch {
    return false;
  }
}
