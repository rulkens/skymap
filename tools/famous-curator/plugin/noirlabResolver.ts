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
 * Why regex over a real HTML parser: the relevant markup is a small set
 * of stable, non-nested patterns (the "Large JPEG" / "Fullsize Original"
 * archive_download rows, a single `<div class="credit">`, and the
 * og:image:secure_url `<meta>` tag).  Pulling in cheerio/parse5 for this
 * would be heavier than the code below and would still need bespoke
 * selectors — the parse step is not the source of complexity for NOIRLab
 * pages.
 *
 * Resolution order (locked by spec §Resolver contract, mirrored from the
 * Page anatomy table):
 *
 *   1. Large JPEG       — the curator-friendly size; ~1–4 MB, sRGB,
 *                         what the human maintainer would pick by hand.
 *   2. Fullsize Original — the only safety net when Large isn't
 *                         published.  Often a multi-hundred-MB TIFF,
 *                         which the /api/fetch proxy can still download
 *                         but the downstream pipeline will need to
 *                         rescale.  Acceptable cost for a fallback.
 *   3. og:image:secure_url — last-resort low-res JPEG (the social-share
 *                         preview).  Picked only when the page's
 *                         archive_download blocks are missing entirely,
 *                         which signals a half-broken / placeholder
 *                         entry rather than a normal record.
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
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Anchored on the visible "Large JPEG" link text plus the `/large/` URL
 * path segment — both are the actual djangoplicity template contract,
 * not the surrounding sibling order which has historically churned.
 */
const LARGE_JPEG_RE = /<a[^>]*href="([^"]+\/large\/[^"]+\.jpg)"[^>]*>\s*Large JPEG\s*<\/a>/i;

/**
 * Same shape as LARGE_JPEG_RE: anchored on the visible "Fullsize Original"
 * link text plus the `/original/` path segment.  The Original is almost
 * always a `.tif`, but we don't anchor on the extension — a future PNG
 * or webp variant would still be the right answer for this fallback.
 */
const FULLSIZE_ORIGINAL_RE =
  /<a[^>]*href="([^"]+\/original\/[^"]+)"[^>]*>\s*Fullsize Original\s*<\/a>/i;

/**
 * The OpenGraph secure share image.  Last-resort fallback used only when
 * the archive_download blocks are missing entirely — see resolution
 * order in the module header.
 */
const OG_IMAGE_SECURE_RE = /<meta\s+property="og:image:secure_url"\s+content="([^"]+)"\s*\/?>/i;

/** The single `<div class="credit">` on every NOIRLab image page. */
const CREDIT_DIV_RE = /<div class="credit">([\s\S]*?)<\/div>/;

/**
 * Parse a NOIRLab image page.  Pure: no I/O, no globals, `pageUrl`
 * echoed into the result verbatim so the caller controls canonicalisation.
 *
 * Returns null on any extraction miss — the caller decides whether to
 * surface that as a user-facing error or to retry with a different URL.
 */
export function parseNoirLabPage(html: string, pageUrl: string): ResolvedMedia | null {
  // Fallback chain per spec §Resolver contract: Large → Fullsize → og:image.
  // Each branch returns the capture group from a regex that's already
  // proved a successful match, so the `!` assertion is sound.
  let directUrl: string | null = null;

  const largeJpeg = LARGE_JPEG_RE.exec(html);
  if (largeJpeg) {
    directUrl = largeJpeg[1]!;
  } else {
    const fullsize = FULLSIZE_ORIGINAL_RE.exec(html);
    if (fullsize) {
      directUrl = fullsize[1]!;
    } else {
      const ogImage = OG_IMAGE_SECURE_RE.exec(html);
      if (ogImage) directUrl = ogImage[1]!;
    }
  }

  if (directUrl === null) return null;

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
