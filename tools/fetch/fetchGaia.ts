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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { downloadWithResume, sha256OfFile } from './fetchCosmicflows4';

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
 * The Hipparcos-2 fixed-width table and its byte-layout ReadMe are plain HTTP
 * files on CDS — not TAP queries — so they use `downloadWithResume` rather than
 * the TAP transport. VizieR serves them uncompressed at these ftp/ paths.
 */
export const HIP2_URL = 'https://cdsarc.cds.unistra.fr/ftp/I/311/hip2.dat';
export const HIP2_README_URL = 'https://cdsarc.cds.unistra.fr/ftp/I/311/ReadMe';

/**
 * The exact record count of the Hipparcos-2 catalogue (van Leeuwen 2007, VizieR
 * I/311): one fixed-width line per star. A truncated Range-resume — the failure
 * mode a dumb-HTTP download risks — surfaces as a short line count here, so the
 * download is only accepted once the file carries exactly this many lines.
 */
export const EXPECTED_HIP2_LINES = 117_955;

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

/**
 * Injected fetch so tests never touch the network. Given one page's ADQL it
 * resolves to the raw CSV body, or rejects on an HTTP/network error whose
 * message carries the status and a body snippet (the fetch2massXsc TAP-error
 * spelling). `main()` supplies a real POST-to-TAP transport; tests supply a
 * `vi.fn<TapTransport>()` returning deterministic tiny bodies.
 */
export type TapTransport = (query: string) => Promise<string>;

/**
 * The tally a paged run returns. `fetched`/`skipped`/`failed` partition the
 * slices this run touched; `rowsFetched` sums the data rows (CSV header
 * excluded per page) actually written this run. A failed slice contributes to
 * `failed` only — it is logged, never written, and picked up by the next run.
 */
export type PagedFetchResult = {
  fetched: number;
  skipped: number;
  failed: number;
  rowsFetched: number;
};

/**
 * The expected number of DR3 rows surviving the G < 14 cut across the whole
 * paged catalog. `verifyPageRowTotal` asserts the summed page rows equal this
 * once every slice is present and none failed — a short count means a
 * truncated or missing page, a long count means the cut or upstream table
 * changed. Measured against DR3; bump it only when the cut or catalog moves.
 */
export const EXPECTED_G14_ROWS = 16_844_156;

/**
 * The slice partition is identified by `(totalCount, sliceCount)`: change
 * either and the half-open ranges retile [0, totalCount) differently, so
 * previously-cached pages no longer line up with the current slices and a
 * resume would silently interleave two partitions. This sidecar, written into
 * the pages directory on the first run, pins those two numbers so a later run
 * with drifted inputs fails loudly instead of mixing partitions. It lives with
 * the cache it describes, so it needs no registry key and no gitignore edit —
 * deleting the pages directory deletes it too.
 */
const PLAN_SIDECAR_NAME = 'pages.plan.json';

/** The `(totalCount, sliceCount)` identity of the partition the cached pages belong to. */
type PagesPlan = { totalCount: number; sliceCount: number };

/**
 * Count the data rows in one page's CSV body: non-empty lines minus the header
 * line. An empty body or a header-only page is zero data rows. This is the one
 * place the "header never counts" rule lives, shared by the fetch tally and
 * the completion-time verification.
 */
function countDataRows(csvBody: string): number {
  const nonEmpty = csvBody.split(/\r?\n/).filter((line) => line.length > 0);
  return Math.max(0, nonEmpty.length - 1);
}

/** Zero-padded page index/total for the per-slice progress line (0042/0256). */
function progressLabel(index: number, total: number): string {
  const width = Math.max(4, String(total).length);
  return `${String(index).padStart(width, '0')}/${String(total).padStart(width, '0')}`;
}

