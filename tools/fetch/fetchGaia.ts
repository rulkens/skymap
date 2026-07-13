#!/usr/bin/env node
/**
 * fetchGaia — paged, resumable TAP downloader for the Gaia DR3 bright-star
 * catalog (G < 14) plus its two supplements: the Gaia Catalogue of Nearby
 * Stars (GCNS, the 100 pc distance-quality patch) and Hipparcos-2 (the
 * bright-end patch for stars Gaia saturates on). Registry keys live under
 * `gaia.*` in `tools/utils/io/rawDataRegistry.ts`; the paged main-catalog
 * CSVs land in `data/raw/gaia/` (the `gaia.dir` entry) as
 * `gaia_page_<NNNN>.csv`, one file per `random_index` slice.
 *
 * ## Why page by `random_index`, not OFFSET
 *
 * TAP has no stable pagination: `OFFSET` over a ~1.81e9-row table is both
 * brutally slow (the server still walks the skipped rows) and unstable if
 * the service reorders results between requests. Gaia ships a precomputed
 * `random_index` column — a uniform shuffle of ALL DR3 sources into
 * `[0, totalCount)` — that turns paging into indexed range scans:
 * `WHERE random_index >= start AND random_index < endExclusive` is fast,
 * deterministic, and each slice is a statistically uniform sample of the
 * whole sky. Slices are half-open and contiguous, so their union is exactly
 * the full catalog with no row fetched twice and none dropped. The G < 14
 * magnitude cut is applied inside each slice's ADQL, so a slice of N
 * `random_index` values returns ~N x 0.93% actual rows.
 *
 * ## Resume model
 *
 * One CSV file per slice, named by `pageFileName(index)`. A page that
 * downloads completely is written to its final name; a page that fails
 * mid-flight never is. Re-running the fetcher lists `data/raw/gaia/`,
 * skips every page file already present, and fetches only the missing
 * indices — the same "write success, never write failure, let the next
 * run pick up the remainder" rule `fetchHyperLeda` (row-per-line) and
 * `fetchDesi` (byte-range-per-offset) use, adapted to page-per-file. The
 * filename format is therefore an on-disk contract: changing it orphans
 * every previously fetched page.
 *
 * ## Size gate
 *
 * `totalCount` is probed live (a `COUNT(*)`-shaped ADQL query) rather than
 * hardcoded, so the partitioner below stays pure and the upstream row count
 * is never baked into source. Before committing to the multi-hour paged
 * fetch, the probe's implied download size is checked against an expected
 * envelope — a wildly-off count means the cut or the table changed
 * upstream, and the right response is to stop and investigate, not to
 * quietly fill the disk with the wrong catalog.
 */

/** One half-open `random_index` range: rows with `start <= random_index < endExclusive`. */
export type RandomIndexSlice = { index: number; start: number; endExclusive: number };

// 256 slices over the full DR3 count works out to ~66 k rows / ~7 MB per
// response after the G < 14 cut — comfortably inside TAP sync limits, and
// small enough that a lost connection wastes minutes of progress, not hours.
const PAGE_SLICE_COUNT = 256;

/**
 * Partition [0, totalCount) into sliceCount contiguous half-open ranges.
 * random_index is Gaia's uniform shuffle over ALL ~1.81e9 DR3 sources, so
 * each slice returns ~totalCount/sliceCount x 0.93% rows after the G<14 cut.
 *
 * Every slice is `floor(totalCount / sliceCount)` wide except the last,
 * which absorbs the remainder — each start equals the previous slice's
 * endExclusive, so the union is exactly [0, totalCount) with no gap, no
 * overlap, and no dropped remainder rows.
 */
export function planRandomIndexSlices(totalCount: number, sliceCount: number): RandomIndexSlice[] {
  const base = Math.floor(totalCount / sliceCount);
  const slices: RandomIndexSlice[] = [];
  for (let index = 0; index < sliceCount; index++) {
    const start = index * base;
    const endExclusive = index === sliceCount - 1 ? totalCount : start + base;
    slices.push({ index, start, endExclusive });
  }
  return slices;
}

/**
 * 'gaia_page_0003.csv' — zero-padded so lexicographic order = slice order.
 * This name is the resume cache key: changing the format orphans every
 * previously fetched page.
 */
export function pageFileName(index: number): string {
  return `gaia_page_${String(index).padStart(4, '0')}.csv`;
}

/** ESA Gaia TAP synchronous query endpoint. */
export const GAIA_TAP_SYNC_URL = 'https://gea.esac.esa.int/tap-server/tap/sync';

/**
 * Bright-star magnitude cut. G < 14 keeps the catalog to the ~0.93% of DR3
 * that renders as a visible star field without saturating the point budget;
 * the same value gates every page's ADQL so the union stays a single cut.
 */
export const G_MAG_LIMIT = 14.0;

/**
 * ADQL for one main-catalog page: the G<14 bright stars whose random_index
 * falls in this slice's half-open range, joined to the Bailer-Jones EDR3
 * geometric/photogeometric distance estimates.
 *
 * The join uses the `USING (source_id)` spelling, which is the tidier form
 * and is verified live-accepted by the ESA TAP sync endpoint (a TOP-2 probe
 * returned data rows). The verbose `ON g.source_id = d.source_id` alternative
 * is the safe fallback if the service ever rejects USING.
 *
 * The SELECT column order is a cross-plan contract: plan 02's CSV parser
 * consumes the response header positionally, so these eight columns must
 * appear in exactly this order — never reorder them.
 *
 * No ORDER BY: pages aren't sha-pinned and their row order is irrelevant to
 * plan 02, so a server-side sort over ~16.8 M rows per slice would only cost
 * time. The half-open bounds (>= start, < endExclusive) match planRandomIndexSlices
 * so contiguous slices tile the catalog with no duplicated or dropped boundary row.
 */
export function buildGaiaPageQuery(slice: RandomIndexSlice): string {
  return `SELECT g.source_id, g.ra, g.dec, g.phot_g_mean_mag, g.bp_rp,
       d.r_med_geo, d.r_med_photogeo, g.random_index
FROM gaiadr3.gaia_source_lite AS g
LEFT OUTER JOIN external.gaiaedr3_distance AS d USING (source_id)
WHERE g.phot_g_mean_mag < ${G_MAG_LIMIT}
  AND g.random_index >= ${slice.start} AND g.random_index < ${slice.endExclusive}`;
}

/**
 * ADQL for the Gaia Catalogue of Nearby Stars (100 pc distance-quality patch).
 * ORDER BY source_id pins the CSV byte order so the committed gaia.sha256
 * sidecar stays meaningful across re-fetches. Column list is pinned to match
 * the downstream parser.
 */
export function buildGcnsQuery(): string {
  return `SELECT source_id, ra, dec, parallax, dist_50,
       phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag
FROM external.gaiaedr3_gcns_main_1
ORDER BY source_id`;
}

/**
 * ADQL for the Hipparcos-2 best-neighbour cross-match (bright-end patch for
 * stars Gaia saturates on). ORDER BY source_id costs little on this small
 * table and keeps re-fetch diffs stable even without a sha256 sidecar.
 */
export function buildHipXmatchQuery(): string {
  return `SELECT source_id, original_ext_source_id, angular_distance,
       number_of_neighbours, xm_flag
FROM gaiadr3.hipparcos2_best_neighbour
ORDER BY source_id`;
}
