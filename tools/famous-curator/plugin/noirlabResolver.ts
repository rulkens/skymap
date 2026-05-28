/**
 * noirlabResolver — extract the canonical download URL, credit string,
 * and licence from a NOIRLab `/public/images/<slug>/` page.
 *
 * Why server-side: NOIRLab's storage host does not emit permissive CORS
 * headers, so the curator's browser-side preview can't fetch the page
 * HTML or the JPEG directly.  This resolver runs inside the dev plugin
 * (Node-side), where same-origin restrictions don't apply.  The plugin
 * proxies the resolved `directUrl` through /api/fetch, which is also
 * server-side.
 *
 * Why regex over a real HTML parser: the relevant markup is two stable,
 * non-nested patterns (the "Large JPEG" download row and a single
 * `<div class="credit">`).  Pulling in cheerio/parse5 for this would be
 * heavier than the code below and would still need bespoke selectors —
 * the parse step is not the source of complexity for NOIRLab pages.
 *
 * Scope of this commit (Task 2): Large JPEG path only.  The Fullsize
 * Original and og:image fallbacks land in Task 3; keeping them out
 * now means the test suite stays a faithful spec of "what does the
 * happy path return" rather than a regression net for branches that
 * don't exist yet.
 */

export type ResolvedMedia = {
  directUrl: string; // image URL /api/fetch will download
  author: string; // credit string, HTML stripped, whitespace collapsed
  license: string; // short licence name, e.g. "CC BY 4.0"
  sourceUrl: string; // page URL the maintainer pasted, verbatim
};

/**
 * NOIRLab's site-wide content licence, documented at
 * https://noirlab.edu/public/copyright/ .  Every `/public/images/` page
 * inherits this — there is no per-image override surfaced in the HTML —
 * so it's safe (and simpler) to bake the constant in rather than parse
 * a phantom field.
 */
export const NOIRLAB_LICENSE = 'CC BY 4.0';

/** Strip HTML tags and collapse whitespace.  Same lightweight pattern
 *  used by tools/famous-curator/ui/wikipediaMedia.ts — adequate for the
 *  shallow markup (`<a>` wrappers) NOIRLab puts inside `<div class="credit">`. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Anchored on the visible "Large JPEG" link text plus the `/large/` URL
 * path segment — both are the actual djangoplicity template contract,
 * not the surrounding sibling order which has historically churned.
 */
const LARGE_JPEG_RE = /<a[^>]*href="([^"]+\/large\/[^"]+\.jpg)"[^>]*>\s*Large JPEG\s*<\/a>/i;

/** The single `<div class="credit">` on every NOIRLab image page. */
const CREDIT_DIV_RE = /<div class="credit">([\s\S]*?)<\/div>/;

/**
 * Parse a NOIRLab image page.  Pure: no I/O, no globals, `pageUrl`
 * echoed into the result verbatim so the caller controls canonicalisation.
 *
 * Returns null on any extraction miss — the caller decides whether to
 * surface that as a user-facing error or to retry with a different URL.
 */
export function parseNoirLabPage(
  html: string,
  pageUrl: string,
): ResolvedMedia | null {
  const largeJpeg = LARGE_JPEG_RE.exec(html);
  if (!largeJpeg) return null;
  // regex match guarantees the capture group is present
  const directUrl = largeJpeg[1]!;

  const credit = CREDIT_DIV_RE.exec(html);
  if (!credit) return null;
  const author = stripHtml(credit[1]!);

  return {
    directUrl,
    author,
    license: NOIRLAB_LICENSE,
    sourceUrl: pageUrl,
  };
}