/**
 * Fetch every slice sequentially — one request in flight at a time, so a lost
 * connection wastes one page's minutes, not the whole run's hours, and the TAP
 * endpoint is never hammered with parallel heavy scans. Resume is filename-per-
 * slice: a slice whose final page file already exists is skipped without
 * calling the transport; otherwise the body is written to `<file>.part` and
 * renamed to its final name only once the write completed, so a crash mid-write
 * leaves a `.part` that the next run overwrites rather than a truncated file
 * that masquerades as complete.
 *
 * A transport rejection is counted, its first occurrence logged verbatim
 * (the fetchHyperLeda counted-failure discipline), and the run continues — the
 * resume path is the retry mechanism, so a re-run fetches only the slices that
 * failed. Before any fetch, the partition identity `(totalCount, sliceCount)`
 * derived from the slices is checked against (or written to) the plan sidecar;
 * a mismatch throws rather than resume against a differently-tiled cache.
 */
export async function fetchPagedCatalog(opts: {
  slices: readonly RandomIndexSlice[];
  dir: string;
  transport: TapTransport;
}): Promise<PagedFetchResult> {
  const { slices, dir, transport } = opts;
  await mkdir(dir, { recursive: true });

  // The slices carry their own partition identity: the last slice's
  // endExclusive is the totalCount they were cut from, and their length is the
  // slice count. Pin (or verify) that identity before touching any page.
  const derived: PagesPlan = {
    totalCount: slices.length > 0 ? slices[slices.length - 1]!.endExclusive : 0,
    sliceCount: slices.length,
  };
  const sidecarPath = join(dir, PLAN_SIDECAR_NAME);
  if (existsSync(sidecarPath)) {
    const saved = JSON.parse(await readFile(sidecarPath, 'utf8')) as PagesPlan;
    if (saved.totalCount !== derived.totalCount || saved.sliceCount !== derived.sliceCount) {
      throw new Error(
        `Gaia page partition drift: cached pages in ${dir} were sliced for ` +
          `(totalCount=${saved.totalCount}, slices=${saved.sliceCount}), but this run ` +
          `derives (totalCount=${derived.totalCount}, slices=${derived.sliceCount}). ` +
          `Resuming would mix two partitions. Delete the page files and ${PLAN_SIDECAR_NAME} ` +
          `in ${dir}, then re-run to fetch a fresh partition.`,
      );
    }
  } else {
    await writeFile(sidecarPath, `${JSON.stringify(derived, null, 2)}\n`);
  }

  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  let rowsFetched = 0;
  let firstError: string | undefined;

  for (const slice of slices) {
    const finalPath = join(dir, pageFileName(slice.index));
    if (existsSync(finalPath)) {
      skipped++;
      continue;
    }
    const partPath = `${finalPath}.part`;
    try {
      const body = await transport(buildGaiaPageQuery(slice));
      // Write to `.part`, then rename — an interrupted write leaves the
      // `.part` (overwritten next run), never a truncated final file.
      await writeFile(partPath, body);
      await rename(partPath, finalPath);
      const rows = countDataRows(body);
      rowsFetched += rows;
      fetched++;
      console.log(
        `page ${progressLabel(slice.index, slices.length)}: ` +
          `${rows.toLocaleString()} rows (${failed} failed so far)`,
      );
    } catch (error) {
      // Network/HTTP failure: DO NOT write a page — resume retries it next
      // run. Count it and log the first one verbatim; a silent catch would let
      // an outage wipe a run with no visible error.
      failed++;
      const message = (error as Error).message;
      if (firstError === undefined) {
        firstError = message;
        console.error(`  WARN first page fetch failure for slice ${slice.index}: ${firstError}`);
      }
    }
  }

  return { fetched, skipped, failed, rowsFetched };
}

/**
 * Sum the data rows across every `gaia_page_*.csv` in `dir` (each file's header
 * line excluded) and throw a loud, actionable message unless the total equals
 * `expected`. Call this only once a run reports zero failures and no missing
 * slice — it is the completion gate that catches a truncated page or a silently
 * changed cut before the pages feed the downstream binary builder.
 */
