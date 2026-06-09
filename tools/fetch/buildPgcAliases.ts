#!/usr/bin/env node
/**
 * buildPgcAliases — bulk-fetch the HyperLEDA *Designations* table (`a101`)
 * and emit a runtime-ready PGC → alias-list JSON sidecar.
 *
 * ## Why this tool exists
 *
 * The Cmd+K command palette currently only searches the curated 75-entry
 * famous catalog.  When a user types `NGC 4565` it should also find the
 * GLADE row that carries PGC 42375 even though that galaxy isn't in the
 * famous list.  GLADE bins already store PGC in the `objIDs` slot, and
 * 2MRS got PGCs through the GLADE→2MRS cross-match — so the only missing
 * piece is a *lookup* from a numeric PGC to the human-readable names a
 * user might type (`NGC 4565`, `UGC 7772`, `M 31`, …).
 *
 * That lookup is the `pgc_aliases.json` we produce here.
 *
 * ## Why not query HyperLEDA at runtime?
 *
 * HyperLEDA is happy to answer per-PGC name lookups, but the latency is
 * tens to hundreds of ms per request and CORS isn't configured for
 * browsers.  Even if it were, asking "what's the name of every visible
 * galaxy?" inside a render frame is unworkable — there are 5+ million
 * GLADE rows.  Pre-baking the join at build time turns runtime search
 * into an O(1) Map lookup.
 *
 * ## API shape (probed; do not re-discover)
 *
 *   GET http://atlas.obs-hp.fr/hyperleda/fG.cgi?n=a101&a=csv&sql=<sql>&c=o
 *
 * The response is *tab-separated* despite `a=csv`, with `#`-prefixed
 * comment lines, then a `$objname` header line, then data rows.
 * Confirmed schema:
 *
 *   $objname  $b1950   design   flag   $link[dataset]
 *   NGC0253   B004505.7-253340   NGC0253          0   1
 *   NGC0253   B004505.7-253340   PGC002789        0   88
 *   NGC0253   B004505.7-253340   UGCA013          0   4
 *   NGC0253   B004505.7-253340   2MASXJ00473313-2517196   0   78
 *   …
 *
 * `pgc` is filterable in WHERE clauses but **NOT** selectable, so we
 * recover the numeric PGC by finding the `PGC<digits>` self-row inside
 * each `objname` group.
 *
 * ## Chunking strategy
 *
 * HyperLEDA cuts off bulk responses at ~1 MB.  We iterate PGC in
 * 100,000-wide windows: `(pgc>=N and pgc<N+100000)` — empirically each
 * such chunk returns ~900 KB / ~28k rows for low PGC ranges, dropping to
 * a sparse tail above PGC ~2,000,000.  We stop after two consecutive
 * empty windows (the dataset peters out around PGC ~5,000,000).
 *
 * Every chunk is cached to `data/raw/hyperleda/hyperleda_designations_chunk_<N>.csv`
 * so re-runs only re-hit the network for chunks that aren't already on
 * disk.  `--force` bypasses the cache.
 *
 * ## Designation prefixes we keep
 *
 * `NGC`, `IC`, `UGC`, `UGCA`, `MESSIER`, `ARP`, `MRK`, `MCG`, `ESO`,
 * plus `PGC` itself (needed only to recover the numeric PGC; we drop
 * the PGC names from the final alias list because nobody types them).
 *
 * Skipped on purpose: 2MASX / IRAS / HIPASS / `Z` / numeric-only catalog
 * IDs.  They're not memorable names — users type `NGC 4565`, not
 * `2MASXJ12362058+2559155`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rawDataPath } from '../utils/io/rawDataRegistry';

// ─── Pure helpers ──────────────────────────────────────────────────────────

/**
 * The set of designation prefixes we surface to the search index.  Order
 * here matters only for documentation — sorting in `sortAliasNames`
 * defines display order downstream.
 */
const KEPT_PREFIXES = ['NGC', 'IC', 'UGC', 'UGCA', 'MESSIER', 'ARP', 'MRK', 'MCG', 'ESO'] as const;

/**
 * Convert a HyperLEDA `design` cell into a human-typable name, or
 * `null` if the designation should be skipped (`PGC<n>` self-rows;
 * unrecognised prefixes).
 *
 * HyperLEDA pads numeric components with leading zeros: `NGC0253`,
 * `IC1101`, `UGCA013`.  Users type `NGC 253`, `IC 1101`, `UGCA 13`.
 * The normaliser strips the zero-padding and inserts a single space
 * between prefix and number.
 *
 * Catalogues that don't follow the simple `PREFIX<digits>` shape (MCG,
 * ESO with sub-fields like `MCG-04-03-009`) keep their full identifier
 * after the leading zeros are flattened — they're not space-separated
 * by convention.
 *
 * `MESSIER031` → `M 31` is a special case: the user-typed form is
 * universally `M 31` rather than `MESSIER 31`, so we map the prefix.
 *
 * Returns `null` for any input that should NOT appear in the alias
 * list — including `PGC` self-rows (we use those to recover the
 * numeric PGC, not to display).
 */
