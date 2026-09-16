/**
 * fetchSurfaceTileManifest — the `prefix` and `bands` guards are the
 * load-bearing cases: a pre-versioning bake with no `prefix` (or an empty
 * one), or a pre-v8 `levels`-keyed manifest, must fold into the same `null`
 * as a missing file, not be trusted into a broken URL or a `.length` read on
 * `undefined`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSurfaceTileManifest } from '../../../src/utils/scene/fetchSurfaceTileManifest';

let originalFetch: typeof fetch | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  if (originalFetch !== undefined) globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('fetchSurfaceTileManifest', () => {
  it('returns a well-formed manifest as-is', async () => {
    const manifest = {
      prefix: 'earth-tiles/v8',
      tilePx: 512,
      bands: [
        {
          bounds: { west: -180, south: -90, east: 180, north: 90 },
          min: 4,
          max: 6,
          builtFrom: { albedo: { sourceId: 'blue-marble', attribution: 'NASA', vintage: '2004' } },
        },
      ],
    };
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify(manifest), { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await fetchSurfaceTileManifest('earth-tiles')).toEqual(manifest);
    // A max-age copy held past a prefix bump names a pruned version.
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.any(String), { cache: 'no-cache' });
  });

  it('returns null for a manifest with no prefix', async () => {
    const manifest = { tilePx: 512, bands: [] };
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify(manifest), { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await fetchSurfaceTileManifest('earth-tiles')).toBeNull();
  });

  it('returns null for a manifest with an empty prefix', async () => {
    const manifest = { prefix: '', tilePx: 512, bands: [] };
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify(manifest), { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await fetchSurfaceTileManifest('earth-tiles')).toBeNull();
  });

  it('returns null for a levels-keyed (pre-bands) manifest', async () => {
    // The v7 shape: per-kind `levels`, no flat `bands` array at all.
    const manifest = {
      prefix: 'earth-tiles/v7',
      tilePx: 512,
      levels: { surface: [{ bounds: {}, min: 4, max: 6 }] },
    };
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify(manifest), { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await fetchSurfaceTileManifest('earth-tiles')).toBeNull();
  });

  it('returns null for a band entry missing numeric min/max', async () => {
    const manifest = {
      prefix: 'earth-tiles/v8',
      tilePx: 512,
      bands: [{ bounds: {}, min: 4 }],
    };
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify(manifest), { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await fetchSurfaceTileManifest('earth-tiles')).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('not found', { status: 404 }),
    ) as unknown as typeof fetch;

    expect(await fetchSurfaceTileManifest('earth-tiles')).toBeNull();
  });

  it("requests the given manifestKey's own path, not a hard-coded body", async () => {
    const fetchSpy = vi.fn(
      async () => new Response('not found', { status: 404 }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await fetchSurfaceTileManifest('mars-tiles');

    expect(String(vi.mocked(fetchSpy).mock.calls[0]![0])).toContain('mars-tiles/manifest.json');
  });
});
