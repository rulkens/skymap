import { describe, it, expect } from 'vitest';

import {
  planRandomIndexSlices,
  pageFileName,
  buildGaiaPageQuery,
  buildGcnsQuery,
  buildHipXmatchQuery,
  gateDecision,
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
