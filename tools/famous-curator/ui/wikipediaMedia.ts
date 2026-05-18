/**
 * Wikipedia / Wikimedia Commons media URL helper.
 *
 * Lets the maintainer paste a Wikipedia article URL with a media-viewer
 * fragment, e.g.
 *
 *   https://en.wikipedia.org/wiki/NGC_6744
 *     #/media/File:Wide_Field_Imager_view_of_a_Milky_Way_look-alike_NGC_6744.jpg
 *
 * …and have the curator (a) auto-resolve it to the direct image URL the
 * /api/fetch route needs and (b) pre-fill the Attribution form with the
 * file's license + author straight from Commons' extmetadata block.
 *
 * Why an in-browser fetch and not a server-side proxy?  Commons' MediaWiki
 * API supports anonymous CORS via the `origin=*` query parameter, so we
 * can call it directly without round-tripping through our own backend.
 * Keeping the logic in the UI also means the Resolve step is observable
 * in the browser network panel during debugging.
 *
 * Recognised URL shapes:
 *   - `*.wikipedia.org/wiki/<Article>#/media/File:<name>`  (mediaviewer)
 *   - `commons.wikimedia.org/wiki/File:<name>`             (canonical)
 *   - `*.wikipedia.org/wiki/File:<name>`                   (rare; treated as canonical)
 */

export type WikipediaMediaMeta = {
  /** Direct file URL suitable for /api/fetch. */
  directUrl: string;
  /** Author / artist, HTML-stripped (Commons stores it as inline markup). */
  author: string;
  /** Short license name, e.g. "CC BY 4.0". */
  license: string;
};

/**
 * Pull the `File:<name>` title out of a Wikipedia / Commons URL.  Returns
 * `null` for any URL that doesn't look like one we can resolve — callers
 * fall back to using the URL verbatim in that case.
 */
export function parseWikipediaMediaTitle(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname;
  const isWiki = host.endsWith('.wikipedia.org') || host === 'commons.wikimedia.org';
  if (!isWiki) return null;
  // Mediaviewer fragment: #/media/File:<name>.  The URL fragment isn't
  // sent to servers but `URL#hash` exposes it for client-side parsing.
  const frag = /^#\/media\/(File:.+)$/.exec(u.hash);
  if (frag) return decodeURIComponent(frag[1]!);
  // Canonical file path: /wiki/File:<name>
  const path = /^\/wiki\/(File:.+)$/.exec(u.pathname);
  if (path) return decodeURIComponent(path[1]!);
  return null;
}

/** Strip HTML tags from a Commons extmetadata string (e.g. Artist often
 *  contains <a>…</a> wrappers).  Regex-based — fine for the simple cases
 *  Commons emits; we don't need a full HTML parser here. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

type CommonsResponse = {
  query?: {
    pages?: Record<string, {
      imageinfo?: Array<{
        url?: string;
        extmetadata?: {
          Artist?: { value?: string };
          LicenseShortName?: { value?: string };
        };
      }>;
    }>;
  };
};

/**
 * Resolve a Wikipedia/Commons URL to its direct file URL + extracted
 * attribution.  Returns `null` for non-Wikipedia URLs; throws on network
 * failure (caller decides whether to fall back).
 *
 * `fetcher` is injectable so tests can run without hitting the network.
 */
export async function resolveWikipediaMedia(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<WikipediaMediaMeta | null> {
  const title = parseWikipediaMediaTitle(url);
  if (!title) return null;
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.searchParams.set('action', 'query');
  api.searchParams.set('format', 'json');
  api.searchParams.set('prop', 'imageinfo');
  api.searchParams.set('iiprop', 'url|extmetadata');
  api.searchParams.set('titles', title);
  // origin=* requests anonymous CORS — required when calling from a
  // non-Wikimedia origin without credentials.
  api.searchParams.set('origin', '*');
  const r = await fetcher(api.toString());
  if (!r.ok) throw new Error(`Commons API ${r.status}`);
  const data = (await r.json()) as CommonsResponse;
  const pages = data.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  const info = page?.imageinfo?.[0];
  if (!info?.url) return null;
  return {
    directUrl: info.url,
    author: stripHtml(info.extmetadata?.Artist?.value ?? ''),
    license: info.extmetadata?.LicenseShortName?.value ?? '',
  };
}
