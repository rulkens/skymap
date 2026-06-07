/**
 * poiUrl — codec for the `#poi=<id>` hash that makes a POI (cluster,
 * supercluster, void, wall) selection shareable.  Pure functions only —
 * no DOM access, no React, no engine coupling — so the codec is testable
 * in isolation and reusable from both the client mount path and
 * tooling/tests.
 *
 * Sister module to `focusUrl.ts` (the galaxy version); deliberately kept
 * as its own file so the two URL schemes can evolve independently.
 * E.g. a future `#poi=<id>&tour=play` query-like extension wouldn't
 * touch the galaxy hash, and vice versa.  The alternative — merging
 * both into a single `urlHash.ts` codec — would couple unrelated
 * features and force every change to reason about both schemes at once.
 *
 * The id is the literal `StructureRecord.id` (e.g. `virgo-m87`,
 * `hercules-sc`, `bootes-void`).  POI ids are curated and stable across
 * rebuilds (they live in `data/structure_anchors.seed.json`), so encoding
 * them directly is safe — unlike galaxies, there's no priority ladder to
 * navigate (no `famous > pgc > sdss > pos` cascade).
 *
 * Character class: `[a-z0-9_-]+`, matching `focusUrl`'s famous-id
 * fallback.  Rejects whitespace, angle brackets, percent-encoded payload
 * — anything that wouldn't appear in a legitimate POI id and that could
 * otherwise smuggle markup into the URL bar on shared links.
 *
 * Why a hash, not a query string?  Same reason as `focusUrl`: the app
 * is hosted on Cloudflare Workers Assets with a single static shell.
 * The hash never reaches the server, so it's pure-frontend with no
 * infra changes.
 */

/**
 * Strict regex for the POI id body.  Anchored at both ends, so trailing
 * garbage (e.g. `virgo-m87?tour`) is rejected.  Matches the same
 * character class as `focusUrl`'s famous-id fallback for consistency.
 */
const POI_ID_RE = /^[a-z0-9_-]+$/i;

/**
 * Parse a `window.location.hash` string into a POI id.  Returns null
 * for anything we can't confidently route — the caller treats null as
 * "no deep link, render as if the URL were clean".
 *
 * Accepts hash strings with or without the leading `#`, so this is
 * easy to call from both `location.hash` (which includes `#`) and
 * test fixtures (which often don't).
 */
export function parsePoiHash(hash: string): string | null {
  if (!hash) return null;
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!trimmed) return null;

  // We expect exactly `poi=<value>`.  The `=` split lets us validate
  // the key without running a regex on every hash; non-poi hashes
  // (e.g. `#about`, `#focus=m31`) bail out cheaply.
  const eq = trimmed.indexOf('=');
  if (eq < 0 || trimmed.slice(0, eq) !== 'poi') return null;

  // `decodeURIComponent` throws `URIError` on malformed percent-escapes
  // (e.g. a truncated `%E0%A4`).  Catch and return null so the codec's
  // "null on anything we can't confidently route" contract holds even
  // for users pasting half-copied URLs.
  let raw: string;
  try {
    raw = decodeURIComponent(trimmed.slice(eq + 1));
  } catch {
    return null;
  }
  if (!raw || !POI_ID_RE.test(raw)) return null;
  return raw;
}

/**
 * Build the `poi=<id>` payload (the bit after `#`) for the given POI id.
 *
 * The caller is responsible for prepending `#` when assigning to
 * `location.hash` directly — returning the bare body matches
 * `focusUrl`'s shape and keeps the codec composable (e.g. a future
 * caller wanting `#poi=<id>&tour=play` can append without splicing).
 *
 * No URL-encoding needed — the POI_ID_RE character class is entirely
 * hash-safe (no `#`, `?`, `&`, `%`, or whitespace).  If a future POI
 * id ever breaks that assumption, the parser-side regex will reject
 * the round-trip, so the test suite is the safety net.
 */
export function poiIdToHash(poiId: string): string {
  return `poi=${poiId}`;
}
