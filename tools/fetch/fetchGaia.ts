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

/**
 * What a fetch run still has to download after the resume scan. The main
 * catalog is counted in *slices remaining* (pages already on disk are
 * skipped), the four supplements as booleans (each is one all-or-nothing
 * file). `estimateRemainingBytes` turns this into the number printed for
 * consent; `totalPageSlices` is carried alongside `pageSlicesRemaining` so
 * the estimate can pro-rate the catalog's byte envelope by the fraction of
 * pages that actually remain — a resume with most pages cached quotes the
 * remainder, not the full ~1.7 GB.
 */
export type FetchWorkPlan = {
  pageSlicesRemaining: number;
  totalPageSlices: number;
  gcnsNeeded: boolean;
  hip2Needed: boolean;
  hipReadmeNeeded: boolean;
  xmatchNeeded: boolean;
};

// Byte envelopes for the size estimate. These are deliberately approximate:
// the number gates human consent, it does not meter the transfer, so a
// round-ish figure that is right to a few percent is all that's warranted.
//   - Main catalog: 16.84 M rows surviving the G<14 cut x ~100 B/row CSV.
//   - GCNS: ~331 k rows, ~30 MB observed.
//   - hip2.dat: fixed-width, exactly 117,955 rows x 277 B/line = 32,673,535 B.
//   - Hipparcos ReadMe: a small VizieR byte-layout doc, ~20 KB.
//   - hip xmatch: ~99.5 k rows, ~3 MB.
const GAIA_CATALOG_BYTES = 16_840_000 * 100;
const GCNS_BYTES = 30_000_000;
const HIP2_BYTES = 117_955 * 277;
const HIP_README_BYTES = 20_000;
const XMATCH_BYTES = 3_000_000;

/** Rough remaining bytes: pages ≈ remaining/total share of ~1.7 GB
 *  (16.84 M rows × ~100 B/row CSV), GCNS ~30 MB, hip2 32,673,535 B exact
 *  (117,955 × 277), ReadMe ~20 KB, xmatch ~3 MB. An estimate, printed as
 *  such — it gates consent, it does not meter the transfer. */
export function estimateRemainingBytes(work: FetchWorkPlan): number {
  const pagesBytes =
    work.totalPageSlices === 0
      ? 0
      : Math.round((work.pageSlicesRemaining / work.totalPageSlices) * GAIA_CATALOG_BYTES);
  return (
    pagesBytes +
    (work.gcnsNeeded ? GCNS_BYTES : 0) +
    (work.hip2Needed ? HIP2_BYTES : 0) +
    (work.hipReadmeNeeded ? HIP_README_BYTES : 0) +
    (work.xmatchNeeded ? XMATCH_BYTES : 0)
  );
}

/**
 * The tight-network consent gate as a pure decision. TTY-ness is the
 * caller's input (this function never touches process.stdin), so the rule is
 * trivially testable: `--yes` is explicit consent and always proceeds; an
 * interactive terminal falls through to the y/N prompt; everything else — a
 * background/CI run with no `--yes` — aborts rather than hang forever on an
 * unanswerable prompt or, worse, let a piped "y" green-light a 2 GB pull.
 */
export function gateDecision(yesFlag: boolean, isTTY: boolean): 'proceed' | 'prompt' | 'abort' {
  if (yesFlag) return 'proceed';
  if (isTTY) return 'prompt';
  return 'abort';
}

/** Human-readable byte size for the consent preamble (MB below 1 GB, else GB). */
function formatBytes(bytes: number): string {
  const mb = bytes / 1_000_000;
  return mb >= 1000 ? `${(mb / 1000).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

/**
 * Print the pre-gate preamble: per-artifact remaining-vs-cached status, the
 * total byte estimate, and the `--yes` hint. `main()` (Task 9) calls this
 * after the resume scan and before `gateDecision`, so the numbers reflect
 * what actually remains to download, not the full catalog.
 */
export function printFetchPreamble(work: FetchWorkPlan): void {
  const cachedPages = work.totalPageSlices - work.pageSlicesRemaining;
  const supplement = (label: string, needed: boolean): string =>
    `  ${needed ? 'fetch' : 'cached'}  ${label}`;

  console.log('Gaia DR3 bright-star fetch — remaining work after resume scan:');
  console.log(
    `  ${work.pageSlicesRemaining} of ${work.totalPageSlices} main-catalog pages to fetch ` +
      `(${cachedPages} cached)`,
  );
  console.log(supplement('GCNS (nearby-stars supplement)', work.gcnsNeeded));
  console.log(supplement('Hipparcos-2 (hip2.dat)', work.hip2Needed));
  console.log(supplement('Hipparcos-2 ReadMe', work.hipReadmeNeeded));
  console.log(supplement('Hipparcos↔Gaia cross-match', work.xmatchNeeded));
  console.log(`Estimated download: ~${formatBytes(estimateRemainingBytes(work))} (approximate).`);
  console.log('This is a large transfer on a metered/tight network. Pass --yes to proceed.');
}
