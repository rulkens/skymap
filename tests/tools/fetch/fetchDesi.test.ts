import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `delay` (tools/utils/async/delay.ts) is what downloadChunked's backoff
// awaits between retry attempts. Mocking it — rather than fighting fake
// timers against the real `fs/promises.open()` call `downloadChunked` also
// awaits — is the "injected sleep" half of the brief's "fake timers or
// injected sleep" allowance: the mock resolves instantly, so the retry test
// asserts the exact backoff *values* `downloadChunked` computed
// (`toHaveBeenCalledWith(1000)`, then `toHaveBeenCalledWith(2000)`) without
// depending on wall-clock or virtual-clock timing at all.
vi.mock('../../../tools/utils/async/delay', () => ({
  delay: vi.fn(async () => undefined),
}));

import { delay } from '../../../tools/utils/async/delay';
import {
  downloadChunked,
  planChunks,
  upsertSha256Sidecar,
  type RangeChunk,
  type RangeTransport,
} from '../../../tools/fetch/fetchDesi';

const MIB = 1024 * 1024;

/** Builds a deterministic, distinguishable byte buffer for a chunk — every
 *  byte is the chunk's index, so a corrupted assembly (wrong offset, wrong
 *  chunk, dropped chunk) shows up immediately as a byte-value mismatch
 *  rather than a same-looking blob. */
function chunkBytes(chunk: RangeChunk): Uint8Array {
  const length = chunk.endInclusive - chunk.start + 1;
  return new Uint8Array(length).fill(chunk.index);
}

describe('planChunks', () => {
  it('20 MiB at 8 MiB chunks produces 3 chunks; the last endInclusive is totalBytes - 1', () => {
    const totalBytes = 20 * MIB;
    const chunks = planChunks(totalBytes, 8 * MIB);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ index: 0, start: 0, endInclusive: 8 * MIB - 1 });
    expect(chunks[chunks.length - 1]!.endInclusive).toBe(totalBytes - 1);
  });

  it('an exact multiple produces no zero-length tail chunk', () => {
    const totalBytes = 16 * MIB;
    const chunks = planChunks(totalBytes, 8 * MIB);
    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toEqual({ index: 1, start: 8 * MIB, endInclusive: 16 * MIB - 1 });
  });
});

