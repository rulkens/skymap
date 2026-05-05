/**
 * Tests for cloudLoader.reloadSource — the per-source abortable re-fetch
 * driven by `engine.setTier`.
 *
 * The hot-swap path must:
 *   1. Use the tier-aware filename (`sdss-medium.bin`, etc).
 *   2. Cancel any in-flight fetch for that source if reloadSource fires
 *      again before the previous one resolves (user clicking tiers fast).
 *   3. Call onResult exactly once with the latest decoded cloud, never with
 *      a stale buffer from the cancelled request.
 *
 * We stub `globalThis.fetch` rather than running real HTTP — keeps the test
 * pure and lets us deterministically simulate slow/fast races.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { reloadSource } from '../../../src/services/engine/cloudLoader';
import { encodePointCloud } from '../../../src/data/pointCloudFormat';
import { Source } from '../../../src/data/sources';
import type { PointCloud } from '../../../src/@types';

// Build a tiny valid encoded buffer.  Counts encoded into a real .bin so the
// decoder accepts it.
function tinyCloudBuf(count: number): ArrayBuffer {
  const cloud: PointCloud = {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count),
    positionAngleDeg: new Float32Array(count),
    diameterKpc: new Float32Array(count),
  };
  return encodePointCloud(cloud);
}

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('reloadSource', () => {
  it('fetches the tier-suffixed URL for tiered sources', async () => {
    const seenUrls: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      seenUrls.push(String(url));
      return new Response(tinyCloudBuf(3), { status: 200 });
    }) as unknown as typeof fetch;

    const onResult = vi.fn();
    await reloadSource(Source.SDSS, 'medium', onResult);

    expect(seenUrls).toEqual(['/data/sdss-medium.bin']);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0]![0]).toMatchObject({
      source: Source.SDSS,
      cloud: expect.objectContaining({ count: 3 }),
    });
  });

  it('uses the shared filename for non-tiered sources (2MRS)', async () => {
    const seenUrls: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      seenUrls.push(String(url));
      return new Response(tinyCloudBuf(1), { status: 200 });
    }) as unknown as typeof fetch;

    await reloadSource(Source.TwoMRS, 'small', vi.fn());
    expect(seenUrls).toEqual(['/data/2mrs.bin']);
  });

  it('aborts a prior in-flight fetch if reloadSource fires again for the same source', async () => {
    // First call: never resolves until we explicitly settle it AFTER the abort.
    let firstAborted = false;
    let firstSignal: AbortSignal | undefined;
    let resolveSecond!: (value: Response) => void;

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === '/data/sdss-medium.bin') {
        firstSignal = init?.signal ?? undefined;
        return new Promise<Response>((_, reject) => {
          firstSignal?.addEventListener('abort', () => {
            firstAborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      }
      if (String(url) === '/data/sdss-large.bin') {
        return new Promise<Response>((res) => {
          resolveSecond = res;
        });
      }
      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;

    const onResult = vi.fn();
    // Note: 'small' tier excludes SDSS (target 0) — we use 'medium' to keep
    // the first fetch live so the abort path can be observed.
    const p1 = reloadSource(Source.SDSS, 'medium', onResult);
    // Kick off the second call before the first settles.
    const p2 = reloadSource(Source.SDSS, 'large', onResult);

    // Settle the second.  reloadSource awaits arrayBuffer(), so we resolve
    // with a real Response carrying a tiny encoded cloud.
    resolveSecond(new Response(tinyCloudBuf(2), { status: 200 }));

    // Both calls return.  p1 should have been aborted (no callback fired);
    // p2 should have produced a single onResult.
    await Promise.allSettled([p1, p2]);

    expect(firstAborted).toBe(true);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0]![0].cloud.count).toBe(2);
  });
});
