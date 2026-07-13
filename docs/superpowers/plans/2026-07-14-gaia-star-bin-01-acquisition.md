# Gaia Star Bin — Plan 01: Acquisition Pipeline (`npm run fetch-gaia`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention; the main thread runs `npm test` / `npm run typecheck` and commits. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-13-gaia-star-bin-design.md` — **plan 1 of 3 (acquisition only, spec §4 fetch half)**. Plan 02 (binary format + encoder + `build-stars`) and plan 03 (renderer + registry integration) are explicitly out of scope here. Plan 02 was written **in parallel against the registry keys and column lists pinned below** — where this plan and spec §4's provisional names differ (e.g. `gaia.dir` vs the spec's `gaia.source-dir`, `hip2.dat` vs `hipparcos2.dat`), the pinned contracts here win.

**Goal:** `npm run fetch-gaia` populates `data/raw/gaia/` with everything plan 02's encoder consumes: the G<14 Gaia DR3 main catalog (with Bailer-Jones distances joined) as paged CSVs, the GCNS 100 pc supplement, the Hipparcos-2 bright-star table + its VizieR ReadMe, and the Hipparcos↔Gaia cross-match — resumable, integrity-checked, and gated behind an explicit size confirmation.

**Architecture:** one new fetcher, `tools/fetch/fetchGaia.ts`, following the two proven fetch disciplines side by side. The paged TAP fetch follows `tools/fetch/fetchHyperLeda.ts` (on-disk resume cache, skip already-fetched work, count + log failures, never leave a partial file) with the DESI refinement of write-to-`.part`-then-rename for atomicity. The single-file HTTP fetches (hip2 + ReadMe) reuse `downloadWithResume` / `sha256OfFile` exported by `tools/fetch/fetchCosmicflows4.ts` (the `fetchStructureCatalogs.ts` precedent at `tools/fetch/fetchStructureCatalogs.ts:19`). Pure units (slice partitioner, ADQL builders, row-count verifier) are exported from `fetchGaia.ts` for tests — the `fetchDesi.ts` `planChunks`/`downloadChunked` precedent — so no vitest test ever touches the network.

**Tech Stack:** TypeScript (tools tsconfig), Vitest, Node `fetch` with an injected `TapTransport` for tests, no new dependencies.

## Global Constraints

### HARD CONSTRAINT — tight network connection

The operator is on a constrained connection. This is a correctness requirement on the fetcher, not a nicety:

