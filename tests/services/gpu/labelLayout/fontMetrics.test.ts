import { describe, it, expect } from 'vitest';
import {
  parseFontMetrics,
  lookupGlyph,
} from '../../../../src/services/gpu/labelLayout/fontMetrics';
import type { FontMetrics } from '../../../../src/@types/rendering/FontMetrics';

const FIXTURE = {
  pages: ['jetbrains-mono.png'],
  common: { lineHeight: 50, base: 38, scaleW: 1024, scaleH: 1024 },
  info: { face: 'JetBrains Mono', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    {
      id: 65,
      x: 0,
      y: 0,
      width: 30,
      height: 40,
      xoffset: 1,
      yoffset: 2,
      xadvance: 25,
      page: 0,
      chnl: 15,
    },
    {
      id: 66,
      x: 32,
      y: 0,
      width: 28,
      height: 40,
      xoffset: 0,
      yoffset: 2,
      xadvance: 25,
      page: 0,
      chnl: 15,
    },
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

import { loadFontAtlases } from '../../../../src/services/gpu/labelLayout/loadFontAtlases';
import { BOOT_FONT_IDS, FONT_IDS } from '../../../../src/data/fonts';

describe('loadFontAtlases', () => {
  it('loads the boot fonts at boot and the on-demand ones onto them later', async () => {
    // Build a stub BMFont JSON per font.  The atlas.width returned by
    // parseFontMetrics encodes which font it came from so the test can
    // assert the keyed record holds the right font's data.
    const stubJson = (fontIdHash: number) => ({
      pages: ['x.png'],
      common: { lineHeight: 50, base: 38, scaleW: fontIdHash, scaleH: fontIdHash },
      info: { face: 'X', size: 42 },
      distanceField: { fieldType: 'msdf', distanceRange: 4 },
      chars: [
        {
          id: 65,
          x: 0,
          y: 0,
          width: 30,
          height: 40,
          xoffset: 0,
          yoffset: 0,
          xadvance: 25,
          page: 0,
          chnl: 15,
        },
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
    const fetched: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      // Match `/fonts/<id>.json` or `/fonts/<id>.webp`.
      const match = url.match(/\/fonts\/([^.]+)\.(json|webp)$/);
      if (!match) throw new Error(`unexpected fetch url ${url}`);
      const id = match[1]!;
      fetched.push(id);
      if (match[2] === 'json') {
        return new Response(JSON.stringify(stubJson(id.charCodeAt(0))), { status: 200 });
      }
      // The WebP body carries its font id, so the bitmap stub can find its placeholder.
      return new Response(id, { status: 200 });
    }) as typeof fetch;
    globalThis.createImageBitmap = (async (blob: Blob) =>
      fakeBitmaps.get(await blob.text())!) as unknown as typeof createImageBitmap;

    try {
      // Boot fetches only the boot fonts: a session that never asks for an
      // on-demand font pays nothing for it.
      const boot = await loadFontAtlases();
      expect(new Set(fetched)).toEqual(new Set(BOOT_FONT_IDS));
      expect(BOOT_FONT_IDS.length).toBeLessThan(FONT_IDS.length);

      const onDemand = FONT_IDS.filter((id) => !BOOT_FONT_IDS.includes(id));
      const loaded = await loadFontAtlases(onDemand, boot);
      expect(Object.keys(loaded.metricsByFont).sort()).toEqual([...FONT_IDS].sort());
      for (const id of FONT_IDS) {
        // Each font's metrics carries the fontIdHash we baked into scaleW.
        expect(loaded.metricsByFont[id]!.atlas.width).toBe(id.charCodeAt(0));
      }
      // Every bitmap lands on its own FONT_IDS layer, whichever load brought it.
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
