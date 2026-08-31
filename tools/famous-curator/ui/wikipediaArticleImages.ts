/**
 * Wikipedia article-image lookup.
 *
 * Given candidate page titles (typically a galaxy's display names), find
 * the first article that exists and return its content images.  Used by
 * the curator's image picker so the maintainer can click a thumbnail to
 * load the image into the editor without copy-pasting the URL.
 *
 * We use the REST API endpoint `/api/rest_v1/page/media-list/{title}`
 * rather than the older action API's `generator=images`.  The REST
 * endpoint returns ONLY content images (the things mediaviewer would
 * paginate through) — the action API also returns every infobox icon,
 * license badge, Commons logo, and OOjs sprite used on the page, which
 * fills the picker with generic Wikipedia chrome.  The REST
 * endpoint also follows redirects by default, so "M31" still resolves
 * to the Andromeda Galaxy article's images.
 */

export type WikipediaImage = {
  /** Full file title, e.g. "File:Wide Field Imager view of NGC 6744.jpg" */
  fileTitle: string;
  /** Small thumbnail URL for the grid card preview. */
  thumbUrl: string;
  /** Direct file URL (best-quality original). */
  fileUrl: string;
  /** Mediaviewer-style article URL — accepted by resolveWikipediaMedia. */
  articleUrl: string;
};

type MediaListResponse = {
  items?: Array<{
    title?: string;
    type?: string;
    showInGallery?: boolean;
    srcset?: Array<{ src?: string; scale?: string }>;
    original?: { source?: string; width?: number; height?: number };
  }>;
};

function isLikelyIcon(fileTitle: string): boolean {
  // Even the REST endpoint occasionally surfaces tiny icons that slipped
  // through Wikipedia's own filtering (e.g. coordinate map markers).
  // Drop SVGs and well-known chrome names as a second-line filter.
  const t = fileTitle.toLowerCase();
  if (t.endsWith('.svg')) return true;
  if (t.endsWith('.ogg') || t.endsWith('.webm')) return true;
  return /commons-logo|wikidata-logo|wiktionary|oojs|edit-icon|question_book/.test(t);
}

export async function fetchWikipediaArticleImages(
  candidateNames: readonly string[],
  fetcher: typeof fetch = fetch,
): Promise<{ articleTitle: string; images: WikipediaImage[] } | null> {
  for (const raw of candidateNames) {
    const title = raw.trim().replace(/\s+/g, '_');
    if (title.length === 0) continue;
    const url = `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title)}`;
    let r: Response;
    try {
      r = await fetcher(url);
    } catch {
      continue;
    }
    // 404 = page doesn't exist; try the next candidate name.
    if (r.status === 404) continue;
    if (!r.ok) continue;
    const data = (await r.json()) as MediaListResponse;
    const items = data.items ?? [];
    const images: WikipediaImage[] = [];
    for (const it of items) {
      if (it.type !== 'image') continue;
      if (!it.title) continue;
      // showInGallery=false marks items Wikipedia considers chrome (the
      // mediaviewer skips them too).  Trust that signal where present.
      if (it.showInGallery === false) continue;
      if (isLikelyIcon(it.title)) continue;
      // srcset entries go from small (1x) to large (2x).  We only need
      // the card-sized preview; first entry is the smallest and fine for
      // a ~100px card at any DPR.  srcset URLs are protocol-relative.
      const thumb = it.srcset?.[0]?.src;
      if (!thumb) continue;
      const thumbUrl = thumb.startsWith('//') ? `https:${thumb}` : thumb;
      const fileUrl = (() => {
        const u = it.original?.source;
        if (!u) return '';
        return u.startsWith('//') ? `https:${u}` : u;
      })();
      // The mediaviewer URL the curator's resolveWikipediaMedia helper
      // expects: /wiki/<article>#/media/File:<name>.  Spaces in the file
      // title are collapsed to underscores to match Wikipedia's URL
      // canonicalisation; encodeURIComponent handles special characters.
      const fileSlug = it.title.replace(/^File:/, '').replace(/\s+/g, '_');
      const articleUrl = `https://en.wikipedia.org/wiki/${title}#/media/File:${encodeURIComponent(fileSlug)}`;
      images.push({ fileTitle: it.title, thumbUrl, fileUrl, articleUrl });
    }
    if (images.length > 0) return { articleTitle: title, images };
  }
  return null;
}
