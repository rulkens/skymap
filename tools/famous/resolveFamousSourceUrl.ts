/**
 * resolveFamousSourceUrl — recipe attribution URL → directly-fetchable image URL.
 *
 * The curator records the URL the maintainer pasted for attribution.  For
 * Wikipedia sources that is a PAGE url ending in a `#/media/File:<name>`
 * fragment — not an image.  Wikipedia's `Special:FilePath/<name>` endpoint is a
 * stable 302 to the current original upload, so we can rebuild a fetchable URL
 * from the fragment alone (no HTML scraping, no resolver per host).
 *
 * Returns:
 *   - the Special:FilePath URL for a Wikipedia File: fragment,
 *   - the input unchanged when it is already a direct image URL,
 *   - null when we can't turn it into an image fetch (caller skips + logs).
 */

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|tiff?)$/i;

export function resolveFamousSourceUrl(sourceUrl: string): string | null {
  // Wikipedia article page with a media fragment: …/wiki/NGC_3031#/media/File:M81.jpg
  const fileMatch = /#\/media\/File:(.+)$/.exec(sourceUrl);
  if (fileMatch) {
    const fileName = decodeURIComponent(fileMatch[1]!);
    // Derive the wiki host from the page URL so non-English wikis still resolve.
    let origin = 'https://en.wikipedia.org';
    try {
      origin = new URL(sourceUrl).origin;
    } catch {
      // Malformed URL — fall back to the English Wikipedia origin.
    }
    return `${origin}/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
  }

  // Already a direct image (Commons upload host, or any URL ending in an
  // image extension) — fetch it as-is.
  try {
    const u = new URL(sourceUrl);
    if (u.hostname === 'upload.wikimedia.org' || IMAGE_EXT.test(u.pathname)) {
      return sourceUrl;
    }
  } catch {
    // Not a parseable URL → unresolvable.
  }

  return null;
}
