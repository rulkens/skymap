/**
 * Catalogue-id pattern: ANYTHING that matches is treated as a
 * designation (M31, NGC 6946, IC 342, UGC 7772, C45, …) rather than
 * a "proper name".  Used by `pickProperName` to surface human-
 * readable names like "Andromeda Galaxy" on the featured-grid card
 * face when one is available.
 *
 * The pattern is deliberately liberal — extra prefixes (Arp, Mrk,
 * MCG, ESO, …) all read as catalog ids and are filtered out.  The
 * one false-positive risk is "M-named" galaxies whose proper name
 * happens to start with "M" too, but those don't exist in our seed.
 */
const DESIGNATION_RE =
  /^(M\s*\d+|C\s*\d+|NGC\s*\d+|IC\s*\d+|UGC\s*\d+|UGCA\s*\d+|PGC\s*\d+|MCG[\s-]?[+-]?\d|ESO\s*\d|Arp\s*\d|Mrk\s*\d)/i;

export function pickProperName(names: readonly string[]): string {
  for (const n of names) {
    if (!DESIGNATION_RE.test(n.trim())) return n;
  }
  return names[0] ?? '?';
}
