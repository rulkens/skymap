/**
 * fetchFamousImages — unit tests for the pure surface of the famous-galaxy
 * image pipeline.  All tests use injected fakes; NO real network calls.
 *
 * The CLI runtime (argv parsing, on-disk caching, sequential worker loop)
 * is intentionally not covered here — testing those would require either
 * a mock filesystem layer or actual disk I/O, both of which add complexity
 * without proportional confidence.  The pure helpers below cover the
 * tricky bits: title-chain breadth, image-URL preference, the
 * Wikipedia-fail → DESI-fallback handoff (via the resolution result
 * being null), and the actual image processing pipeline running on a
 * real bytes buffer through sharp.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  buildWikipediaTitleChain,
  chooseWikipediaImageUrl,
  resolveWikipediaImage,
  processWikipediaImageBuffer,
  type WikipediaBodyFetcher,
} from '../../tools/famous/fetchFamousImages';
import type { WikipediaSummary } from '../../tools/parsers/wikipediaSummary';
import type { FamousEntry } from '../../tools/parsers/famousSeed';

/**
 * Minimal FamousEntry fixture.  All required fields filled with placeholder
 * values; tests override only the fields they exercise (id, names).
 */
function makeEntry(overrides: Partial<FamousEntry>): FamousEntry {
  return {
    id: 'm31',
    names: ['M31', 'NGC 224', 'Andromeda Galaxy'],
    ra: 10.6846845,
    dec: 41.2689778,
    distanceMpc: 0.78,
    diameterKpc: 40,
    type: 'Sb',
    description: 'placeholder',
    ...overrides,
  };
}

describe('buildWikipediaTitleChain', () => {
  it('emits Messier_, M_, NGC_, and common-name forms for a Messier entry', () => {
    const e = makeEntry({
      id: 'm31',
      names: ['M31', 'NGC 224', 'Andromeda Galaxy'],
    });
    const chain = buildWikipediaTitleChain(e);
    // Expected ordering: Messier first, then M_, then NGC, then common name.
    expect(chain[0]).toBe('Messier_31');
    expect(chain[1]).toBe('M_31');
    expect(chain).toContain('NGC_224');
    expect(chain).toContain('Andromeda_Galaxy');
  });

  it('strips leading zeros from NGC catalog numbers', () => {
    // Seed-time HyperLEDA store is "NGC 0224" but Wikipedia's slug is
    // "NGC_224".  The chain MUST emit the unpadded form, not the padded
    // one — the previous narrow heuristic was bitten by this on Centaurus A.
    const e = makeEntry({
      id: 'm31',
      names: ['M31', 'NGC 0224', 'Andromeda Galaxy'],
    });
    const chain = buildWikipediaTitleChain(e);
    expect(chain).toContain('NGC_224');
    expect(chain).not.toContain('NGC_0224');
  });

  it('emits Caldwell_ form for Caldwell-prefixed seed ids', () => {
    const e = makeEntry({
      id: 'c77',
      names: ['C77', 'NGC 5128'],
    });
    const chain = buildWikipediaTitleChain(e);
    expect(chain).toContain('Caldwell_77');
    expect(chain).toContain('NGC_5128');
  });

  it('handles IC catalog members alongside NGC', () => {
    const e = makeEntry({
      id: 'c5',
      names: ['C5', 'IC 342'],
    });
    const chain = buildWikipediaTitleChain(e);
    expect(chain).toContain('IC_342');
  });

  it('skips catalog-name entries when collecting common names', () => {
    // The seed names array always leads with the catalog id.  Common-name
    // collection must NOT re-add `M31` / `NGC 224` as common names.
    const e = makeEntry({
      id: 'm31',
      names: ['M31', 'NGC 224', 'Andromeda Galaxy'],
    });
    const chain = buildWikipediaTitleChain(e);
    expect(chain).not.toContain('M31');
    expect(chain).not.toContain('NGC_224_'); // sanity
  });

  it('deduplicates titles that resolve to the same string', () => {
    // If a galaxy's name array carries the same name twice, or two
    // catalog ids both map to the same slug, the chain must not contain
    // duplicates (waste of HTTP requests).
    const e = makeEntry({
      id: 'c77',
      names: ['C77', 'NGC 5128', 'NGC 5128'],
    });
    const chain = buildWikipediaTitleChain(e);
    const dedup = new Set(chain);
    expect(dedup.size).toBe(chain.length);
  });
});