export function normalizeDesignation(raw: string): string | null {
  const s = raw.trim();
  if (s.length === 0) return null;

  // PGC self-rows are filtered: they're load-bearing for PGC recovery
  // but we don't want "PGC 2789" cluttering the alias list — nobody
  // types PGC numbers as a search query.
  if (/^PGC\d+$/i.test(s)) return null;

  // MESSIER → M.  Match-and-strip-zeros, then re-prefix with the short
  // form.  Pure prefix swap; the digits-only normalisation is shared
  // with the generic path below.
  const messierMatch = s.match(/^MESSIER0*(\d+)$/i);
  if (messierMatch) return `M ${messierMatch[1]}`;

  // Generic PREFIX<digits> path — applies to NGC/IC/UGC/UGCA.
  // We anchor the prefix list rather than blindly splitting on the
  // first digit so something like `IC10A` (a real HyperLEDA quirk for
  // sub-components) doesn't collapse to `IC 10A`; we'd rather skip it.
  for (const prefix of ['NGC', 'IC', 'UGC', 'UGCA', 'ARP', 'MRK'] as const) {
    // UGC must be tested *before* UGCA (longer-prefix-first) so
    // `UGCA013` doesn't get matched as `UGC` with body `A013`.  The
    // explicit ordering of `KEPT_PREFIXES` doesn't help us here
    // because the regex below is built per prefix; we hand-order.
    const re = new RegExp(`^${prefix}0*(\\d+)$`, 'i');
    const m = s.match(re);
    if (m) return `${prefix} ${m[1]}`;
  }
  // Re-test UGCA explicitly (it would otherwise match the UGC branch
  // and produce `UGC A013` if the loop hit it second).
  const ugcaMatch = s.match(/^UGCA0*(\d+)$/i);
  if (ugcaMatch) return `UGCA ${ugcaMatch[1]}`;

  // MCG / ESO carry sub-fields (`MCG-04-03-009`, `ESO123-G045`).  We
  // keep the full identifier verbatim — the user might type
  // `MCG-04` or `ESO 123` and substring matching in scoreAliasMatch
  // does the rest.  Just normalise the prefix and insert one space.
  const mcgMatch = s.match(/^MCG([+-].+)$/i);
  if (mcgMatch) return `MCG ${mcgMatch[1]}`;
  const esoMatch = s.match(/^ESO(.+)$/i);
  if (esoMatch) return `ESO ${esoMatch[1]}`;

  // Anything else (2MASX, IRAS, Z, …) is filtered.
  return null;
}

/**
 * Stable name-ordering for the alias list emitted to JSON.
 *
 * Primary names (NGC, then IC, then M, …) come first so the palette's
 * primary-line `names[0]` is the one a user is most likely to recognise.
 * Within the same prefix, sort by the trailing number (parsed as int
 * so `NGC 9` < `NGC 10`, not lexicographically).  Anything that
 * doesn't fit the shape falls to the end alphabetically.
 */
const PREFIX_ORDER = ['NGC', 'IC', 'M', 'UGC', 'UGCA', 'ARP', 'MRK', 'MCG', 'ESO'] as const;

export function sortAliasNames(names: readonly string[]): string[] {
  const dedup = Array.from(new Set(names));
  dedup.sort((a, b) => {
    const [aPrefix, aRest] = a.split(' ', 2);
    const [bPrefix, bRest] = b.split(' ', 2);
    const aRank = PREFIX_ORDER.indexOf(aPrefix as (typeof PREFIX_ORDER)[number]);
    const bRank = PREFIX_ORDER.indexOf(bPrefix as (typeof PREFIX_ORDER)[number]);
    if (aRank !== bRank) {
      // -1 (unknown) sorts after every known prefix
      const aKey = aRank === -1 ? Infinity : aRank;
      const bKey = bRank === -1 ? Infinity : bRank;
      return aKey - bKey;
    }
    // Same prefix: compare trailing number, then full string as fallback
    const aNum = parseInt(aRest ?? '', 10);
    const bNum = parseInt(bRest ?? '', 10);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  });
  return dedup;
}

/**
 * Parse one HyperLEDA Designations CSV chunk into rows of
 * `[objname, design]` pairs.  The on-disk format is tab-separated with
 * `#`-prefixed comment lines and a single column-name header line —
 * we skip both.
 */
