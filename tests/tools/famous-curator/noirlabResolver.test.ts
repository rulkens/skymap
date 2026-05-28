/**
 * parseNoirLabPage — happy-path extraction plus the documented fallback
 * chain.  The resolver is pure (HTML string in, ResolvedMedia out), so
 * the fixture-driven tests below need no network or filesystem stubs
 * beyond a single readFileSync of the committed page snapshot.
 *
 * The fallback variants below are synthesised inline by string-replacing
 * the base M94 fixture.  That keeps the "intent" of each mutation visible
 * next to the assertion it drives (e.g. "remove the Large JPEG anchor and
 * the Fullsize Original should be picked instead") rather than hiding it
 * behind a sibling fixture file whose diff against the base is invisible.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseNoirLabPage } from '../../../tools/famous-curator/plugin/noirlabResolver';

const FIXTURE_PATH = join(__dirname, 'fixtures', 'noirlab-noao-m94.html');
const PAGE_URL = 'https://noirlab.edu/public/images/noao-m94/';

/**
 * Helper: drop the first substring matching `re` from `html`.  Used to
 * carve the fallback variants out of the base fixture — making the
 * mutation a one-liner keeps each test's intent legible.
 */
function removeFirstMatching(html: string, re: RegExp): string {
  return html.replace(re, '');
}

// The Large JPEG row is one `<div class="archive_download">…</div>` block.
// Matching the wrapping div (not just the inner <a>) keeps the surrounding
// "Fullsize Original" block intact in the Fullsize-only variant.
const LARGE_JPEG_BLOCK_RE =
  /<div class="archive_download">(?:(?!<\/div>).)*?Large JPEG<\/a>[\s\S]*?<\/div><\/span><\/div>/;

// Every archive_download block on the page — including Fullsize, Large,
// Screensize, Zoomable, and the Classic Wallpapers grid.  After this
// strip, only the og:image:secure_url meta tag remains as a image source.
const ALL_ARCHIVE_DOWNLOAD_BLOCKS_RE =
  /<div class="archive_download">[\s\S]*?<\/div><\/span><\/div>/g;

const OG_IMAGE_SECURE_META_RE =
  /<meta property="og:image:secure_url"[^>]*\/>/;

// The credit div's INNER HTML — leaves the wrapping tag in place so the
// resolver still sees a `<div class="credit"></div>` (empty author),
// distinct from "no credit div at all" which is a parse miss.
const CREDIT_DIV_INNER_RE = /(<div class="credit">)[\s\S]*?(<\/div>)/;

describe('parseNoirLabPage', () => {
  const html = readFileSync(FIXTURE_PATH, 'utf-8');
  const result = parseNoirLabPage(html, PAGE_URL);

  it('parses Large JPEG URL from the M94 fixture', () => {
    expect(result?.directUrl).toBe(
      'https://storage.noirlab.edu/media/archives/images/large/noao-m94.jpg',
    );
  });

  it('parses author string with inner anchors stripped', () => {
    expect(result?.author).toBe('Hillary Mathis, N.A.Sharp/NOIRLab/NSF/AURA/');
  });

  it('returns the hardcoded CC BY 4.0 licence', () => {
    expect(result?.license).toBe('CC BY 4.0');
  });

  it('echoes the input page URL as sourceUrl', () => {
    expect(result?.sourceUrl).toBe(PAGE_URL);
  });

  it('falls back to Fullsize Original when Large JPEG is absent', () => {
    const noLargeJpeg = removeFirstMatching(html, LARGE_JPEG_BLOCK_RE);
    const fallback = parseNoirLabPage(noLargeJpeg, PAGE_URL);
    expect(fallback?.directUrl.endsWith('/original/noao-m94.tif')).toBe(true);
  });

  it('falls back to og:image:secure_url when no archive_download blocks present', () => {
    const noDownloads = html.replace(ALL_ARCHIVE_DOWNLOAD_BLOCKS_RE, '');
    const fallback = parseNoirLabPage(noDownloads, PAGE_URL);
    expect(fallback?.directUrl).toBe(
      'https://storage.noirlab.edu/media/archives/images/screen/noao-m94.jpg',
    );
  });

  it('returns null when no image source can be parsed', () => {
    const noDownloads = html.replace(ALL_ARCHIVE_DOWNLOAD_BLOCKS_RE, '');
    const totalMiss = removeFirstMatching(noDownloads, OG_IMAGE_SECURE_META_RE);
    expect(parseNoirLabPage(totalMiss, PAGE_URL)).toBeNull();
  });

  it('returns null author when credit div is empty', () => {
    const emptyCredit = html.replace(CREDIT_DIV_INNER_RE, '$1$2');
    const result = parseNoirLabPage(emptyCredit, PAGE_URL);
    expect(result !== null && result.author === '').toBe(true);
  });
});