export async function verifyPageRowTotal(dir: string, expected: number): Promise<number> {
  const entries = await readdir(dir);
  const pageFiles = entries.filter((name) => /^gaia_page_\d+\.csv$/.test(name)).sort();

  let total = 0;
  for (const name of pageFiles) {
    total += countDataRows(await readFile(join(dir, name), 'utf8'));
  }

  if (total !== expected) {
    throw new Error(
      `Gaia page row-count mismatch: summed ${total.toLocaleString()} data rows across ` +
        `${pageFiles.length} page file(s) in ${dir}, expected ${expected.toLocaleString()}. ` +
        `A short count means a page is truncated or a slice is missing; a long count means ` +
        `the G<14 cut or the upstream table changed. Delete the pages + ${PLAN_SIDECAR_NAME} ` +
        `and re-fetch, or update EXPECTED_G14_ROWS if the catalog legitimately moved.`,
    );
  }
  return total;
}

/**
 * The exact row count of the Gaia Catalogue of Nearby Stars supplement
 * (`external.gaiaedr3_gcns_main_1`). Unlike the paged main catalog — sampled
 * live and only bounded by an envelope — GCNS is a small fixed table fetched in
 * one shot, so its row count is known and pinned. `fetchGcns` asserts the
 * downloaded body carries exactly this many data rows before it commits the
 * file, catching a truncated response that would otherwise look complete.
 */
export const EXPECTED_GCNS_ROWS = 331_312;

/**
 * The exact row count of the Hipparcos↔Gaia best-neighbour cross-match
 * (`gaiadr3.hipparcos2_best_neighbour`) — plan 02's dedup key, one row per
 * Hipparcos source Gaia saturates on. Like GCNS it is a small fixed table
 * fetched in one shot, so its row count is known and pinned; `fetchHipXmatch`
 * asserts the downloaded body carries exactly this many data rows before it
 * commits the file, catching a truncated response that would otherwise look
 * complete.
 */
export const EXPECTED_HIP_XMATCH_ROWS = 99_525;

/**
 * Upsert-or-verify one `<hex>  <filename>` line in a combined sha256 sidecar
 * (the `shasum -a 256` two-space convention, the same shape as the committed
 * cf4/desi sidecars). The sidecar holds one line per stable single-file Gaia
 * artifact, so this reads the whole file, finds the line for `fileName`, and:
 *
 *   - no line yet → append the digest and report 'recorded';
 *   - line present and matching → report 'verified' (the file is unchanged);
 *   - line present but differing → throw. A changed digest means the upstream
 *     table moved or the download truncated; re-pinning it silently would
 *     destroy the very signal the sidecar exists to raise, so the operator must
 *     delete the file and re-fetch deliberately.
 *
 * Other artifacts' lines are preserved untouched. Synchronous because it
 * touches one tiny text file and callers already await the hash upstream.
 */
export function verifyOrRecordSha256(
  sidecarPath: string,
  fileName: string,
  actualHexDigest: string,
): 'recorded' | 'verified' {
  const existing = existsSync(sidecarPath) ? readFileSync(sidecarPath, 'utf8') : '';
  const lines = existing.split(/\r?\n/).filter((line) => line.length > 0);

  for (const line of lines) {
    // `<hex>  <filename>`: hex is the first whitespace-delimited token, the
    // filename is the remainder (filenames here never contain spaces).
    const match = line.match(/^(\S+)\s+(.+)$/);
    if (match === null || match[2] !== fileName) continue;
    if (match[1] === actualHexDigest) return 'verified';
    throw new Error(
      `sha256 mismatch for ${fileName} in ${sidecarPath}:\n` +
        `    pinned: ${match[1]}\n` +
        `    actual: ${actualHexDigest}\n` +
        `  The upstream table may have changed, or the download was truncated. ` +
        `Delete the file and re-fetch deliberately — do not overwrite the pinned digest.`,
    );
  }

  writeFileSync(sidecarPath, `${[...lines, `${actualHexDigest}  ${fileName}`].join('\n')}\n`);
  return 'recorded';
}