type DesignationRow = { objname: string; design: string };

export function parseDesignationsCsv(text: string): DesignationRow[] {
  const rows: DesignationRow[] = [];
  const lines = text.split(/\r?\n/);
  // Find the column-name header — the line that starts with `$objname`
  // (HyperLEDA uses a `$` sigil for selectable column references).
  // After that line every subsequent non-`#` non-`$` non-empty line is
  // a data row.  Anything before is comment.
  let pastHeader = false;
  for (const line of lines) {
    if (line.length === 0) continue;
    if (line.startsWith('#')) continue;
    if (!pastHeader) {
      // The header line begins with `$objname` (no quotes).  HyperLEDA
      // sometimes splits the column-name line across whitespace; we
      // accept anything containing `design` as the header marker.
      if (line.includes('design')) {
        pastHeader = true;
      }
      continue;
    }
    // Data row: tab-separated.  Schema (validated): objname, b1950,
    // design, flag, link.  We only need the first and third columns.
    const cells = line.split('\t');
    if (cells.length < 3) continue;
    const objname = cells[0]?.trim() ?? '';
    const design = cells[2]?.trim() ?? '';
    if (objname.length === 0 || design.length === 0) continue;
    rows.push({ objname, design });
  }
  return rows;
}

// ─── Network + chunk-cache layer ───────────────────────────────────────────

const CHUNK_WIDTH = 100_000;
const RAW_DIR = rawDataPath('hyperleda.designations-dir');
// Committed source artefact, not a build output: `pgc_aliases.json` is an
// expensive HyperLEDA pull (the partial designation cache + a slow chunked
// fetch — see the header), so it lives in `data/` alongside the famous seed
// and ships to R2 via syncR2's EXTRA_FILES, NOT the gitignored public/data/
// output dir.  `npm run predev` stages a copy into public/data/ for the dev
// server, where the browser fetches it at the relative /data/ path.
const OUT_PATH = resolve('data/pgc_aliases.json');

function chunkCachePath(chunkStart: number): string {
  return `${RAW_DIR}/hyperleda_designations_chunk_${chunkStart}.csv`;
}

/**
 * Fetch one PGC chunk from HyperLEDA, returning the raw CSV text.
 * Throws on HTTP failure — the caller decides whether to retry or
 * abort.  `force` skips the on-disk cache; otherwise a cached chunk
 * short-circuits the network round-trip.
 */
async function fetchChunk(chunkStart: number, force: boolean): Promise<string> {
  const cachePath = chunkCachePath(chunkStart);
  if (!force && existsSync(cachePath)) {
    return readFileSync(cachePath, 'utf8');
  }

  // Build the SQL filter.  We keep PGC self-rows in the result set
  // (the `design like 'PGC%'` clause) so we can recover the numeric
  // PGC by finding the self-row inside each objname group.
  const sql =
    `(pgc>=${chunkStart} and pgc<${chunkStart + CHUNK_WIDTH}) and (` +
    `design like 'NGC%' or design like 'IC%' or design like 'UGC%' or ` +
    `design like 'UGCA%' or design like 'MESSIER%' or design like 'ARP%' or ` +
    `design like 'MRK%' or design like 'MCG%' or design like 'ESO%' or ` +
    `design like 'PGC%')`;
  const url = `http://atlas.obs-hp.fr/hyperleda/fG.cgi?n=a101&a=csv&c=o&sql=${encodeURIComponent(sql)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for chunk starting at ${chunkStart}: ${url}`);
  }
  const text = await res.text();
  // Persist on cache miss (atomic-ish: write to disk, then any later
  // run reads the same content).  Failures here are non-fatal — the
  // user can re-run, and the next attempt will refetch.
  if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });
  writeFileSync(cachePath, text);
  return text;
}

// ─── Group-and-emit layer ──────────────────────────────────────────────────

/**
 * Walk `parseDesignationsCsv` output and group by `objname`, picking
 * the lowest-numbered PGC self-row as the canonical PGC for the group
 * (HyperLEDA occasionally lists merger remnants as multiple PGCs sharing
 * one object name; the lowest number is by convention the primary).
 *
 * Returns a Map keyed by numeric PGC.  Groups without a PGC self-row
 * are dropped (with a warning) — without it we can't link the alias
 * back to a runtime point.
 */
