import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  planRandomIndexSlices,
  pageFileName,
  buildGaiaPageQuery,
  buildGcnsQuery,
  buildHipXmatchQuery,
  gateDecision,
  fetchPagedCatalog,
  verifyPageRowTotal,
  type TapTransport,
} from '../../../tools/fetch/fetchGaia';

describe('planRandomIndexSlices', () => {
  it('tiles [0, total) contiguously: 1000 into 4 → bounds 0|250|500|750|1000', () => {
    const slices = planRandomIndexSlices(1000, 4);
    expect(slices.map((s) => s.start)).toEqual([0, 250, 500, 750]);
    expect(slices.map((s) => s.endExclusive)).toEqual([250, 500, 750, 1000]);
    // Each start equals the previous endExclusive — no gaps, no overlaps.
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i]!.start).toBe(slices[i - 1]!.endExclusive);
    }
  });

  it('a non-divisible total loses no rows: 1003 into 4 → last endExclusive is 1003', () => {
    const slices = planRandomIndexSlices(1003, 4);
    // First start is 0, last endExclusive is exactly total — the union is [0, 1003).
    expect(slices[0]!.start).toBe(0);
    expect(slices[slices.length - 1]!.endExclusive).toBe(1003);
    // Contiguous, and no empty slice swallowed the remainder.
    for (let i = 0; i < slices.length; i++) {
      expect(slices[i]!.endExclusive).toBeGreaterThan(slices[i]!.start);
      if (i > 0) expect(slices[i]!.start).toBe(slices[i - 1]!.endExclusive);
    }
  });
});

describe('pageFileName', () => {
  it("pads to four digits: 3 → 'gaia_page_0003.csv'; 1234 → 'gaia_page_1234.csv'", () => {
    expect(pageFileName(3)).toBe('gaia_page_0003.csv');
    expect(pageFileName(1234)).toBe('gaia_page_1234.csv');
  });
});

describe('buildGaiaPageQuery', () => {
  it('page query carries half-open slice bounds: {start: 100, endExclusive: 200} → contains \'random_index >= 100\' and \'random_index < 200\'', () => {
    // An off-by-one here duplicates or drops rows at every slice boundary:
    // slices are contiguous half-open ranges, so the low bound must be
    // inclusive (>=) and the high bound exclusive (<) — the load-bearing
    // assertion of this task.
    const query = buildGaiaPageQuery({ index: 0, start: 100, endExclusive: 200 });
    expect(query).toContain('random_index >= 100');
    expect(query).toContain('random_index < 200');
  });

  it('page query selects the pinned plan-02 column list in order', () => {
    const query = buildGaiaPageQuery({ index: 0, start: 0, endExclusive: 10 });
    // Plan 02's CSV parser consumes the header in this exact order — a
    // reorder silently mislabels every column downstream.
    const columns = [
      'source_id',
      'ra',
      'dec',
      'phot_g_mean_mag',
      'bp_rp',
      'r_med_geo',
      'r_med_photogeo',
      'random_index',
    ];
    let previous = -1;
    for (const column of columns) {
      const at = query.indexOf(column);
      expect(at).toBeGreaterThan(previous);
      previous = at;
    }
    expect(query).toContain('phot_g_mean_mag < 14');
  });
});

describe('buildGcnsQuery and buildHipXmatchQuery', () => {
  it('gcns and xmatch queries order by source_id', () => {
    // ORDER BY pins CSV byte order so the gaia.sha256 sidecar is meaningful
    // across re-fetches (gcns) and diffs stay stable (xmatch).
    expect(buildGcnsQuery()).toContain('ORDER BY source_id');
    expect(buildHipXmatchQuery()).toContain('ORDER BY source_id');
  });
});

describe('gateDecision', () => {
  it('aborts when stdin is not a TTY and --yes is absent', () => {
    // The real bug this guards: a dispatched background run (no TTY) must
    // never hang on an unanswerable prompt, and a piped "y" must never be
    // able to green-light a 2 GB pull nobody approved. Without --yes and
    // without a TTY the only safe answer is to stop with instructions.
    expect(gateDecision(false, false)).toBe('abort');
    // A real interactive terminal falls through to the y/N prompt.
    expect(gateDecision(false, true)).toBe('prompt');
    // --yes is explicit consent — it proceeds regardless of TTY-ness, so the
    // same flag works in CI and at an interactive shell.
    expect(gateDecision(true, false)).toBe('proceed');
    expect(gateDecision(true, true)).toBe('proceed');
  });
});

