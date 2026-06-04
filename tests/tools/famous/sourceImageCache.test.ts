/**
 * sourceImageCache — persistent download cache for curator source images.
 *
 * Curator downloads otherwise land in an ephemeral session dir, so resume /
 * re-curation / the thumb backfill all re-fetch the same originals.  This
 * cache keys bytes by sha256(url) under data/raw/famous/source-cache/ so a
 * second request for the same URL is served from disk.
 *
 * The seam under test is `fetchWithCache`: given an injected downloader and a
 * cache dir, a miss downloads-then-persists and a hit reads from disk without
 * calling the downloader at all.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceCacheKey, fetchWithCache } from '../../../tools/famous/sourceImageCache';

function tmpCacheDir(): string {
  return mkdtempSync(join(tmpdir(), 'source-cache-'));
}

describe('sourceImageCache', () => {
  it('derives a stable hex key from the URL', () => {
    const a = sourceCacheKey('https://example.com/m31.png');
    const b = sourceCacheKey('https://example.com/m31.png');
    const c = sourceCacheKey('https://example.com/m33.png');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('downloads on a miss and persists the bytes + media type', async () => {
    const cacheDir = tmpCacheDir();
    let calls = 0;
    const download = async () => {
      calls++;
      return { bytes: Buffer.from('PNGDATA'), mediaType: 'image/png' };
    };

    const first = await fetchWithCache('https://example.com/m31.png', { download, cacheDir });

    expect(calls).toBe(1);
    expect(first.fromCache).toBe(false);
    expect(first.bytes.toString()).toBe('PNGDATA');
    expect(first.mediaType).toBe('image/png');
  });

  it('serves a hit from disk without calling the downloader', async () => {
    const cacheDir = tmpCacheDir();
    let calls = 0;
    const download = async () => {
      calls++;
      return { bytes: Buffer.from('PNGDATA'), mediaType: 'image/png' };
    };

    const url = 'https://example.com/m31.png';
    await fetchWithCache(url, { download, cacheDir });
    const second = await fetchWithCache(url, { download, cacheDir });

    // Downloader ran exactly once; the second call was a pure cache read.
    expect(calls).toBe(1);
    expect(second.fromCache).toBe(true);
    expect(second.bytes.toString()).toBe('PNGDATA');
    expect(second.mediaType).toBe('image/png');
  });
});