/**
 * Fetch one single-shot TAP-sync CSV and commit it to `csvPath` only if the
 * in-memory body carries exactly `expectedRows` data rows. Shared by every
 * fixed-table Gaia supplement (GCNS, the Hipparcos↔Gaia cross-match): they
 * differ only in query, path, expected count, and what they do *after* the file
 * lands — a sha256 sidecar line, or nothing — so those post-write steps stay
 * with each caller and this helper owns the one invariant they share.
 *
 * That invariant is the completeness gate: the row-count assertion runs on the
 * in-memory body *before anything is written*, so a short response (the classic
 * truncated TAP reply that still parses as CSV) never becomes a `.part`, let
 * alone the final file, and a resume can never mistake it for a finished
 * download. Only once the count matches is the body written to `.part` and
 * renamed into place.
 *
 * Resume-friendly: an already-present `csvPath` short-circuits to `skipped`
 * without ever calling the transport. `label` prefixes the skip log and the
 * mismatch error so each caller's artifact is named without this helper knowing
 * anything about it.
 */
export async function fetchTapCsv(opts: {
  label: string;
  csvPath: string;
  query: string;
  expectedRows: number;
  transport: TapTransport;
}): Promise<{ status: 'skipped' } | { status: 'fetched'; rows: number }> {
  const { label, csvPath, query, expectedRows, transport } = opts;
  if (existsSync(csvPath)) {
    console.log(`${label}: ${basename(csvPath)} already present — skipping.`);
    return { status: 'skipped' };
  }

  const body = await transport(query);
  const rows = countDataRows(body);
  if (rows !== expectedRows) {
    // Gate before any write: nothing has touched disk yet, so a truncated body
    // leaves neither a final file nor a stray `.part` for a resume to misread.
    throw new Error(
      `${label} row-count mismatch: got ${rows.toLocaleString()} data rows, expected ` +
        `${expectedRows.toLocaleString()}. The TAP response was truncated or the ` +
        `upstream table changed — no file written. Re-run to retry the fetch.`,
    );
  }

  const partPath = `${csvPath}.part`;
  await writeFile(partPath, body);
  await rename(partPath, csvPath);
  return { status: 'fetched', rows };
}

/**
 * Fetch the GCNS supplement (`buildGcnsQuery`) in a single TAP-sync request via
 * `fetchTapCsv`'s count-gated write, then hash the committed file and reconcile
 * it against the combined sha256 sidecar. The deterministic `ORDER BY source_id`
 * in the query is what makes that digest stable across re-fetches; a skip (the
 * file was already present) records no digest, since nothing was written.
 */
export async function fetchGcns(opts: {
  csvPath: string;
  sidecarPath: string;
  transport: TapTransport;
}): Promise<'fetched' | 'skipped'> {
  const { csvPath, sidecarPath, transport } = opts;
  const result = await fetchTapCsv({
    label: 'GCNS',
    csvPath,
    query: buildGcnsQuery(),
    expectedRows: EXPECTED_GCNS_ROWS,
    transport,
  });
  if (result.status === 'skipped') return 'skipped';

  const digest = await sha256OfFile(csvPath);
  const outcome = verifyOrRecordSha256(sidecarPath, basename(csvPath), digest);
  console.log(
    `GCNS: ${result.rows.toLocaleString()} rows written to ${basename(csvPath)}; ` +
      `sha256 ${digest} (${outcome}).`,
  );
  return 'fetched';
}

/**
 * Fetch the Hipparcos↔Gaia best-neighbour cross-match (`buildHipXmatchQuery`) in
 * a single TAP-sync request via `fetchTapCsv`'s count-gated write. Unlike GCNS
 * this artifact carries no sha256 sidecar line — the dispatch pins the sidecar
 * to gcns + hip2 only — so the count gate against `EXPECTED_HIP_XMATCH_ROWS` is
 * the whole completeness contract, and a skip (file already present) is a no-op
 * beyond the log. ~3 MB; plan 02's dedup subtraction (spec §2) consumes it.
 */
