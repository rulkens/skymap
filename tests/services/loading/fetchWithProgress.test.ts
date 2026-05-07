import { describe, expect, it, vi, afterEach } from 'vitest';
import { HttpError, fetchWithProgress, dataUrl } from '../../../src/services/loading/fetchWithProgress';

describe('HttpError', () => {
  it('exposes status and url', () => {
    const e = new HttpError(502, 'https://example.com/x.bin');
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(502);
    expect(e.url).toBe('https://example.com/x.bin');
    expect(e.message).toContain('502');
    expect(e.message).toContain('x.bin');
  });
});

describe('dataUrl', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('uses VITE_DATA_BASE_URL when set', () => {
    vi.stubEnv('VITE_DATA_BASE_URL', 'https://skymap-data.rulkens.com');
    expect(dataUrl('sdss.bin')).toBe('https://skymap-data.rulkens.com/data/sdss.bin');
  });
  it('falls back to relative /data/ when env empty', () => {
    vi.stubEnv('VITE_DATA_BASE_URL', '');
    expect(dataUrl('sdss.bin')).toBe('/data/sdss.bin');
  });
  it('strips trailing slash on base', () => {
    vi.stubEnv('VITE_DATA_BASE_URL', 'https://x.example/');
    expect(dataUrl('y.bin')).toBe('https://x.example/data/y.bin');
  });
});

describe('fetchWithProgress', () => {
  it('returns ArrayBuffer and reports progress', async () => {
    const body = new Uint8Array([1, 2, 3, 4, 5]);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(body.slice(0, 3));
        controller.enqueue(body.slice(3, 5));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'Content-Length': '5' } }),
    );
    const ctrl = new AbortController();
    const events: Array<[number, number]> = [];
    const buf = await fetchWithProgress('http://x/', ctrl.signal, (l, t) => events.push([l, t]));
    expect(new Uint8Array(buf)).toEqual(body);
    expect(events.at(-1)).toEqual([5, 5]);
  });

  it('throws HttpError on non-2xx', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('x', { status: 404 }));
    const ctrl = new AbortController();
    await expect(fetchWithProgress('http://x/', ctrl.signal, () => {})).rejects.toMatchObject({
      status: 404,
    });
  });

  it('falls back to res.arrayBuffer() when body is null', async () => {
    const buf = new Uint8Array([9, 9]).buffer;
    const res = new Response(null, { status: 200 });
    Object.defineProperty(res, 'body', { value: null });
    res.arrayBuffer = vi.fn().mockResolvedValue(buf);
    globalThis.fetch = vi.fn().mockResolvedValue(res);
    const out = await fetchWithProgress('http://x/', new AbortController().signal, () => {});
    expect(new Uint8Array(out)).toEqual(new Uint8Array(buf));
  });
});
