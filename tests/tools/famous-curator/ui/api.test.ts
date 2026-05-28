/**
 * api — typed fetch wrappers around /api/*.
 *
 * Tests use a stubbed `fetch` implementation injected via the factory.
 * No real network.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeApi } from '../../../../tools/famous-curator/ui/api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('makeApi', () => {
  it('getGalaxies fetches /api/galaxies and returns the parsed body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ galaxies: [{ id: 'm31', curated: false }] }));
    const api = makeApi({ fetch: fetchFn as never });
    const result = await api.getGalaxies();
    expect(fetchFn).toHaveBeenCalledWith('/api/galaxies');
    expect(result.galaxies[0]!.id).toBe('m31');
  });

  it('postFetchUrl POSTs JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ tmpId: 'x', width: 100, height: 80, previewUrl: '/p', mediaType: 'image/png' }));
    const api = makeApi({ fetch: fetchFn as never });
    await api.postFetchUrl('https://e.com/i.png');
    const call = fetchFn.mock.calls[0]!;
    expect(call[0]).toBe('/api/fetch');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(call[1].body)).toEqual({ url: 'https://e.com/i.png' });
  });

  it('postFetchBytes POSTs the binary body with the given Content-Type', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ tmpId: 'x', width: 1, height: 1, previewUrl: '/p', mediaType: 'image/jpeg' }));
    const api = makeApi({ fetch: fetchFn as never });
    const bytes = new Uint8Array([1, 2, 3]);
    await api.postFetchBytes(bytes, 'image/jpeg');
    const call = fetchFn.mock.calls[0]!;
    expect(call[1].headers['Content-Type']).toBe('image/jpeg');
    expect(call[1].body).toBe(bytes);
  });

  it('throws on non-OK responses with the body error message', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: 'too big' }, 413));
    const api = makeApi({ fetch: fetchFn as never });
    await expect(api.postFetchUrl('https://e.com/big.png')).rejects.toThrow(/too big/);
  });

  it('resolveMedia returns ResolvedMedia on 200', async () => {
    const body = {
      directUrl: 'https://x/large.jpg',
      author: 'A',
      license: 'CC BY 4.0',
      sourceUrl: 'https://noirlab.edu/public/images/x/',
    };
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(body, 200));
    const api = makeApi({ fetch: fetchFn as never });
    const result = await api.resolveMedia('https://noirlab.edu/public/images/x/');
    expect(result).toEqual(body);
    const call = fetchFn.mock.calls[0]!;
    expect(call[0]).toBe('/api/resolve');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(call[1].body)).toEqual({ url: 'https://noirlab.edu/public/images/x/' });
  });

  it('resolveMedia returns null on 404', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: 'unknown host' }, 404));
    const api = makeApi({ fetch: fetchFn as never });
    const result = await api.resolveMedia('https://example.com/');
    expect(result).toBeNull();
  });

  it('resolveMedia throws on 422', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: 'unscrapeable' }, 422));
    const api = makeApi({ fetch: fetchFn as never });
    await expect(api.resolveMedia('https://noirlab.edu/public/images/x/')).rejects.toThrow();
  });

  it('resolveMedia throws on 502', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: 'upstream' }, 502));
    const api = makeApi({ fetch: fetchFn as never });
    await expect(api.resolveMedia('https://noirlab.edu/public/images/x/')).rejects.toThrow();
  });
});
