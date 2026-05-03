/**
 * wikipediaSummary — pure parser for Wikipedia REST `/page/summary/` JSON.
 *
 * Endpoint:
 *
 *   https://en.wikipedia.org/api/rest_v1/page/summary/<URL-encoded title>
 *
 * The response is JSON.  We care about exactly two fields:
 *
 *  - `extract` — a 1-3 sentence plain-text summary, ideal as our InfoCard
 *    description for a galaxy without a hand-curated blurb.
 *  - `type` — `"standard"` for an actual article, `"disambiguation"` for
 *    a "May refer to…" page.  We never want a disambiguation extract:
 *    they're useless prose like "Andromeda may refer to…".
 *
 * We additionally reject any extract that begins with the string
 * "may refer to" (case-insensitive) as a defensive fallback — the REST
 * API has historically been inconsistent about whether `type` is set for
 * older disambiguation pages.
 *
 * ---
 *
 * ### Why a parser separate from a fetcher?
 *
 * Same testability rationale as `hyperledaMeandata.ts`: the parser is a
 * pure string → result function, fed into the consumer via dependency
 * injection.  The CLI script wires up real `fetch()` and on-disk caching;
 * the test wires up a fake fetcher returning canned JSON strings.
 *
 * ### Why no try/catch around the JSON.parse?
 *
 * If Wikipedia returns garbage (HTML 503 page, etc.), we want a loud
 * `SyntaxError: Unexpected token` rather than swallowing the response.
 * The retry / fallback logic lives in the consumer, which can decide
 * whether to fall back to the next title or give up.
 */

/**
 * The shape we extract from a Wikipedia summary response.  Both fields
 * are guaranteed to be strings — empty when missing or invalid.
 */
export type WikipediaSummary = {
  /** The 1-3 sentence article extract.  Empty string when unusable. */
  extract: string;
  /**
   * The article's canonical title (post-redirect resolution).  Empty
   * string when missing.  Useful for logging which Wikipedia article we
   * actually landed on after the REST API resolved redirects.
   */
  title: string;
};

/**
 * Parse a Wikipedia summary response.  Returns the structured fields
 * with empty strings for missing values.  Disambiguation pages return
 * `{ extract: '', title: '<resolved title>' }` — the title survives so
 * the caller can log it, but `extract` is intentionally cleared so the
 * caller's "extract is empty → try next title" check fires uniformly.
 *
 * Pre-conditions: `text` is the raw response body.  Throws on invalid
 * JSON (the consumer's network layer should have already filtered out
 * non-200 responses).
 */
export function parseWikipediaSummary(text: string): WikipediaSummary {
  const json = JSON.parse(text) as {
    type?: string;
    title?: string;
    extract?: string;
  };
  const title = typeof json.title === 'string' ? json.title : '';
  const rawExtract = typeof json.extract === 'string' ? json.extract : '';

  // Disambiguation page: type field is the authoritative signal, but
  // we also catch the prose pattern as a belt-and-braces.  Either way,
  // we return an empty extract so the caller falls back uniformly.
  const isDisambiguation =
    json.type === 'disambiguation' || /^may refer to[:\s]/i.test(rawExtract.trim());
  if (isDisambiguation) {
    return { extract: '', title };
  }
  return { extract: rawExtract, title };
}

/**
 * Build the Wikipedia REST summary URL for a given page title.  Title
 * components like `Messier 31` get spaces converted to `_` (Wikipedia's
 * canonical form) before URL-encoding.  Empty title is rejected at
 * runtime — Wikipedia would otherwise return the entire main page.
 */
export function wikipediaSummaryUrl(title: string): string {
  if (title.trim().length === 0) {
    throw new Error('wikipediaSummaryUrl: empty title');
  }
  // Wikipedia treats spaces and underscores as equivalent in titles,
  // but the REST API canonicalises to underscores.  We normalise here
  // so the URL we emit is byte-identical for callers who pass either.
  const normalised = title.trim().replace(/\s+/g, '_');
  return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(normalised)}`;
}