describe('fetchPagedCatalog', () => {
  let dir: string;

  // A tiny deterministic page body: the pinned header line plus `rows` data
  // lines. countDataRows must return exactly `rows` — the header never counts.
  const pageBody = (rows: number): string => {
    const header =
      'source_id,ra,dec,phot_g_mean_mag,bp_rp,r_med_geo,r_med_photogeo,random_index';
    const lines = [header];
    for (let r = 0; r < rows; r++) {
      lines.push(`${r},10.0,20.0,13.5,0.5,100,101,${r}`);
    }
    return lines.join('\n') + '\n';
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fetch-gaia-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('skips slices whose final page file exists: transport not called for them, skipped counted', async () => {
    const slices = planRandomIndexSlices(100, 2);
    // Slice 0 is already fully cached; the resume scan must never re-download it.
    writeFileSync(join(dir, pageFileName(0)), pageBody(2));
    const transport = vi.fn<TapTransport>(async () => pageBody(2));

    const result = await fetchPagedCatalog({ slices, dir, transport });

    expect(result.skipped).toBe(1);
    expect(result.fetched).toBe(1);
    // Transport ran once — for slice 1 only — and never saw slice 0's bounds.
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0]).toContain(`random_index >= ${slices[1]!.start}`);
    expect(existsSync(join(dir, pageFileName(1)))).toBe(true);
  });

  it('a leftover .part file does not count as complete: the slice is refetched and the .part replaced by the final file', async () => {
    const slices = planRandomIndexSlices(100, 1);
    // A crash left a partial write behind. A `.part` is never a completion
    // signal — the slice must refetch and the final file must appear.
    writeFileSync(join(dir, `${pageFileName(0)}.part`), 'truncated garbage');
    const transport = vi.fn<TapTransport>(async () => pageBody(2));

    const result = await fetchPagedCatalog({ slices, dir, transport });

    expect(result.fetched).toBe(1);
    expect(result.skipped).toBe(0);
    expect(existsSync(join(dir, pageFileName(0)))).toBe(true);
    expect(existsSync(join(dir, `${pageFileName(0)}.part`))).toBe(false);
  });

  it('on success no .part remains; on transport failure no final file exists for that slice', async () => {
    const slices = planRandomIndexSlices(100, 2);
    // Slice 1 (start 50) fails; slice 0 succeeds. Both halves of the
    // atomicity contract: the good slice leaves no .part, the bad slice
    // leaves no final file (a half-written page must never look complete).
    const transport = vi.fn<TapTransport>(async (query) => {
      if (query.includes(`random_index >= ${slices[1]!.start}`)) {
        throw new Error('HTTP 503: service unavailable');
      }
      return pageBody(2);
    });

    await fetchPagedCatalog({ slices, dir, transport });

    expect(existsSync(join(dir, pageFileName(0)))).toBe(true);
    expect(existsSync(join(dir, `${pageFileName(0)}.part`))).toBe(false);
    expect(existsSync(join(dir, pageFileName(1)))).toBe(false);
    expect(existsSync(join(dir, `${pageFileName(1)}.part`))).toBe(false);
  });

  it('a failing slice is counted and logged but does not stop the remaining slices', async () => {
    const slices = planRandomIndexSlices(300, 3);
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The middle slice fails; the fetcher must count it and carry on so a
    // single flaky page never aborts a multi-hour run.
    const transport = vi.fn<TapTransport>(async (query) => {
      if (query.includes(`random_index >= ${slices[1]!.start}`)) {
        throw new Error('HTTP 500: boom');
      }
      return pageBody(2);
    });

    const result = await fetchPagedCatalog({ slices, dir, transport });

    expect(result.failed).toBe(1);
    expect(result.fetched).toBe(2);
    // Slices after the failure still ran and landed on disk.
    expect(existsSync(join(dir, pageFileName(2)))).toBe(true);
    // The first failure was logged verbatim, not swallowed.
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('HTTP 500: boom'))).toBe(true);
    warn.mockRestore();
  });

  it('rowsFetched excludes each page CSV header line', async () => {
    const slices = planRandomIndexSlices(100, 2);
    // Two pages, each a header + 2 data rows. The header must not count:
    // 2 pages x 2 data rows = 4, never 6.
    const transport = vi.fn<TapTransport>(async () => pageBody(2));

    const result = await fetchPagedCatalog({ slices, dir, transport });

    expect(result.rowsFetched).toBe(4);
  });

  it('resume against a pages plan sliced for a different partition throws instead of mixing partitions', async () => {
    // First run pins (totalCount, sliceCount) in the plan sidecar.
    const firstSlices = planRandomIndexSlices(100, 2);
    const transport = vi.fn<TapTransport>(async () => pageBody(2));
    await fetchPagedCatalog({ slices: firstSlices, dir, transport });

    // A second run with a different totalCount would tile a different range —
    // resuming against the old pages would silently mix two partitions.
    const drifted = planRandomIndexSlices(200, 2);
    await expect(fetchPagedCatalog({ slices: drifted, dir, transport })).rejects.toThrow(
      /partition/i,
    );
  });
});

describe('verifyPageRowTotal', () => {
  let dir: string;

  const pageBody = (rows: number): string => {
    const header =
      'source_id,ra,dec,phot_g_mean_mag,bp_rp,r_med_geo,r_med_photogeo,random_index';
    const lines = [header];
    for (let r = 0; r < rows; r++) lines.push(`${r},10.0,20.0,13.5,0.5,100,101,${r}`);
    return lines.join('\n') + '\n';
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'verify-gaia-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('sums data rows across pages and throws on mismatch', async () => {
    // Three pages of 2 data rows each: hand-computed total is 6, headers excluded.
    writeFileSync(join(dir, pageFileName(0)), pageBody(2));
    writeFileSync(join(dir, pageFileName(1)), pageBody(2));
    writeFileSync(join(dir, pageFileName(2)), pageBody(2));

    await expect(verifyPageRowTotal(dir, 6)).resolves.toBe(6);

    // Drop one data row from one page → 5 rows now; the guard must reject and
    // name both the actual (5) and expected (6) counts.
    writeFileSync(join(dir, pageFileName(1)), pageBody(1));
    await expect(verifyPageRowTotal(dir, 6)).rejects.toThrow(/5.*6|6.*5/s);
  });
});