describe('chooseWikipediaImageUrl', () => {
  it('prefers originalimage over thumbnail', () => {
    const s: WikipediaSummary = {
      title: 'X',
      type: 'standard',
      extract: '',
      originalImageUrl: 'https://example.test/full.jpg',
      thumbnailUrl: 'https://example.test/thumb.jpg',
    };
    expect(chooseWikipediaImageUrl(s)).toBe('https://example.test/full.jpg');
  });

  it('falls back to thumbnail when originalimage is missing', () => {
    const s: WikipediaSummary = {
      title: 'X',
      type: 'standard',
      extract: '',
      thumbnailUrl: 'https://example.test/thumb.jpg',
    };
    expect(chooseWikipediaImageUrl(s)).toBe('https://example.test/thumb.jpg');
  });

  it('returns undefined for disambiguation pages even when an image is attached', () => {
    // Wikipedia occasionally attaches a generic icon to disambig pages —
    // we must not pick it as the galaxy's hero image.
    const s: WikipediaSummary = {
      title: 'Andromeda',
      type: 'disambiguation',
      extract: '',
      originalImageUrl: 'https://example.test/disambig.svg',
    };
    expect(chooseWikipediaImageUrl(s)).toBeUndefined();
  });

  it('returns undefined when neither url is set', () => {
    const s: WikipediaSummary = { title: 'X', type: 'standard', extract: '' };
    expect(chooseWikipediaImageUrl(s)).toBeUndefined();
  });
});

describe('resolveWikipediaImage', () => {
  /**
   * Helper: build a body fetcher backed by a Map of title → response body.
   * Unmapped titles return null (HTTP-404 simulation).
   */
  function makeFetcher(map: Record<string, string>): WikipediaBodyFetcher {
    return async (title) => map[title] ?? null;
  }

  it('returns the first title with a usable image URL', () => {
    const fetcher = makeFetcher({
      Messier_31: JSON.stringify({
        type: 'standard',
        title: 'Andromeda Galaxy',
        originalimage: { source: 'https://example.test/full.jpg', width: 1, height: 1 },
      }),
    });
    return resolveWikipediaImage(['Messier_31', 'NGC_224'], fetcher).then((r) => {
      expect(r).not.toBeNull();
      expect(r?.title).toBe('Messier_31');
      expect(r?.url).toBe('https://example.test/full.jpg');
    });
  });

  it('walks past 404s in the chain to find a later title that resolves', () => {
    // Simulates the Centaurus A case: the first candidate (`Caldwell_77`)
    // didn't exist in old-style narrow-chain code, but `NGC_5128` does.
    const fetcher = makeFetcher({
      NGC_5128: JSON.stringify({
        type: 'standard',
        title: 'NGC 5128',
        originalimage: { source: 'https://example.test/cena.jpg', width: 1, height: 1 },
      }),
    });
    return resolveWikipediaImage(['Caldwell_77', 'NGC_5128', 'Centaurus_A'], fetcher).then((r) => {
      expect(r?.title).toBe('NGC_5128');
    });
  });

  it('walks past disambiguation pages (no usable image) to find a real article', () => {
    // First title resolves to a disambig page → no image; second resolves
    // to a real article with an image.  Tests the "walked past one bad
    // page" path that the title-chain breadth is meant to handle.
    const fetcher = makeFetcher({
      Andromeda: JSON.stringify({
        type: 'disambiguation',
        title: 'Andromeda',
        extract: 'Andromeda may refer to:',
      }),
      Andromeda_Galaxy: JSON.stringify({
        type: 'standard',
        title: 'Andromeda Galaxy',
        thumbnail: { source: 'https://example.test/m31.jpg', width: 1, height: 1 },
      }),
    });
    return resolveWikipediaImage(['Andromeda', 'Andromeda_Galaxy'], fetcher).then((r) => {
      expect(r?.title).toBe('Andromeda_Galaxy');
      expect(r?.url).toBe('https://example.test/m31.jpg');
    });
  });

  it('returns null when no candidate yields a usable image (DESI fallback signal)', () => {
    // This is the contract the CLI relies on for source-preference
    // wikipedia → desi handoff: a null result means "fall through to DESI".
    const fetcher = makeFetcher({});
    return resolveWikipediaImage(['Foo', 'Bar'], fetcher).then((r) => {
      expect(r).toBeNull();
    });
  });

  it('treats malformed JSON as a soft skip (next title in the chain)', () => {
    // A flaky CDN serving an HTML 503 page in place of JSON shouldn't
    // poison the whole entry — try the next title.
    const fetcher = makeFetcher({
      Bad_Title: '<html>503 Service Unavailable</html>',
      Good_Title: JSON.stringify({
        type: 'standard',
        title: 'Good',
        originalimage: { source: 'https://example.test/x.jpg', width: 1, height: 1 },
      }),
    });
    return resolveWikipediaImage(['Bad_Title', 'Good_Title'], fetcher).then((r) => {
      expect(r?.title).toBe('Good_Title');
    });
  });
});

