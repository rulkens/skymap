/**
 * bodyTextureFetcher tests — the tier-sized filename contract exercised
 * through the public fetch surface (not a source grep).
 *
 * `fetch` is stubbed via the shared useFetchMock helper; `createImageBitmap`
 * (absent under the node test runtime) is stubbed per-suite so the decode
 * chain resolves without a real image decoder.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyTextureFetcher } from '../../../../../src/layers/body/textures/load/bodyTextureFetcher';
import { useFetchMock } from '../../../../setup/fetchMock';

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

  describe('a slot a live dataset feeds', () => {
    const clouds = { bodyId: 'earth', kind: 'clouds', tier: 'small' } as const;
    const daily = 'live/v1/files/clouds/2026-11-13T0423Z/earth-clouds-grey-2048.webp';
    const image = (): Response =>
      new Response(new Blob(['x']), { status: 200, headers: { 'content-type': 'image/webp' } });
    const pointer = (): Response =>
      new Response(JSON.stringify({ files: { 'earth-clouds-grey-2048.webp': daily } }));
    const urls = (): string[] => fetch.mock.mock.calls.map(([url]) => String(url));

    it('tries the daily map before the built-in one', async () => {
      fetch.mock.mockImplementation(async (url: string) =>
        url.endsWith('live/v1/clouds.json') ? pointer() : image(),
      );
      await bodyTextureFetcher(clouds, new AbortController().signal, () => {});
      expect(urls()).toHaveLength(2);
      expect(urls()[0]).toMatch(/live\/v1\/clouds\.json$/);
      expect(urls()[1]).toMatch(new RegExp(`${daily}$`));
    });

    it('falls back to the built-in map when the pointer 404s', async () => {
      fetch.mock.mockImplementation(async (url: string) =>
        url.endsWith('live/v1/clouds.json') ? new Response('', { status: 404 }) : image(),
      );
      await bodyTextureFetcher(clouds, new AbortController().signal, () => {});
      expect(urls().at(-1)).toMatch(/images\/textures\/earth-clouds-grey-2048\.webp$/);
    });

    it('falls back when the daily file is not an image', async () => {
      fetch.mock.mockImplementation(async (url: string) => {
        if (url.endsWith('live/v1/clouds.json')) return pointer();
        if (url.endsWith(daily))
          return new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } });
        return image();
      });
      await bodyTextureFetcher(clouds, new AbortController().signal, () => {});
      expect(urls()).toHaveLength(3);
      expect(urls()[2]).toMatch(/images\/textures\/earth-clouds-grey-2048\.webp$/);
    });
  });

  it('uses only the built-in map for slots no dataset feeds', async () => {
    await bodyTextureFetcher(
      { bodyId: 'earth', kind: 'night', tier: 'small' },
      new AbortController().signal,
      () => {},
    );
    expect(fetch.mock.mock.calls).toHaveLength(1);
  });
});
