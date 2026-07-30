/**
 * composeHashParams — encode an ordered key→value map back into a URL hash
 * *body* (no leading `#`; the caller prepends it).
 *
 * The inverse of `parseHashParams`:
 *
 *   { focus: 'body-jupiter' }               → 'focus=body-jupiter'
 *   { focus: 'body-jupiter', t: '2026…' }   → 'focus=body-jupiter&t=2026…'
 *   {}                                      → ''  (empty body)
 *
 * ──────────────────────────────────────────────────────────────────────
 * Stable key order = Map insertion order
 * ──────────────────────────────────────────────────────────────────────
 * We emit pairs in the Map's iteration order (which is insertion order).
 * The hash layout is therefore fully determined by the order in which the
 * caller populates the map — B2's param-source table order fixes the
 * on-URL layout deterministically, so two identical states always compose
 * to byte-identical hashes.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Encoding policy — raw passthrough
 * ──────────────────────────────────────────────────────────────────────
 * Keys and values are written verbatim: no `encodeURIComponent`. Today's
 * hashes (`focus=body-jupiter`) are raw, and encoding them would change the
 * bytes of every existing deep link. This mirrors `parseHashParams`, so
 * `compose(parse(x)) === x` for any body this module produces.
 */

export function composeHashParams(params: ReadonlyMap<string, string>): string {
  const pairs: string[] = [];
  for (const [key, value] of params) {
    pairs.push(`${key}=${value}`);
  }
  return pairs.join('&');
}