describe('processWikipediaImageBuffer', () => {
  /**
   * Build a tiny solid-colour JPEG buffer via sharp.  Used as the input
   * to the processor so we test the "decode → pad → fade → encode" path
   * without needing a real Wikipedia image.
   */
  async function makeTestPng(
    width: number,
    height: number,
    rgb: [number, number, number],
  ): Promise<Buffer> {
    return await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: rgb[0], g: rgb[1], b: rgb[2] },
      },
    })
      .png()
      .toBuffer();
  }

  it('produces a 256x256 WebP for a square input', async () => {
    const input = await makeTestPng(512, 512, [200, 100, 50]);
    const out = await processWikipediaImageBuffer(input);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
  });

  it('preserves aspect ratio for non-square inputs (no stretching)', async () => {
    // A wide 800×400 input must NOT get squashed to a square — the
    // processor pads with transparency to keep proportions.  We verify
    // the output is still 256×256 (the canvas is square) but the actual
    // image content occupies a horizontal band with transparent rows
    // top + bottom.
    const input = await makeTestPng(800, 400, [255, 255, 255]);
    const out = await processWikipediaImageBuffer(input);
    const { data, info } = await sharp(out)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(256);
    expect(info.height).toBe(256);
    // Centre row should have non-zero alpha (image content).
    const centreAlpha = data[(128 * info.width + 128) * 4 + 3]!;
    expect(centreAlpha).toBeGreaterThan(0);
    // Top-row middle pixel should have alpha 0 (transparent letterbox).
    const topAlpha = data[(0 * info.width + 128) * 4 + 3]!;
    expect(topAlpha).toBe(0);
  });

  it('applies the radial alpha fade (corner alpha < centre alpha)', async () => {
    // Input is fully opaque white → after the radial fade the corners
    // should be transparent (or nearly so) while the centre remains opaque.
    // This is the hallmark of the Wikipedia-only path: NO sky-cut, just
    // the soft radial taper.
    const input = await makeTestPng(512, 512, [255, 255, 255]);
    const out = await processWikipediaImageBuffer(input);
    const { data, info } = await sharp(out)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const centreAlpha = data[(128 * info.width + 128) * 4 + 3]!;
    const cornerAlpha = data[(0 * info.width + 0) * 4 + 3]!;
    expect(centreAlpha).toBeGreaterThan(cornerAlpha);
  });

  it('does NOT cut the centre to transparent (sky-cut would be wrong here)', async () => {
    // Critical: the sky-cut path would sample the corners (here all-white)
    // and erase the entire image.  The Wikipedia path must NOT do that —
    // a centre pixel of a uniformly-white input must remain opaque.
    const input = await makeTestPng(512, 512, [255, 255, 255]);
    const out = await processWikipediaImageBuffer(input);
    const { data, info } = await sharp(out)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const centreAlpha = data[(128 * info.width + 128) * 4 + 3]!;
    expect(centreAlpha).toBeGreaterThan(200);
  });
});
