import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Same "injected sleep" idiom as tests/tools/fetch/fetchDesi.test.ts: mocking
// `delay` lets the retry test assert the exact backoff values
// (`toHaveBeenCalledWith(1000)`, then `(2000)`) with no wall-clock or fake-timer
// dependency at all.
vi.mock('../../../tools/utils/async/delay', () => ({
  delay: vi.fn(async () => undefined),
}));

import { delay } from '../../../tools/utils/async/delay';
import {
  eoxTileIndicesForBbox,
  eoxResponseIsImage,
  harvestEoxTiles,
  parseCliArgs,
  type EoxTileTransport,
} from '../../../tools/fetch/fetchEoxTiles';

describe('eoxTileIndicesForBbox', () => {
  it('enumerates the correct row/col range for the Copenhagen bbox at z13', () => {
    // WGS84 TMS at z13: columns = 2^14 = 16384, rows = 2^13 = 8192,
    // tileDeg = 180/8192 = 0.02197265625 (square in degree-space — same
    // value whether derived from 360/columns or 180/rows).
    //
    // colMin = floor((12.4 - -180) / tileDeg) = floor(192.4 / tileDeg) = 8756
    // colMax = floor((12.9 - -180) / tileDeg) = floor(192.9 / tileDeg) = 8779
    // rowMin = floor((90 - 55.8) / tileDeg)   = floor(34.2 / tileDeg)  = 1556
    // rowMax = floor((90 - 55.5) / tileDeg)   = floor(34.5 / tileDeg)  = 1570
    // (hand-computed and cross-checked with a throwaway node -e script —
    // see task-6-report.md)
    const bbox = { west: 12.4, south: 55.5, east: 12.9, north: 55.8 };
    const indices = eoxTileIndicesForBbox(bbox, 13);

    const cols = new Set(indices.map((t) => t.col));
    const rows = new Set(indices.map((t) => t.row));
    expect(Math.min(...cols)).toBe(8756);
    expect(Math.max(...cols)).toBe(8779);
    expect(Math.min(...rows)).toBe(1556);
    expect(Math.max(...rows)).toBe(1570);

    // 24 columns x 15 rows falls out of the hand-computed bounds above —
    // not an independent restatement of the spec's rough "~276" estimate.
    expect(indices).toHaveLength(24 * 15);
  });

  it('does not transpose row and column ranges', () => {
    // z3: columns = 16, rows = 8, tileDeg = 22.5deg. A bbox spanning 89deg
    // of longitude (4 columns) but only 22deg of latitude (1 row) — a
    // transposition bug would swap these and produce 1 column x 4 rows
    // instead, the same tile COUNT but the wrong coordinates entirely.
    const bbox = { west: -180, south: 68, east: -91, north: 90 };
    const indices = eoxTileIndicesForBbox(bbox, 3);

    const cols = indices.map((t) => t.col).sort((a, b) => a - b);
    const rows = indices.map((t) => t.row);

    expect(new Set(cols)).toEqual(new Set([0, 1, 2, 3]));
    expect(new Set(rows)).toEqual(new Set([0]));
    expect(indices).toHaveLength(4);
  });
});

describe('parseCliArgs', () => {
  it('parses the bbox correctly regardless of whether --level precedes or follows it', () => {
    const expected = { bbox: { west: 10, south: 20, east: 30, north: 40 }, level: 9 };
    expect(parseCliArgs(['--level', '9', '10', '20', '30', '40'])).toEqual(expected);
    expect(parseCliArgs(['10', '20', '30', '40', '--level', '9'])).toEqual(expected);
  });
});

describe('eoxResponseIsImage', () => {
  it('classifies content-types', () => {
    expect(eoxResponseIsImage('image/jpeg')).toBe(true);
    expect(eoxResponseIsImage('text/html; charset=utf-8')).toBe(false);
    expect(eoxResponseIsImage(null)).toBe(false);
  });
});

describe('harvestEoxTiles', () => {
  let dir: string;

  beforeEach(() => {
    vi.mocked(delay).mockClear();
    dir = mkdtempSync(join(tmpdir(), 'fetch-eox-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // z1 bbox chosen to enumerate exactly one tile — row 0, col 2 — so the
  // retry/resume assertions below aren't muddied by a multi-tile loop.
  const oneTileBbox = { west: 10, south: 10, east: 20, north: 20 };
  const oneTileLevel = 1;

  it('retries on 503 with exponential backoff, then succeeds', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    let calls = 0;
    const transport = vi.fn<EoxTileTransport>(async () => {
      calls++;
      if (calls <= 2) {
        const err = new Error('service unavailable') as Error & { status?: number };
        err.status = 503;
        throw err;
      }
      return bytes;
    });

    const result = await harvestEoxTiles({
      bbox: oneTileBbox,
      level: oneTileLevel,
      outDir: dir,
      transport,
      throttleMs: 0, // isolate the backoff delays from the post-fetch throttle delay
    });

    expect(transport).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ tilesFetched: 1, tilesSkipped: 0 });
    expect(vi.mocked(delay).mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
    expect(new Uint8Array(readFileSync(join(dir, '1', '0', '2.jpg')))).toEqual(bytes);
  });

  it('rethrows immediately on 404 without retry', async () => {
    const transport = vi.fn<EoxTileTransport>(async () => {
      const err = new Error('not found') as Error & { status?: number };
      err.status = 404;
      throw err;
    });

    await expect(
      harvestEoxTiles({
        bbox: oneTileBbox,
        level: oneTileLevel,
        outDir: dir,
        transport,
        throttleMs: 0,
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it('skips a tile whose file already exists on disk — no transport call, no chunk-state sidecar', async () => {
    const tileDir = join(dir, '1', '0');
    mkdirSync(tileDir, { recursive: true });
    writeFileSync(join(tileDir, '2.jpg'), 'already fetched');

    const transport = vi.fn<EoxTileTransport>(async () => {
      throw new Error('transport should never be called for an existing tile');
    });

    const result = await harvestEoxTiles({
      bbox: oneTileBbox,
      level: oneTileLevel,
      outDir: dir,
      transport,
      throttleMs: 0,
    });

    expect(transport).not.toHaveBeenCalled();
    expect(result).toEqual({ tilesFetched: 0, tilesSkipped: 1 });
    // Resume-by-file-existence, unlike fetchDesi's chunk sidecar — nothing
    // else should have been written next to the tile.
    expect(existsSync(join(dir, '1', '0', '2.jpg.chunks.json'))).toBe(false);
  });
});