export function groupByPgc(rows: readonly DesignationRow[]): {
  byPgc: Map<number, string[]>;
  droppedGroups: number;
} {
  const byObj = new Map<string, DesignationRow[]>();
  for (const row of rows) {
    let group = byObj.get(row.objname);
    if (!group) {
      group = [];
      byObj.set(row.objname, group);
    }
    group.push(row);
  }
  const byPgc = new Map<number, string[]>();
  let droppedGroups = 0;
  for (const [, group] of byObj) {
    // Find the lowest PGC self-row in the group
    let minPgc = Infinity;
    for (const row of group) {
      const m = row.design.match(/^PGC(\d+)$/i);
      if (m) {
        const n = parseInt(m[1]!, 10);
        if (n < minPgc) minPgc = n;
      }
    }
    if (!Number.isFinite(minPgc)) {
      droppedGroups++;
      continue;
    }
    // Normalise every other designation; collect the keepers.
    const names: string[] = [];
    for (const row of group) {
      const norm = normalizeDesignation(row.design);
      if (norm !== null) names.push(norm);
    }
    if (names.length === 0) continue;
    // Merge with any prior accumulation under the same PGC (different
    // chunks can contribute to the same group when the chunk boundary
    // falls inside a merger; rare but possible).
    const existing = byPgc.get(minPgc);
    if (existing) {
      for (const n of names) existing.push(n);
    } else {
      byPgc.set(minPgc, names);
    }
  }
  return { byPgc, droppedGroups };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const maxStartArg = argv.find((a) => a.startsWith('--max-start='));
  const maxStart = maxStartArg
    ? parseInt(maxStartArg.split('=')[1] ?? '', 10)
    : Number.POSITIVE_INFINITY;

  if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });

  process.stderr.write(`buildPgcAliases: chunking PGC space in ${CHUNK_WIDTH}-wide windows\n`);
  if (force) process.stderr.write(`  --force: bypassing chunk cache\n`);

  // We group chunk-by-chunk rather than accumulating every row in one
  // array — empirically the first chunk alone yields ~200k rows, and a
  // full run is many millions of rows.  Streaming through `groupByPgc`
  // per-chunk keeps memory bounded and avoids spread-arg stack blowups.
  const aggregateByPgc = new Map<number, string[]>();
  let aggregateDropped = 0;
  let chunkStart = 0;
  let consecutiveEmpty = 0;
  // The dataset extends past PGC ~5M; stop after two consecutive empty
  // windows so a single sparse gap doesn't cause an early exit.
  // `maxStart` lets developers cap the run for testing.
  while (consecutiveEmpty < 2 && chunkStart <= maxStart && chunkStart < 6_000_000) {
    let text: string;
    try {
      text = await fetchChunk(chunkStart, force);
    } catch (e) {
      process.stderr.write(`  chunk ${chunkStart}: ${(e as Error).message}\n`);
      // Treat as transient: stop here so the user can re-run; cached
      // chunks remain on disk so progress isn't lost.
      throw e;
    }
    const rows = parseDesignationsCsv(text);
    if (rows.length === 0) {
      consecutiveEmpty++;
    } else {
      consecutiveEmpty = 0;
      const { byPgc, droppedGroups } = groupByPgc(rows);
      aggregateDropped += droppedGroups;
      // Merge into the running map.  PGC keys are unique per chunk
      // because each chunk is bounded by `pgc<chunkStart+CHUNK_WIDTH`
      // — but a merger group whose objname spans neighbouring chunks
      // could in theory split, so we still merge defensively here.
      for (const [pgc, names] of byPgc) {
        const existing = aggregateByPgc.get(pgc);
        if (existing) {
          for (const n of names) existing.push(n);
        } else {
          aggregateByPgc.set(pgc, names);
        }
      }
    }
    process.stderr.write(
      `  chunk pgc=${chunkStart.toLocaleString()} → ` +
        `${rows.length.toLocaleString()} rows, ` +
        `${aggregateByPgc.size.toLocaleString()} PGCs total\n`,
    );
    chunkStart += CHUNK_WIDTH;
  }

  process.stderr.write(
    `  ${aggregateByPgc.size.toLocaleString()} PGCs with ≥1 alias; ` +
      `${aggregateDropped.toLocaleString()} groups dropped (no PGC self-row)\n`,
  );
  const byPgc = aggregateByPgc;

  // Build the sorted, deterministic JSON object.  Keys are PGC strings
  // (JSON object keys are strings anyway, and BigInt isn't JSON-serialisable
  // — the runtime loader does the bigint conversion on parse).
  const sortedKeys = Array.from(byPgc.keys()).sort((a, b) => a - b);
  const out: Record<string, string[]> = {};
  for (const pgc of sortedKeys) {
    const names = byPgc.get(pgc)!;
    out[String(pgc)] = sortAliasNames(names);
  }
  const json = JSON.stringify(out);
  writeFileSync(OUT_PATH, json);
  const sizeKb = (json.length / 1024).toFixed(1);
  process.stderr.write(
    `wrote ${OUT_PATH} (${sortedKeys.length.toLocaleString()} entries, ${sizeKb} KB)\n`,
  );
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
