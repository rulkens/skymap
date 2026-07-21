/**
 * wikipediaUrl — build the canonical English-Wikipedia article URL for a title.
 *
 * Wikipedia titles use underscores for spaces, so we swap spaces first and then
 * percent-encode the rest (parentheses, apostrophes, non-ASCII). This is the one
 * URL-shape the galaxy, body, and famous-star cards all link through, so the
 * encoding lives here rather than being re-inlined at each call site.
 */
export function wikipediaUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}