export async function fetchHipXmatch(opts: {
  csvPath: string;
  transport: TapTransport;
}): Promise<'fetched' | 'skipped'> {
  const { csvPath, transport } = opts;
  const result = await fetchTapCsv({
    label: 'Hipparcos↔Gaia xmatch',
    csvPath,
    query: buildHipXmatchQuery(),
    expectedRows: EXPECTED_HIP_XMATCH_ROWS,
    transport,
  });
  if (result.status === 'skipped') return 'skipped';

  console.log(
    `Hipparcos↔Gaia xmatch: ${result.rows.toLocaleString()} rows written to ` +
      `${basename(csvPath)}.`,
  );
  return 'fetched';
}

/**
 * Fetch the Hipparcos-2 fixed-width table and its VizieR ReadMe over plain HTTP,
 * reusing the Range-resume download discipline the CDS FTP fetchers already use.
 *
 * The ReadMe goes first: it is tiny, so failing there fails fast, and the
 * byte-offset spec it carries is what the downstream parser validates against.
 * It gets no digest line — VizieR occasionally revises the prose without touching
 * the byte layout, so pinning its hash would raise false alarms; the committed
 * provenance README is the layout contract, and the ReadMe's byte size is logged
 * for a sanity glance only.
 *
 * The table is accepted in two gated steps. First a line count must equal
 * `EXPECTED_HIP2_LINES` — a Range-resume that stopped short lands here as a
 * short count. On mismatch this throws with a delete-and-re-run instruction but
 * does NOT delete the file: on a metered/tight connection the operator's bytes
 * are precious, and a deliberate re-fetch beats a silent redownload loop. Only
 * once the count matches is the digest reconciled against the combined sidecar.
 */
export async function fetchHip2(opts: {
  hip2Path: string;
  readmePath: string;
  sidecarPath: string;
}): Promise<void> {
  const { hip2Path, readmePath, sidecarPath } = opts;

  // ReadMe first — tiny, fail-fast, no digest line (see the docstring).
  const readmeResult = await downloadWithResume(HIP2_README_URL, readmePath);
  console.log(
    `Hipparcos-2 ReadMe: ${readmeResult.totalBytes.toLocaleString()} bytes` +
      (readmeResult.bytesAdded > 0
        ? ` (+${readmeResult.bytesAdded.toLocaleString()}).`
        : ' (already complete).'),
  );

  const tableResult = await downloadWithResume(HIP2_URL, hip2Path);
  console.log(
    `Hipparcos-2 hip2.dat: ${tableResult.totalBytes.toLocaleString()} bytes` +
      (tableResult.bytesAdded > 0
        ? ` (+${tableResult.bytesAdded.toLocaleString()}).`
        : ' (already complete).'),
  );

  const lineCount = (await readFile(hip2Path, 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line.length > 0).length;
  if (lineCount !== EXPECTED_HIP2_LINES) {
    throw new Error(
      `Hipparcos-2 line-count mismatch: hip2.dat has ${lineCount.toLocaleString()} lines, ` +
        `expected ${EXPECTED_HIP2_LINES.toLocaleString()}. The download is truncated (a Range- ` +
        `resume stopped short) or the upstream table changed. Delete ${hip2Path} and re-run to ` +
        `force a fresh download — it is left in place so no bytes are wasted re-fetching what is ` +
        `already on disk.`,
    );
  }

  const digest = await sha256OfFile(hip2Path);
  const outcome = verifyOrRecordSha256(sidecarPath, basename(hip2Path), digest);
  console.log(
    `Hipparcos-2: ${lineCount.toLocaleString()} lines in ${basename(hip2Path)}; ` +
      `sha256 ${digest} (${outcome}).`,
  );
}
