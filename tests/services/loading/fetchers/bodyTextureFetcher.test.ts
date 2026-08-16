/**
 * bodyTextureFetcher tests — the tier-sized filename contract exercised
 * through the public fetch surface (not a source grep).
 *
 * `fetch` is stubbed via the shared useFetchMock helper; `createImageBitmap`
 * (absent under the node test runtime) is stubbed per-suite so the decode
 * chain resolves without a real image decoder.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyTextureFetcher } from '../../../../src/services/loading/fetchers/bodyTextureFetcher';
import { useFetchMock } from '../../../setup/fetchMock';

const fetch = useFetchMock();

describe('bodyTextureFetcher', () => {
  let originalCreateImageBitmap: typeof globalThis.createImageBitmap | undefined;

  beforeEach(() => {
    originalCreateImageBitmap = globalThis.createImageBitmap;
    globalThis.createImageBitmap = vi
      .fn()
      .mockResolvedValue({} as ImageBitmap) as unknown as typeof globalThis.createImageBitmap;
    fetch.mock.mockResolvedValue(
      new Response(new Blob(['x']), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    );
  });

  afterEach(() => {
    globalThis.createImageBitmap = originalCreateImageBitmap!;
  });

  it('requests the tier-sized JPG url', async () => {
    await bodyTextureFetcher(
      { bodyId: 'mars', kind: 'surface', tier: 'small' },
      new AbortController().signal,
      () => {},
    );
    const url = String(fetch.mock.mock.calls[0]?.[0]);
    expect(url.endsWith('images/textures/mars-2048.jpg')).toBe(true);
  });

  it('requests the ring WebP', async () => {
    await bodyTextureFetcher(
      { bodyId: 'saturn-ring', kind: 'surface', tier: 'large' },
      new AbortController().signal,
      () => {},
    );
    const url = String(fetch.mock.mock.calls[0]?.[0]);
    expect(url.endsWith('images/textures/saturn-ring-8192.webp')).toBe(true);
  });

  it('fails loudly, naming the path, when a missing file comes back as the dev-server SPA fallback', async () => {
    fetch.mock.mockResolvedValue(
      new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await expect(
      bodyTextureFetcher(
        { bodyId: 'mars', kind: 'surface', tier: 'small' },
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow('images/textures/mars-2048.jpg');
  });
});