describe('downloadChunked', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fetch-desi-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('downloads all chunks and assembles a byte-identical file', async () => {
    const chunkSize = 10;
    const totalBytes = 25; // 3 chunks: [0,10) [10,20) [20,25)
    const destPath = join(dir, 'catalog.fits');
    const chunks = planChunks(totalBytes, chunkSize);
    const expected = new Uint8Array(totalBytes);
    for (const c of chunks) expected.set(chunkBytes(c), c.start);

    const transport = vi.fn<RangeTransport>(async (_url, start, endInclusive) =>
      chunkBytes({ index: Math.floor(start / chunkSize), start, endInclusive }),
    );

    const result = await downloadChunked({
      url: 'https://example.test/catalog.fits',
      destPath,
      totalBytes,
      transport,
      chunkBytes: chunkSize,
      concurrency: 2,
    });

    expect(result).toEqual({ bytesWritten: totalBytes, chunksFetched: 3, chunksResumed: 0 });
    expect(new Uint8Array(readFileSync(destPath))).toEqual(expected);
    // The .part file and state sidecar are cleaned up once the download completes.
    expect(existsSync(`${destPath}.part`)).toBe(false);
    expect(existsSync(`${destPath}.chunks.json`)).toBe(false);
  });

  it('retries on 503 with exponential backoff, then succeeds', async () => {
    vi.mocked(delay).mockClear();
    const totalBytes = 4;
    const bytes = new Uint8Array([1, 2, 3, 4]);
    let calls = 0;
    const transport = vi.fn<RangeTransport>(async () => {
      calls++;
      if (calls <= 2) {
        const err = new Error('service unavailable') as Error & { status?: number };
        err.status = 503;
        throw err;
      }
      return bytes;
    });

    const destPath = join(dir, 'retry.fits');
    const result = await downloadChunked({
      url: 'https://example.test/retry.fits',
      destPath,
      totalBytes,
      transport,
      chunkBytes: totalBytes, // single chunk, so retries are unambiguous
      concurrency: 1,
    });

    expect(transport).toHaveBeenCalledTimes(3);
    expect(result.chunksFetched).toBe(1);
    // baseDelayMs (1000) after the first failure, 2 * baseDelayMs (2000)
    // after the second — the exponential-backoff schedule from the brief.
    expect(vi.mocked(delay).mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it('rethrows immediately on 404 without retry', async () => {
    const totalBytes = 4;
    const transport = vi.fn<RangeTransport>(async () => {
      const err = new Error('not found') as Error & { status?: number };
      err.status = 404;
      throw err;
    });

    const destPath = join(dir, 'missing.fits');
    await expect(
      downloadChunked({
        url: 'https://example.test/missing.fits',
        destPath,
        totalBytes,
        transport,
        chunkBytes: totalBytes,
        concurrency: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('resumes: a second run fetches only the chunks the first (interrupted) run did not complete', async () => {
    const chunkSize = 10;
    const totalBytes = 30; // 3 chunks
    const destPath = join(dir, 'resume.fits');
    const chunks = planChunks(totalBytes, chunkSize);

    // First "run": chunk 2 (the last) permanently fails (non-retryable),
    // chunks 0 and 1 succeed and must be durably recorded before the
    // failure surfaces.
    const firstTransport = vi.fn<RangeTransport>(async (_url, start, endInclusive) => {
      const index = Math.floor(start / chunkSize);
      if (index === 2) {
        const err = new Error('not found') as Error & { status?: number };
        err.status = 404;
        throw err;
      }
      return chunkBytes({ index, start, endInclusive });
    });

    await expect(
      downloadChunked({
        url: 'https://example.test/resume.fits',
        destPath,
        totalBytes,
        transport: firstTransport,
        chunkBytes: chunkSize,
        concurrency: 3,
      }),
    ).rejects.toThrow();

    // Chunks 0 and 1 were attempted; chunk 2 was attempted and failed.
    expect(firstTransport).toHaveBeenCalledTimes(3);
    expect(existsSync(`${destPath}.part`)).toBe(true);
    expect(existsSync(`${destPath}.chunks.json`)).toBe(true);
    const state = JSON.parse(readFileSync(`${destPath}.chunks.json`, 'utf8')) as {
      completed: number[];
    };
    expect(state.completed.sort()).toEqual([0, 1]);

    // Second run: chunk 2 now succeeds. Only the missing chunk should be
    // requested from the transport.
    const secondTransport = vi.fn<RangeTransport>(async (_url, start, endInclusive) => {
      const index = Math.floor(start / chunkSize);
      return chunkBytes({ index, start, endInclusive });
    });

    const result = await downloadChunked({
      url: 'https://example.test/resume.fits',
      destPath,
      totalBytes,
      transport: secondTransport,
      chunkBytes: chunkSize,
      concurrency: 3,
    });

    expect(result.chunksResumed).toBe(2);
    expect(result.chunksFetched).toBe(1);
    expect(secondTransport).toHaveBeenCalledTimes(1);
    expect(secondTransport).toHaveBeenCalledWith(expect.any(String), 20, 29);

    const expected = new Uint8Array(totalBytes);
    for (const c of chunks) expected.set(chunkBytes(c), c.start);
    expect(new Uint8Array(readFileSync(destPath))).toEqual(expected);
  });

  it('never exceeds 6 chunks in flight', async () => {
    const chunkSize = 1;
    const totalBytes = 24; // 24 single-byte chunks
    const destPath = join(dir, 'concurrency.fits');

    let inFlight = 0;
    let maxInFlight = 0;
    const transport = vi.fn<RangeTransport>(async (_url, start, endInclusive) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Yield a macrotask so overlapping invocations actually overlap in
      // time rather than each resolving before the next call starts.
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return chunkBytes({ index: start, start, endInclusive });
    });

    await downloadChunked({
      url: 'https://example.test/concurrency.fits',
      destPath,
      totalBytes,
      transport,
      chunkBytes: chunkSize,
      // Default concurrency (no explicit `concurrency` field) — exercises
      // the documented default of 6 directly.
    });

    expect(maxInFlight).toBeLessThanOrEqual(6);
    expect(maxInFlight).toBeGreaterThan(1); // sanity: workers really did overlap
    expect(transport).toHaveBeenCalledTimes(24);
  });
});

describe('upsertSha256Sidecar', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fetch-desi-sha-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the sha256 sidecar line on completion', async () => {
    const filePath = join(dir, 'BGS_BRIGHT_NGC_clustering.dat.fits');
    writeFileSync(filePath, 'hello world');
    const sidecarPath = join(dir, 'desi_dr1_lss.sha256');

    const digest = await upsertSha256Sidecar(
      filePath,
      'BGS_BRIGHT_NGC_clustering.dat.fits',
      sidecarPath,
    );

    const contents = readFileSync(sidecarPath, 'utf8');
    expect(contents).toBe(`${digest}  BGS_BRIGHT_NGC_clustering.dat.fits\n`);
  });

  it('fails loudly when the sidecar pins a different hash', async () => {
    const filePath = join(dir, 'LRG_NGC_clustering.dat.fits');
    writeFileSync(filePath, 'the current bytes');
    const sidecarPath = join(dir, 'desi_dr1_lss.sha256');
    // Pin a hash that does NOT match the file above — simulates a stale
    // or truncated re-download.
    writeFileSync(
      sidecarPath,
      '0000000000000000000000000000000000000000000000000000000000000  LRG_NGC_clustering.dat.fits\n',
    );

    await expect(
      upsertSha256Sidecar(filePath, 'LRG_NGC_clustering.dat.fits', sidecarPath),
    ).rejects.toThrow(/mismatch/i);
  });
});
