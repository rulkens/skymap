/**
 * fetchEarthTileManifest — the `prefix` guard is the load-bearing case: a
 * pre-versioning bake with no `prefix` (or an empty one) must fold into the
 * same `null` as a missing file, not be trusted into an `undefined/…` URL.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchEarthTileManifest } from '../../../src/utils/scene/fetchEarthTileManifest';

let originalFetch: typeof fetch | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  if (originalFetch !== undefined) globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('fetchEarthTileManifest', () => {
  it('returns a well-formed manifest as-is', async () => {
    const manifest = {
      prefix: 'earth-tiles/v1',
      tilePx: 512,
      levels: { surface: { min: 4, max: 6 } },
      builtFrom: { surface: 'blue-marble' },
    };
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify(manifest), { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await fetchEarthTileManifest()).toEqual(manifest);
  });

  it('returns null for a manifest with no prefix', async () => {
    const manifest = { tilePx: 512, levels: {}, builtFrom: {} };
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify(manifest), { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await fetchEarthTileManifest()).toBeNull();
  });

  it('returns null for a manifest with an empty prefix', async () => {
    const manifest = { prefix: '', tilePx: 512, levels: {}, builtFrom: {} };
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify(manifest), { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await fetchEarthTileManifest()).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('not found', { status: 404 }),
    ) as unknown as typeof fetch;

    expect(await fetchEarthTileManifest()).toBeNull();
  });
});