1. **Size gate before any bulk transfer.** The fetcher prints the estimated remaining download (~1.5–2 GB paged main catalog + ~30 MB GCNS + ~33 MB hip2 + ~3 MB cross-match) and proceeds only with an explicit `--yes` flag or an interactive TTY confirmation. A non-TTY run without `--yes` aborts with a clear message — it must never hang on a prompt or start a silent 2 GB transfer.
2. **On-disk resume cache.** Every artifact is skipped when its completed file already exists. Interrupted runs re-fetch only what's missing. Nothing is ever re-downloaded.
3. **Never leave a partial file.** All writes go to `<name>.part`, renamed to the final name only on completion. A crash leaves a `.part` that the next run ignores and replaces.
4. **Failures are counted and logged, never silent** (the `fetchHyperLeda.ts:230-247` discipline). Exit non-zero when any slice failed, with a "re-run to retry" instruction.
5. **Sequential transfers, one request in flight.** The pipe is the bottleneck; a worker pool adds code for zero throughput. (This deliberately diverges from fetchHyperLeda's 4-way pool — that fetch was latency-bound on tiny responses; this one is bandwidth-bound on big ones.)

### Verified ground truth (confirmed live against the services, 2026-07-13/14)

Embed these in the code as named constants / assertions where marked. They are contracts with upstream, not tuning knobs.

| Fact | Value |
| --- | --- |
| TAP sync endpoint | `https://gea.esac.esa.int/tap-server/tap/sync` (POST form: `REQUEST=doQuery`, `LANG=ADQL`, `FORMAT=csv`) |
| `gaiadr3.gaia_source_lite` rows at `phot_g_mean_mag < 14.0` | **16,844,156** — asserted at fetch completion |
| BJ join coverage at G<14 | 99.24 % (the unjoined 0.76 % come back with empty distance cells — plan 02's counted drop, not this plan's problem) |
| BJ distance table | `external.gaiaedr3_distance` (`source_id`, `r_med_geo`, `r_med_photogeo`, …) |
| GCNS table | `external.gaiaedr3_gcns_main_1`, exactly **331,312** rows — asserted |
| Hipparcos↔Gaia cross-match | `gaiadr3.hipparcos2_best_neighbour`, exactly **99,525** rows (`source_id`, `original_ext_source_id` = HIP number, `angular_distance`, `number_of_neighbours`, `xm_flag`) — asserted |
| Hipparcos-2 data | VizieR I/311, `https://cdsarc.cds.unistra.fr/ftp/I/311/hip2.dat` — **117,955** records, fixed-width 276-byte lines (+ newline), ~33 MB — line count asserted |
| Hipparcos-2 ReadMe | `https://cdsarc.cds.unistra.fr/ftp/I/311/ReadMe` — byte-layout spec; downloaded alongside per the project's "VizieR ReadMes live next to the file they describe" convention |

### Pinned contracts (plan 02 was written against these — do NOT deviate)

- **Raw files** under `data/raw/gaia/` (all gitignored except `README.md` + the `.sha256` sidecar):
  - paged main-catalog CSVs `gaia_page_<NNNN>.csv` in the directory registered as `gaia.dir`
  - `gcns_main.csv` → key `gaia.gcns`
  - `hip2.dat` → key `gaia.hipparcos`; the VizieR ReadMe alongside → key `gaia.hipparcos-readme`
  - `hip2_best_neighbour.csv` → key `gaia.hip-xmatch`
  - `README.md` → key `gaia.readme` (committed); combined `gaia.sha256` sidecar (committed) covering the two stable single files (gcns, hip2). The paged CSVs get a fetch-completion row-count check instead (Task 5).
- **Main-catalog SELECT column list** (the exact CSV header order plan 02's parser consumes — never reorder): `source_id, ra, dec, phot_g_mean_mag, bp_rp, r_med_geo, r_med_photogeo, random_index`.
- **GCNS SELECT column list**: `source_id, ra, dec, parallax, dist_50, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag`.
- **Entry point** `tools/fetch/fetchGaia.ts`; npm script `fetch-gaia`.
- Paging is by contiguous `random_index` ranges (Gaia's built-in uniform-shuffle pagination key), one TAP sync request per slice, each slice → its own cache file.

### Scope exclusions

- **NO binary format, NO encoder, NO `build-stars`, NO renderer, NO `syncR2.ts` ALLOW change** — plans 02/03. Plan 02 consumes this plan's files exclusively via `rawDataPath('gaia.…')`.
- **NO bright-end G threshold decision.** The fetch grabs all 117,955 Hipparcos-2 rows; where to cut the Hipparcos patch is a plan-02 build-time knob, so the open spec item does not block acquisition.
- `.claude/skills/add-data-source/SKILL.md` gets updated in plan 02 (pipeline surface) and plan 03 (runtime surface) — **not** in this plan; this line exists so the follow-up isn't lost.

### Project conventions

- `type` aliases never `interface`; one symbol per file in `tools/utils/` (gaia-specific helpers stay in `fetchGaia.ts` exported for tests — the `fetchDesi.ts` precedent); didactic module-header comments (why + what the alternative was).
- Paths only via `rawDataPath('gaia.…')` — never a literal `data/raw/...` string.
- **No network in vitest.** Tests use temp dirs + a typed injected `TapTransport` (`vi.fn<TapTransport>()`). Live-service verification happens as fetch-time log assertions and in Task 11, not in the suite.
- Testing discipline per `docs/superpowers/conventions/testing.md`: test the slice-partitioning math, the resume skip-if-exists decision, the ADQL boundary semantics, the `.part` atomicity — all real-bug surfaces. Do NOT test registry-entry restatements, the size-estimate arithmetic (constants restated), or mock-fetch roundtrips that only exercise the mock.
- Subagent implementers run bash sequentially and cannot use sed/awk/grep; main thread runs `npm test` / `npm run typecheck` and commits (stage specific paths, never `git add -A`).

## Cross-task contracts (later tasks import, never re-declare)

- Task 1 → registry keys `'gaia.dir' | 'gaia.gcns' | 'gaia.hipparcos' | 'gaia.hipparcos-readme' | 'gaia.hip-xmatch' | 'gaia.readme' | 'gaia.sha256'`.
- Task 2 → `RandomIndexSlice`, `planRandomIndexSlices`, `pageFileName`.
- Task 3 → `GAIA_TAP_SYNC_URL`, `G_MAG_LIMIT`, `buildGaiaPageQuery`, `buildGcnsQuery`, `buildHipXmatchQuery`.
- Task 4 → `estimateRemainingBytes`, `gateDecision`.
- Task 5 → `TapTransport`, `fetchPagedCatalog`, `verifyPageRowTotal`, `EXPECTED_G14_ROWS = 16_844_156`.
- Task 6 → `verifyOrRecordSha256`, `EXPECTED_GCNS_ROWS = 331_312`.
- Task 7 → `EXPECTED_HIP2_LINES = 117_955`.
- Task 8 → `EXPECTED_HIP_XMATCH_ROWS = 99_525`.

---

## Task 1 — raw-data registry entries + provenance README + gitignore sanity

**Files**

- Modify: `tools/utils/io/rawDataRegistry.ts`
- Create: `data/raw/gaia/README.md`

**Registry entries** (keys are the contract; follow the `cf4.*` / `desi.*` entry shapes at `rawDataRegistry.ts:216-242` and `351-411`; directory precedent: `hyperleda.designations-dir` at `rawDataRegistry.ts:105-112`):

| Key | path | kind | source | fetcher |
| --- | --- | --- | --- | --- |
| `gaia.dir` | `data/raw/gaia` | directory | `gitignored` | `tools/fetch/fetchGaia.ts` |
| `gaia.gcns` | `data/raw/gaia/gcns_main.csv` | file | `gitignored` | `tools/fetch/fetchGaia.ts` |
| `gaia.hipparcos` | `data/raw/gaia/hip2.dat` | file | `gitignored` | `tools/fetch/fetchGaia.ts` |
| `gaia.hipparcos-readme` | `data/raw/gaia/ReadMe` | file | `gitignored` | `tools/fetch/fetchGaia.ts` |
| `gaia.hip-xmatch` | `data/raw/gaia/hip2_best_neighbour.csv` | file | `gitignored` | `tools/fetch/fetchGaia.ts` |
| `gaia.readme` | `data/raw/gaia/README.md` | file | `committed` | — |
| `gaia.sha256` | `data/raw/gaia/gaia.sha256` | file | `committed` | `tools/fetch/fetchGaia.ts` |

`gaia.dir`'s description names the dynamic page files (`gaia_page_<NNNN>.csv`) — consumers `join(rawDataPath('gaia.dir'), pageFileName(i))`. `upstream` fields: the TAP sync URL for the query-backed entries, the two CDS FTP URLs for hip2/ReadMe. `gaia.hipparcos` sets `readme: 'gaia.hipparcos-readme'`.

**README.md content:** upstream services + tables (TAP endpoint, `gaiadr3.gaia_source_lite`, `external.gaiaedr3_distance`, `external.gaiaedr3_gcns_main_1`, `gaiadr3.hipparcos2_best_neighbour`, VizieR I/311); the exact SELECT column lists (pinned above); the G<14.0 cut and its verified 16,844,156-row total; the BJ 99.24 % join coverage note; per-file expected row counts (GCNS 331,312 / xmatch 99,525 / hip2 117,955); the paging scheme (contiguous `random_index` slices, one file per slice); fetch command (`npm run fetch-gaia`, `--yes` flag, resume semantics); checksum-sidecar note; fetch date placeholder filled in by Task 11. Citations: Gaia DR3 (Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1), Bailer-Jones et al. 2021 (AJ 161, 147), GCNS (Gaia Collaboration, Smart et al. 2021, A&A 649, A6), Hipparcos-2 (van Leeuwen 2007, A&A 474, 653), with a pointer to the ATTRIBUTIONS.md entries (Task 10) for the required acknowledgement text.

**Gitignore:** no edit — `!/data/raw/**/README.md` and `!/data/raw/**/*.sha256` already re-include the committed pair; everything else falls under `/data/**`.

**Tests:** none. `RawDataKey` is compile-time-checked, and the 2026-07-10 audit deleted registry-restatement tests (`tests/tools/utils/io/rawDataRegistry.test.ts` keeps only its one path-resolution behavior test — leave it untouched).

**Steps**

- [ ] Add the seven registry entries with didactic descriptions; write `data/raw/gaia/README.md`.
- [ ] Sanity: `git check-ignore data/raw/gaia/gcns_main.csv` → ignored; `git check-ignore data/raw/gaia/README.md` and `…/gaia.sha256` → NOT ignored (create empty throwaway files to check if needed, then delete the throwaways — not the README).
- [ ] `npm run typecheck` → clean.
- [ ] Commit: `git add tools/utils/io/rawDataRegistry.ts data/raw/gaia/README.md`

---

## Task 2 — `random_index` slice partitioner + page filename (pure, tested)

**Files**

- Create: `tools/fetch/fetchGaia.ts` (module scaffold + these two exports; didactic header explaining the whole fetch design — paging key, resume, size gate)
- Create: `tests/tools/fetch/fetchGaia.test.ts`

**Contracts**

```ts
export type RandomIndexSlice = { index: number; start: number; endExclusive: number };

/** Partition [0, totalCount) into sliceCount contiguous half-open ranges.
 *  random_index is Gaia's uniform shuffle over ALL ~1.81e9 DR3 sources, so
 *  each slice returns ~totalCount/sliceCount × 0.93% rows after the G<14 cut. */
export function planRandomIndexSlices(totalCount: number, sliceCount: number): RandomIndexSlice[];

/** 'gaia_page_0003.csv' — zero-padded so lexicographic order = slice order.
 *  This name is the resume cache key: changing the format orphans every
 *  previously fetched page. */
export function pageFileName(index: number): string;
```

`PAGE_SLICE_COUNT = 256` as a named constant (≈66 k rows / ~7 MB per response — comfortably inside TAP sync limits, small enough that a lost connection wastes minutes not hours). `totalCount` is a parameter, not a constant — the caller probes it live (Task 5), so the partitioner stays pure and the upstream row count is never baked in.

**Test names + assertions**

- `planRandomIndexSlices tiles [0, total) contiguously: 1000 into 4 → bounds 0|250|500|750|1000` — hand-computed; each `start` equals the previous `endExclusive`.
- `a non-divisible total loses no rows: 1003 into 4 → last endExclusive is 1003` — the remainder lands in the final slice (or is spread — either way the union must be exactly `[0, 1003)`; assert first start 0, last endExclusive 1003, contiguity, no empty slice).
- `pageFileName pads to four digits: 3 → 'gaia_page_0003.csv'; 1234 → 'gaia_page_1234.csv'` — the on-disk cache-key contract (keep-rule: contract with bytes on disk).

**Steps**

- [ ] Failing tests → run → implement → run → green; `npm run typecheck`.
- [ ] Commit: `git add tools/fetch/fetchGaia.ts tests/tools/fetch/fetchGaia.test.ts`

---

## Task 3 — ADQL query builders (pure, tested) + live join-syntax verification

**Files**

- Modify: `tools/fetch/fetchGaia.ts`, `tests/tools/fetch/fetchGaia.test.ts`

**Contracts**

```ts
export const GAIA_TAP_SYNC_URL = 'https://gea.esac.esa.int/tap-server/tap/sync';
export const G_MAG_LIMIT = 14.0;

export function buildGaiaPageQuery(slice: RandomIndexSlice): string;
export function buildGcnsQuery(): string;
export function buildHipXmatchQuery(): string;
```

**Main page query** (the SELECT order is plan 02's CSV-header contract — never reorder):

```sql
SELECT g.source_id, g.ra, g.dec, g.phot_g_mean_mag, g.bp_rp,
       d.r_med_geo, d.r_med_photogeo, g.random_index
FROM gaiadr3.gaia_source_lite AS g
LEFT OUTER JOIN external.gaiaedr3_distance AS d ON g.source_id = d.source_id
WHERE g.phot_g_mean_mag < 14.0
  AND g.random_index >= <start> AND g.random_index < <endExclusive>
```

**Join-syntax verification (a required step, per the spec's verify-before-assuming rule):** confirm which join spelling the ESA TAP service accepts with a throwaway `TOP 5` request (curl or a tiny tsx one-liner) before pinning the builder — `LEFT OUTER JOIN … USING (source_id)` is the tidier form if accepted; the `ON g.source_id = d.source_id` form above is the verified-safe fallback. Whichever passes goes in the builder with a comment recording the check. If the implementer's sandbox blocks network, hand the one-off request to the main thread and record the result.

**GCNS query** — pinned column list, plus `ORDER BY source_id` so the CSV bytes are deterministic and the `gaia.sha256` sidecar is meaningful across re-fetches:

```sql
SELECT source_id, ra, dec, parallax, dist_50,
       phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag
FROM external.gaiaedr3_gcns_main_1
ORDER BY source_id
```

**Cross-match query** — all five columns, `ORDER BY source_id` (cheap determinism; no sidecar, but stable diffs):

```sql
SELECT source_id, original_ext_source_id, angular_distance,
       number_of_neighbours, xm_flag
FROM gaiadr3.hipparcos2_best_neighbour
ORDER BY source_id
```

No `ORDER BY` on the page query — a server-side sort over 16.8 M rows per slice buys nothing (pages aren't sha-pinned; row order within a page is irrelevant to plan 02).

**Test names + assertions** (assert semantics, not the whole template back at itself — a full-string equality would be a mirror):

- `page query carries half-open slice bounds: {start: 100, endExclusive: 200} → contains 'random_index >= 100' and 'random_index < 200'` — the off-by-one here duplicates or drops rows at every slice boundary; this is THE load-bearing assertion of the task.
- `page query selects the pinned plan-02 column list in order` — assert the eight column names appear in the SELECT clause in the pinned order (e.g. via indexOf monotonicity), and that the WHERE contains `phot_g_mean_mag < 14`.
- `gcns and xmatch queries order by source_id` — the sha256-determinism contract.

**Steps**

- [ ] Failing tests → run → implement → run → green; `npm run typecheck`.
- [ ] Live join-syntax check (procedure above); record the outcome in the builder's comment.
- [ ] Commit: `git add tools/fetch/fetchGaia.ts tests/tools/fetch/fetchGaia.test.ts`

---

## Task 4 — download-size estimate + `--yes` confirmation gate

The tight-network constraint's own task. The gate runs after the resume scan, so the printed number is the *remaining* transfer, not the total — a resume with 250/256 pages cached quotes ~40 MB, not 2 GB.

**Files**

- Modify: `tools/fetch/fetchGaia.ts`, `tests/tools/fetch/fetchGaia.test.ts`

**Contracts**

```ts
export type FetchWorkPlan = {
  pageSlicesRemaining: number;
  totalPageSlices: number;
  gcnsNeeded: boolean;
  hip2Needed: boolean;
  hipReadmeNeeded: boolean;
  xmatchNeeded: boolean;
};

/** Rough remaining bytes: pages ≈ remaining/total share of ~1.7 GB
 *  (16.84 M rows × ~100 B/row CSV), GCNS ~30 MB, hip2 32,673,535 B exact
 *  (117,955 × 277), ReadMe ~20 KB, xmatch ~3 MB. An estimate, printed as
 *  such — it gates consent, it does not meter the transfer. */
export function estimateRemainingBytes(work: FetchWorkPlan): number;

/** 'proceed' with --yes; 'prompt' on an interactive TTY; 'abort' otherwise —
 *  a background/CI run without --yes must exit with instructions, never hang. */
export function gateDecision(yesFlag: boolean, isTTY: boolean): 'proceed' | 'prompt' | 'abort';
```

`main()` prints a preamble before the gate: per-artifact remaining/cached status, the byte estimate, and the `--yes` hint. The interactive prompt is a plain `readline` y/N; anything but explicit yes aborts. When `estimateRemainingBytes` is 0 (everything cached) the gate is skipped — nothing to consent to.

**Test names + assertions**

- `gateDecision aborts when stdin is not a TTY and --yes is absent` — the real bug: a dispatched background run hanging forever on a prompt (or worse, a piped "y" starting a 2 GB pull nobody approved). Also assert `--yes → 'proceed'` regardless of TTY.

No test for `estimateRemainingBytes` — it is arithmetic over constants (a test would restate them; see testing.md).

**Steps**

- [ ] Failing test → run → implement `gateDecision`, `estimateRemainingBytes`, the preamble printer → run → green; `npm run typecheck`.
- [ ] Commit: `git add tools/fetch/fetchGaia.ts tests/tools/fetch/fetchGaia.test.ts`

---

## Task 5 — paged main-catalog fetcher: resume, `.part` atomicity, counted failures, row-count verification

**Files**

- Modify: `tools/fetch/fetchGaia.ts`, `tests/tools/fetch/fetchGaia.test.ts`

**Contracts**

```ts
/** Transport is injected so tests never touch the network. Resolves to the
 *  raw CSV body; rejects on HTTP/network error (message carries status + a
 *  body snippet, the fetch2massXsc.ts:71 style). */
export type TapTransport = (query: string) => Promise<string>;

export type PagedFetchResult = {
  fetched: number;   // slices downloaded this run
  skipped: number;   // slices already complete on disk
  failed: number;    // slices that errored — logged, NOT written, retried on re-run
  rowsFetched: number; // data rows (excl. CSV header) written this run
};
export function fetchPagedCatalog(opts: {
  slices: readonly RandomIndexSlice[];
  dir: string;               // rawDataPath('gaia.dir') in main(); a temp dir in tests
  transport: TapTransport;
}): Promise<PagedFetchResult>;

export const EXPECTED_G14_ROWS = 16_844_156;

/** Count data rows across every gaia_page_*.csv in dir (header line excluded
 *  per file) and throw with a loud, actionable message unless the total
 *  equals expected. Run only when failed === 0 and no slice is missing. */
export function verifyPageRowTotal(dir: string, expected: number): Promise<number>;
```

**Behaviour contract**

- Sequential: one slice in flight (Global Constraints rationale). Per slice: final file exists → `skipped++`, transport never called. Otherwise fetch → write body to `<file>.part` → rename to final → `fetched++`. A leftover `.part` from a crash does not count as complete — it is overwritten by the next attempt and never renamed unless the write completed.
- A transport rejection → `failed++`, log the first error verbatim (`fetchHyperLeda.ts:236-241` style), **continue** with remaining slices. No in-run retry: the resume path *is* the retry mechanism (re-run fetches only the failed slices), matching both fetcher precedents.
- Progress log per slice: `page 0042/0256: 65,812 rows (12 failed so far)`.
- **Slice-plan pinning:** the slice boundaries derive from `(totalCount, PAGE_SLICE_COUNT)`; if either changes between runs, cached pages no longer tile `[0, totalCount)` and resume would silently mix two partitions. On first run, write a gitignored plan sidecar (e.g. `pages.plan.json` inside `gaia.dir`) recording both; on resume, mismatch → throw telling the operator to delete the pages + sidecar and start fresh. (This sidecar lives with the cache it describes, so it needs no registry key and no gitignore edit. Exact mechanism is the implementer's choice per the dispatch — the non-negotiables are the completion-time `EXPECTED_G14_ROWS` assertion and this partition-drift guard.)
- `totalCount` is probed live in `main()` before slicing (`SELECT MAX(random_index) FROM gaiadr3.gaia_source_lite` — one row, effectively free) rather than hardcoding DR3's source count; the probe result + 1 feeds `planRandomIndexSlices` and gets pinned in the plan sidecar.

**Test names + assertions** (temp dir + `vi.fn<TapTransport>()`; deterministic tiny CSV bodies; small expected constants injected — never the real 16.8 M):

- `skips slices whose final page file exists: transport not called for them, skipped counted` — the never-re-download guarantee.
- `a leftover .part file does not count as complete: the slice is refetched and the .part replaced by the final file`.
- `on success no .part remains; on transport failure no final file exists for that slice` — the atomicity contract, both halves.
- `a failing slice is counted and logged but does not stop the remaining slices` — assert `failed === 1`, later slices' files exist.
- `rowsFetched excludes each page's CSV header line` — hand-computed from 2-row fixture bodies.
- `verifyPageRowTotal sums data rows across pages and throws on mismatch` — three tiny pages, expected total hand-computed; then one row removed → rejects with a message naming actual vs expected.

**Steps**

- [ ] Failing tests → run → implement → run → green; `npm run typecheck`.
- [ ] Commit: `git add tools/fetch/fetchGaia.ts tests/tools/fetch/fetchGaia.test.ts`

---

## Task 6 — GCNS fetch + sha256 sidecar verify-or-record

**Files**

- Modify: `tools/fetch/fetchGaia.ts`, `tests/tools/fetch/fetchGaia.test.ts`

**Contracts**

```ts
/** Upsert-or-verify one '<hex>  <filename>' line in the combined sidecar
 *  (shasum -a 256 convention, the desi.sha256 shape). No pinned line →
 *  append + report 'recorded'. Pinned line matches → 'verified'. Pinned
 *  line differs → throw: upstream changed or the download is truncated;
 *  tell the operator to delete the file and re-fetch deliberately. */
export function verifyOrRecordSha256(
  sidecarPath: string,
  fileName: string,
  actualHexDigest: string,
): 'recorded' | 'verified';

export const EXPECTED_GCNS_ROWS = 331_312;
```

**Behaviour:** skip entirely when `gcns_main.csv` exists (resume). Otherwise: single TAP sync POST of `buildGcnsQuery()` via the injected transport → `.part` → count data rows and **assert `=== EXPECTED_GCNS_ROWS`** before the rename (a short response must never become the final file — this is the "never leave a partial file" rule applied to a body that arrived complete-looking but truncated) → rename → `sha256OfFile` (import from `fetchCosmicflows4.ts`) → `verifyOrRecordSha256` against `rawDataPath('gaia.sha256')`. The deterministic `ORDER BY source_id` (Task 3) is what makes the digest stable across re-fetches. Log rows + digest.

**Test names + assertions**

- `gcns: a row-count mismatch leaves no final file` — transport returns a short body; assert throw, no `gcns_main.csv`, no stray `.part` counted as complete on a subsequent existence check.
- `verifyOrRecordSha256 records on first sight, verifies on match, throws on mismatch` — three-branch behavior in a temp sidecar; the mismatch message names the file. (Real bug guarded: silently re-pinning a changed upstream — the CF4/DESI sidecars exist precisely to catch this.)

**Steps**

- [ ] Failing tests → run → implement → run → green; `npm run typecheck`.
- [ ] Commit: `git add tools/fetch/fetchGaia.ts tests/tools/fetch/fetchGaia.test.ts`

---

## Task 7 — Hipparcos-2 `hip2.dat` + VizieR ReadMe fetch

**Files**

- Modify: `tools/fetch/fetchGaia.ts`

**Behaviour:** plain HTTP files, so reuse `downloadWithResume` + `sha256OfFile` from `tools/fetch/fetchCosmicflows4.ts` exactly as `fetchStructureCatalogs.ts:65-111` does — Range-resume append is that helper's proven partial-file discipline (byte-offset resume replaces `.part` for dumb-HTTP downloads; both satisfy "never a silently-partial final file" because the sha256 + line-count checks gate acceptance). ReadMe first (tiny, fail-fast — the `fetchCosmicflows4.ts:141-150` rationale), then `hip2.dat`:

- URLs as exported constants: `HIP2_URL = 'https://cdsarc.cds.unistra.fr/ftp/I/311/hip2.dat'`, `HIP2_README_URL = 'https://cdsarc.cds.unistra.fr/ftp/I/311/ReadMe'`.
- After download: count lines, **assert `=== EXPECTED_HIP2_LINES` (117,955)** — a truncated Range-resume shows up here; on mismatch, throw with a delete-and-re-run instruction (do NOT auto-delete: the operator's bytes are precious on this connection, and a deliberate re-fetch beats a silent loop).
- Then `verifyOrRecordSha256(sidecar, 'hip2.dat', digest)` (Task 6's helper).
- The ReadMe gets no digest line (VizieR occasionally revises prose; the byte-layout contract plan 02 parses against is what the committed provenance README documents) — log its byte size only.

**Tests:** none new — the download helper is already tested where it lives, and the two assertions above are fetch-time contracts with a live service (Task 11's territory). `verifyOrRecordSha256` is covered by Task 6.

**Steps**

- [ ] Implement; `npm run typecheck`; `npm test` stays green.
- [ ] Commit: `git add tools/fetch/fetchGaia.ts`

---

## Task 8 — Hipparcos↔Gaia `hipparcos2_best_neighbour` fetch

**Files**

- Modify: `tools/fetch/fetchGaia.ts`

**Behaviour:** identical shape to Task 6's GCNS fetch, minus the sidecar (the dispatch pins the sidecar to gcns + hip2 only): skip when `hip2_best_neighbour.csv` exists → single TAP sync of `buildHipXmatchQuery()` → `.part` → assert data rows `=== EXPECTED_HIP_XMATCH_ROWS` (99,525) → rename → log. ~3 MB; this is the cross-match key plan 02's dedup subtraction (spec §2) consumes.

**Tests:** none new — the fetch-write-verify-rename path is Task 5/6-tested logic; a third copy of the same assertions would only re-test the pattern. (If the implementer extracts a shared "fetch one TAP CSV with expected-count gate" helper for Tasks 6+8 — a reasonable un-braiding, since the two differ only in query/path/count/sidecar — the Task 6 tests move to the helper and cover both callers.)

**Steps**

- [ ] Implement (extract the shared helper if it falls out cleanly per the note above); `npm run typecheck`; `npm test` green.
- [ ] Commit: `git add tools/fetch/fetchGaia.ts tests/tools/fetch/fetchGaia.test.ts` (second path only if the helper extraction moved tests)

---

## Task 9 — `main()` orchestration + npm script

**Files**

- Modify: `tools/fetch/fetchGaia.ts`, `package.json`

**Behaviour of `main()`** (CLI-gated via the `invokedDirectly` idiom every fetcher uses, e.g. `fetchCosmicflows4.ts:171-177`):

1. Parse `--yes`.
2. Probe `MAX(random_index)` (Task 5) → `planRandomIndexSlices` → scan disk → build `FetchWorkPlan`.
3. Print the preamble + run the size gate (Task 4). Abort here costs zero bytes.
4. Fetch in ascending-size order — ReadMe, xmatch, GCNS, hip2, then the pages — so the cheap artifacts land even if the operator kills the bulk phase.
5. Completion summary: per-artifact status, failure counts, and — when every page slice is present with zero failures — `verifyPageRowTotal(dir, EXPECTED_G14_ROWS)` with a loud `row-count check PASSED: 16,844,156` / mismatch-throw. Any `failed > 0` → summary names the count, instructs "re-run npm run fetch-gaia to retry the failed slices", exit code 1.

The real `fetch`-backed `TapTransport` (POST `URLSearchParams` per `fetch2massXsc.ts:60-71`) is defined here and injected into the Task 5/6/8 functions; tests keep their fakes.

**package.json:** `"fetch-gaia": "tsx tools/fetch/fetchGaia.ts"` — alphabetical between `fetch-famous-images` and `fetch-hyperleda`.

**Tests:** none new — `main()` is composition of tested parts + live I/O; a test would be a mock-roundtrip.

**Steps**

- [ ] Implement `main()` + transport; add the npm script.
- [ ] Smoke without network cost: `npm run fetch-gaia` (no `--yes`, non-interactive) → prints the estimate and aborts cleanly, exit non-zero, zero bytes fetched.
- [ ] `npm run typecheck`; `npm test` green.
- [ ] Commit: `git add tools/fetch/fetchGaia.ts package.json`

---

## Task 10 — docs: `ATTRIBUTIONS.md` + `README.md`

**Files**

- Modify: `ATTRIBUTIONS.md` — four new entries in the **"Catalogue data"** section (after the DESI entry at line 62), following the exact per-catalog shape the existing entries use (read the SDSS entry at `ATTRIBUTIONS.md:19-27` and the DESI entry at `:62-75` as the template — Source/use line, Reference, licence/citation requirements):
  - **Gaia DR3** — Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1. Include ESA's REQUIRED mission acknowledgement verbatim ("This work has made use of data from the European Space Agency (ESA) mission Gaia, processed by the Gaia Data Processing and Analysis Consortium (DPAC)…") — the implementer copies the canonical current text from https://gea.esac.esa.int/archive/documentation/credits.html (fetch it; don't trust memory), noting the fetch date. ATTRIBUTIONS.md is the canonical in-repo copy (the DESI-acknowledgement precedent).
  - **Bailer-Jones geometric/photogeometric distances** — Bailer-Jones et al. 2021, AJ 161, 147.
  - **GCNS — Gaia Catalogue of Nearby Stars** — Gaia Collaboration, Smart et al. 2021, A&A 649, A6.
  - **Hipparcos-2** — van Leeuwen 2007, A&A 474, 653 (VizieR I/311).
- Modify: `README.md` —
  - The raw-data download table under "### 1. Download the catalogs" (~line 103): add Gaia / GCNS / Hipparcos-2 rows. Unlike the manual browser-download rows above them, these note that **`npm run fetch-gaia` does it automatically** (the Milliquas row's phrasing is the precedent), with the ~2 GB total and the `--yes` gate mentioned.
  - The catalog-description bullet list under "What surveys do I actually need?" (~line 88): one short bullet for the Gaia DR3 stellar sample (G<14 + GCNS + Hipparcos-2 bright patch, the star bin's raw inputs), in the list's existing voice.
  - Do **NOT** write the user-facing "fly through real stars" functionality blurb — the layer doesn't render until plan 03; that blurb is plan 03's job.

**Tests:** none (docs).

**Steps**

- [ ] Fetch the canonical ESA credit text; write the four ATTRIBUTIONS entries.
- [ ] Make the two README edits in the file's existing voice.
- [ ] Commit: `git add ATTRIBUTIONS.md README.md`

---

## Task 11 — final verification: the real fetch (human/main-thread)

The ~2 GB transfer is a human/main-thread step on the operator's schedule — not CI, not subagent work. Everything below is log-reading against the pinned expected counts; no vitest test touches the network.

**Steps**

- [ ] `npm run typecheck` (both tsconfigs) → clean; `npm test` → whole suite green; no stray TODOs in the diff.
- [ ] **Human:** `npm run fetch-gaia` — confirm the preamble prints the per-artifact estimate and waits for consent; approve (interactively or re-run with `--yes`).
- [ ] **Human:** verify the completion log asserts, for each artifact: xmatch **99,525** rows, GCNS **331,312** rows, hip2 **117,955** lines, and — once all 256 pages are present — `verifyPageRowTotal` PASSED at **16,844,156**. If the run was interrupted mid-pages, re-run and confirm resume skips every completed page (the log's `skipped` count) before fetching the remainder.
- [ ] **Human:** interrupt-resilience spot check during the page phase: Ctrl-C mid-slice once, confirm a `.part` (not a final page file) is what's left behind, re-run, confirm that slice re-fetches.
- [ ] Fill in the fetch date in `data/raw/gaia/README.md`; commit the fetcher-written `data/raw/gaia/gaia.sha256` (two lines: `gcns_main.csv`, `hip2.dat`) + the README date edit — the sidecar is a committed registry entry that can only exist post-fetch (the DESI Task 11 precedent).
- [ ] Run the entanglement-radar lens over the full diff — expected clean points: one fetcher module, pure units injected not mocked-around, no duplicated path strings (registry only), no constant restated in a test.
- [ ] DoD checklist:
  - [ ] All tasks committed; suite green.
  - [ ] `data/raw/gaia/` holds all four artifact sets + ReadMe; every fetched file correctly gitignored; `README.md` + `gaia.sha256` committed.
  - [ ] All four fetch-time count assertions logged PASSED against the verified ground truth.
  - [ ] ATTRIBUTIONS.md carries the ESA Gaia acknowledgement verbatim; README rows in place.
  - [ ] No format/encoder/renderer/syncR2 code anywhere in the diff (plans 02/03).
- [ ] `/feature-done` audit — note to the auditor: the spec stays live until plans 02/03 ship; only this plan file relocates to `plans/completed/`.
