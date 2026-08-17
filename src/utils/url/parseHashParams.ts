/**
 * parseHashParams — decode a URL hash *body* into an ordered key→value map.
 *
 * The "body" is the hash with its leading `#` already stripped by the caller
 * (`readHashBody` for `watchHashReadSaga`, an inline strip for `hasDeepLink`).
 * A body is a run of `&`-separated `key=value` pairs:
 *
 *   'focus=body-jupiter'          → { focus: 'body-jupiter' }
 *   'focus=body-jupiter&t=2026…'  → { focus: 'body-jupiter', t: '2026…' }
 *   ''                            → {}  (empty map)
 *
 * ──────────────────────────────────────────────────────────────────────
 * Encoding policy — raw passthrough, split on the FIRST `=`
 * ──────────────────────────────────────────────────────────────────────
 * Today's real hashes are raw and un-encoded: `focus=body-jupiter`,
 * `focus=cluster-virgo-m87`. We deliberately do NOT run
 * `decodeURIComponent` on keys or values — doing so would change the bytes
 * of every existing deep link (`+` → space, `%` handling, etc.) and break
 * copy-pasted URLs that were never encoded in the first place. Keys and
 * values pass through verbatim.
 *
 * Each pair is split on its FIRST `=` only, so a value may itself contain
 * `=` (ISO timestamps carry none, but ids could in principle) without the
 * split mangling it. A segment with no `=` becomes `key → ''`. Empty
 * segments (e.g. from a stray `&&`) are skipped.
 *
 * Insertion order follows the body's left-to-right order; the returned Map
 * preserves it, and `composeHashParams` relies on that to round-trip.
 */

export function parseHashParams(body: string): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  if (body.length === 0) return out;
  for (const segment of body.split('&')) {
    if (segment.length === 0) continue;
    const eq = segment.indexOf('=');
    if (eq === -1) {
      out.set(segment, '');
    } else {
      out.set(segment.slice(0, eq), segment.slice(eq + 1));
    }
  }
  return out;
}
