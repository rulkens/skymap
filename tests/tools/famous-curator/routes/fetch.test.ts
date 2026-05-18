/**
 * /api/fetch — URL + multipart upload tests.
 *
 * The handler is pure over an injected `imageFetcher` (URL → Buffer)
 * and a `sessionFactory` (no-arg → { tmpId, dir }).  Tests drive both,
 * plus an in-memory fs adapter so we don't write to the real tmpdir.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleFetch } from '../../../../tools/famous-curator/plugin/routes/fetch';

async function makePng(width = 32, height = 16): Promise<Buffer> {
  return await sharp({
    create: { width, height, channels: 4, background: { r: 80, g: 90, b: 100, alpha: 1 } },
  }).png().toBuffer();
}

function fakeSession() {
  const dir = mkdtempSync(join(tmpdir(), 'curator-fetch-test-'));
  return { tmpId: 'tmpfixture', dir };
}

describe('handleFetch', () => {
  it('downloads the URL, writes source files, and returns dimensions + previewUrl', async () => {
    const png = await makePng(64, 48);
    const session = fakeSession();
    const result = await handleFetch({
      body: { url: 'https://example.com/img.png' },
      imageFetcher: async () => ({ bytes: png, mediaType: 'image/png' }),
      sessionFactory: () => session,
    });
    expect(result.tmpId).toBe('tmpfixture');
    expect(result.width).toBe(64);
    expect(result.height).toBe(48);
    expect(result.mediaType).toBe('image/png');
    expect(result.previewUrl).toBe('/api/preview/tmpfixture/source.webp');
    // Full-resolution source.png is written.
    expect(readFileSync(join(session.dir, 'source.png')).byteLength).toBeGreaterThan(0);
    // Preview WebP is written.
    expect(readFileSync(join(session.dir, 'source.webp')).byteLength).toBeGreaterThan(0);
  });

  it('rejects responses larger than 50 MB', async () => {
    const big = Buffer.alloc(50 * 1024 * 1024 + 1);
    await expect(
      handleFetch({
        body: { url: 'https://example.com/huge.png' },
        imageFetcher: async () => ({ bytes: big, mediaType: 'image/png' }),
        sessionFactory: fakeSession,
      }),
    ).rejects.toThrow(/50 MB/);
  });

  it('rejects non-image media types', async () => {
    await expect(
      handleFetch({
        body: { url: 'https://example.com/page.html' },
        imageFetcher: async () => ({ bytes: Buffer.from('<html>'), mediaType: 'text/html' }),
        sessionFactory: fakeSession,
      }),
    ).rejects.toThrow(/not an image/);
  });

  it('accepts a multipart bytes payload directly', async () => {
    const png = await makePng();
    const session = fakeSession();
    const result = await handleFetch({
      body: { bytes: png, mediaType: 'image/png' },
      imageFetcher: async () => { throw new Error('should not fetch'); },
      sessionFactory: () => session,
    });
    expect(result.width).toBe(32);
  });
});
