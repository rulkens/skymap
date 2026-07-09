import { describe, it, expect } from 'vitest';
import { parseFontMetrics, lookupGlyph } from '../../../../src/services/gpu/labels/fontMetrics';
import type { FontMetrics } from '../../../../src/@types/rendering/FontMetrics';

const FIXTURE = {
  pages: ['jetbrains-mono.png'],
  common: { lineHeight: 50, base: 38, scaleW: 1024, scaleH: 1024 },
  info: { face: 'JetBrains Mono', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    { id: 65, x: 0, y: 0, width: 30, height: 40, xoffset: 1, yoffset: 2, xadvance: 25, page: 0, chnl: 15 },
    { id: 66, x: 32, y: 0, width: 28, height: 40, xoffset: 0, yoffset: 2, xadvance: 25, page: 0, chnl: 15 },
  ],
  kernings: [{ first: 65, second: 66, amount: -1 }],
};

describe('parseFontMetrics', () => {
  it('parses atlas dimensions and distance range', () => {
    const m = parseFontMetrics(FIXTURE);
    expect(m.atlas.width).toBe(1024);
    expect(m.atlas.height).toBe(1024);
    expect(m.atlas.distanceRange).toBe(4);
    expect(m.lineHeight).toBe(50);
    expect(m.fontSize).toBe(42);
  });

  it('indexes glyphs by codepoint', () => {
    const m = parseFontMetrics(FIXTURE);
    const a = lookupGlyph(m, 'A'.codePointAt(0)!);
    expect(a).toBeDefined();
    expect(a!.advance).toBe(25);
    expect(a!.uv.u0).toBeCloseTo(0 / 1024);
    expect(a!.uv.v0).toBeCloseTo(0 / 1024);
    expect(a!.uv.u1).toBeCloseTo(30 / 1024);
    expect(a!.uv.v1).toBeCloseTo(40 / 1024);
  });

  it('returns undefined for unknown codepoints', () => {
    const m = parseFontMetrics(FIXTURE);
    expect(lookupGlyph(m, 0x4e2d)).toBeUndefined(); // 中 — not in atlas
  });

  it('exposes kerning pairs', () => {
    const m = parseFontMetrics(FIXTURE);
    expect(m.kerning.get('65,66')).toBe(-1);
  });
});

// ── multi-font loader shape test ──────────────────────────────────────────
//
// Lives in fontMetrics.test.ts (rather than its own file) because the
// loader's correctness reduces to "parseFontMetrics applied to each
// fetched JSON, ordered by FONT_IDS".  Stubs `fetch` and
// `createImageBitmap` so the test runs offline.

import { loadFontAtlases } from '../../../../src/services/gpu/labels/loadFontAtlases';
import { FONT_IDS } from '../../../../src/data/fonts';

describe('loadFontAtlases', () => {
  it('returns one FontMetrics per FontId, bitmaps ordered by FONT_IDS', async () => {
    // Build a stub BMFont JSON per font.  The atlas.width returned by
    // parseFontMetrics encodes which font it came from so the test can
    // assert the keyed record holds the right font's data.
    const stubJson = (fontIdHash: number) => ({
      pages: ['x.png'],
      common: { lineHeight: 50, base: 38, scaleW: fontIdHash, scaleH: fontIdHash },
      info: { face: 'X', size: 42 },
      distanceField: { fieldType: 'msdf', distanceRange: 4 },
      chars: [
        { id: 65, x: 0, y: 0, width: 30, height: 40, xoffset: 0, yoffset: 0, xadvance: 25, page: 0, chnl: 15 },
      ],
    });

    // Bitmaps are returned by the stubbed createImageBitmap; we use a
    // unique placeholder per font so we can assert layer ordering.
    const fakeBitmaps = new Map<string, ImageBitmap>();
    for (const id of FONT_IDS) {
      fakeBitmaps.set(id, { width: 512, height: 512, close() {} } as unknown as ImageBitmap);
    }

    const originalFetch = globalThis.fetch;
    const originalCreateImageBitmap = globalThis.createImageBitmap;

    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      // Match `/fonts/<id>.json` or `/fonts/<id>.webp`.
      const match = url.match(/\/fonts\/([^.]+)\.(json|webp)$/);
      if (!match) throw new Error(`unexpected fetch url ${url}`);
      const id = match[1]!;
      const ext = match[2]!;
      if (ext === 'json') {
        return new Response(JSON.stringify(stubJson(id.charCodeAt(0))), { status: 200 });
      }
      // For the WebP we return a non-empty body; createImageBitmap is
      // stubbed below to look up by id.
      return new Response(new Uint8Array([0]), { status: 200, headers: { 'x-stub-id': id } });
    }) as typeof fetch;

    // createImageBitmap is called on the blob from the WebP fetch.  We
    // can't easily thread the font id through the blob, so we rely on
    // the FONT_IDS iteration order in the loader matching the order we
    // populate fakeBitmaps — which the loader guarantees by mapping
    // over FONT_IDS in order.
    let bitmapCallCount = 0;
    globalThis.createImageBitmap = (async () => {
      const id = FONT_IDS[bitmapCallCount]!;
      bitmapCallCount++;
      return fakeBitmaps.get(id)!;
    }) as typeof createImageBitmap;

    try {
      const loaded = await loadFontAtlases();
      expect(Object.keys(loaded.metricsByFont).sort()).toEqual([...FONT_IDS].sort());
      for (const id of FONT_IDS) {
        // Each font's metrics carries the fontIdHash we baked into scaleW.
        expect(loaded.metricsByFont[id].atlas.width).toBe(id.charCodeAt(0));
      }
      // Bitmaps array length matches FONT_IDS; order matches.
      expect(loaded.bitmaps).toHaveLength(FONT_IDS.length);
      for (let i = 0; i < FONT_IDS.length; i++) {
        expect(loaded.bitmaps[i]).toBe(fakeBitmaps.get(FONT_IDS[i]!));
      }
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.createImageBitmap = originalCreateImageBitmap;
    }
  });
});
