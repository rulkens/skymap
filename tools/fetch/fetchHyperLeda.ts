#!/usr/bin/env node
/**
 * fetchHyperLeda — pull `pa` (deg), `logr25` (log10 of major/minor axis
 * ratio), `logd25` (log10 of D25 isophotal diameter in 0.1 arcmin),
 * `e_logd25` (uncertainty), `mod0` (redshift-independent distance
 * modulus), and `e_mod0` (its uncertainty) from HyperLEDA for every PGC
 * referenced in GLADE v2.3.
 *
 * We grab logd25/e_logd25 alongside the orientation columns even though
 * the build pipeline doesn't read them — it's the same upstream request,
 * the same multi-hour fetch, and a later switch to real GLADE diameters
 * from HyperLEDA (rather than Tully size-luminosity) would otherwise
 * force a full re-fetch. Caching them is essentially free.
 *
 * `mod0`/`e_mod0` (HyperLEDA's redshift-independent distance modulus +
 * uncertainty) feed the local-volume distance override (see
 * docs/superpowers/specs/2026-05-27-local-volume-distances.md) as a
 * fallback for galaxies that CF4 doesn't list. The mod0 column is
 * sparsely populated — most rows have NaN — but fetching it is
 * essentially free (same HTTP request, same parse). Per the project
 * memory `project_hyperleda_partial_cache`, the cache is intentionally
 * partial and must NOT be auto-refetched; the header check below makes
 * operators deliberately delete + regenerate a cache whose column shape
 * doesn't match the current schema.
 *
 * HyperLEDA's modern API:
 *
 *   http://atlas.obs-hp.fr/hyperleda/fG.cgi?n=meandata&a=csv&sql=pgc%3D<N>
 *
 * Notes about why this URL is what it is:
 *
 *  - The `leda.univ-lyon1.fr` host that older docs mention is now just a
 *    302 redirector to `atlas.obs-hp.fr`, AND its TLS cert is expired —
 *    Node's `fetch` throws on the handshake, so we hit `atlas` directly
 *    over plain HTTP.
 *  - The filter param is `sql=`, not `p=`. The old `p=pgc%3D…` form is
 *    interpreted by the modern API as "object name = pgc, position = N"
 *    (a sky-position cone-search) instead of a column filter, and
 *    silently returns no rows.
 *  - `o=pgc` must NOT be passed — it gets parsed as object-name = "pgc"
 *    and overrides the SQL filter. Drop it entirely.
 *  - The response is *not* CSV in spite of `a=csv`; it's tab-separated
 *    with a header line beginning with `$objname` listing the column
 *    names in double-quotes, lots of `#`-prefixed comment lines, and
 *    one tab-separated data row per match.
 *
 * The endpoint is happiest with one PGC per request, so we ratelimit to 4
 * concurrent fetches and stream results to disk. ~3.2M GLADE rows but
 * ~1.5M unique PGCs (the rest are zeros = not in HyperLEDA), so the actual
 * fetch volume is manageable in batches.
 *
 * Cached output: `data/raw/hyperleda/hyperleda_pa.csv` keyed by PGC. Re-run rarely.
 */

import {
  createReadStream,
  writeFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { readIdSet } from '../utils/io/readIdSet';
import { rawDataPath } from '../utils/io/rawDataRegistry';

const CONCURRENCY = 4;

type HyperLedaRow = {
  pa: number;
  logr25: number;
  // logd25 / e_logd25 may be NaN even when pa/logr25 are present — HyperLEDA
  // sometimes has shape but no isophotal-diameter measurement, especially
  // for fainter or photographic-only galaxies. We propagate NaN through to
  // the cache file as an empty cell so the consumer can detect it.
  logd25: number;
  e_logd25: number;
  /**
   * mod0: distance modulus from redshift-independent measurements
   * (mean of TRGB / TF / Cepheid / SNIa / SBF where available),
   * weighted-mean per HyperLEDA's compilation. NaN when HyperLEDA
   * has no redshift-independent distance for this PGC.
   *
   * d_Mpc = 10^((mod0 - 25) / 5) — see `catalogDistanceFor` for the
   * conversion.
   */
  mod0: number;
  /**
   * e_mod0: 1-σ uncertainty on mod0 in magnitudes. Cached so an
   * InfoCard that surfaces ± values won't need a re-fetch; nothing
   * reads it yet.
   */
  e_mod0: number;
};

async function fetchOne(pgc: string): Promise<HyperLedaRow | null> {
  const url = `http://atlas.obs-hp.fr/hyperleda/fG.cgi?n=meandata&a=csv&sql=pgc%3D${pgc}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  const lines = text.split(/\r?\n/);

  // Header line begins with `$objname` and lists column names in
  // double-quotes separated by spaces. Example:
  //   $objname "pgc" "objtype" ... "logd25" "e_logd25" "logr25" "e_logr25" "pa" ...
  // The `$objname` token has no quotes; everything else does. We strip
  // quotes and lowercase to make the indexOf lookup robust against any
  // future case-flip.
  const headerLine = lines.find((l) => l.startsWith('$objname'));
  if (!headerLine) return null;
  const headerTokens = headerLine.split(/\s+/).map((s) => s.replace(/^"|"$/g, '').toLowerCase());
  const paIdx = headerTokens.indexOf('pa');
  const lrIdx = headerTokens.indexOf('logr25');
  const ldIdx = headerTokens.indexOf('logd25');
  const eldIdx = headerTokens.indexOf('e_logd25');
  const m0Idx = headerTokens.indexOf('mod0');
  const em0Idx = headerTokens.indexOf('e_mod0');
  // pa + logr25 are required (the row is useless without orientation);
  // logd25 / e_logd25 / mod0 / e_mod0 are nice-to-have, NaN if missing
  // in the response.
  if (paIdx === -1 || lrIdx === -1) return null;

  // Data line: tab-separated, no leading `#`, contains the actual values.
  // We look for the first such line; HyperLEDA emits at most one match per
  // pgc since pgc is a unique key in `meandata`.
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('$') || !line.includes('\t')) {
      continue;
    }
    const cells = line.split('\t');
    const pa = parseFloat(cells[paIdx] ?? '');
    const lr = parseFloat(cells[lrIdx] ?? '');
    const ld = ldIdx === -1 ? NaN : parseFloat(cells[ldIdx] ?? '');
    const eld = eldIdx === -1 ? NaN : parseFloat(cells[eldIdx] ?? '');
    const m0 = m0Idx === -1 ? NaN : parseFloat(cells[m0Idx] ?? '');
    const em0 = em0Idx === -1 ? NaN : parseFloat(cells[em0Idx] ?? '');
    if (Number.isFinite(pa) && Number.isFinite(lr)) {
      return { pa, logr25: lr, logd25: ld, e_logd25: eld, mod0: m0, e_mod0: em0 };
    }
    // If a data row exists but PA/logr25 are blank, that's a real "queried,
    // but no shape measurement" outcome — return null so the caller writes
    // an empty cache row that still skips on resume.
    return null;
  }
  return null;
}

async function readGladePgcs(path: string): Promise<string[]> {
  const set = new Set<string>();
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.length < 256) continue;
    // PGC field: bytes 1-7 (per GLADE ReadMe). 0-based: 0-7.
    const pgc = line.slice(0, 7).trim();
    if (pgc !== '' && !/^-+$/.test(pgc) && pgc !== '0') set.add(pgc);
  }
  return Array.from(set);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inputArg = argv.find((a) => !a.startsWith('--')) ?? rawDataPath('glade.v23');
  const outPath = rawDataPath('hyperleda.pa');

  process.stderr.write(`reading PGCs from ${inputArg}…\n`);
  const allPgcs = await readGladePgcs(resolve(inputArg));
  process.stderr.write(`  ${allPgcs.length.toLocaleString()} unique PGCs in GLADE\n`);

  if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });

  // Resume support: read existing cache; skip every PGC we've already queried.
  // First run: file doesn't exist, set is empty, write the header. Subsequent
  // runs: append to the existing file (header already in place).
  // The cache header is the schema marker — if the existing file has a
  // different column shape (caches from earlier schema versions exist
  // on operators' disks), appending would interleave row shapes the
  // consumer can't disambiguate. Refuse to mix and tell the user to
  // delete the file. (On a fresh run there's no file, so the check is
  // skipped.)
  const expectedHeader = 'pgc,pa,logr25,logd25,e_logd25,mod0,e_mod0';
  if (existsSync(outPath)) {
    const firstLine = readFileSync(outPath, 'utf8').split(/\r?\n/, 1)[0] ?? '';
    if (firstLine.trim() !== expectedHeader && firstLine.trim() !== '') {
      throw new Error(
        `cache header mismatch: ${outPath}\n` +
          `  expected: ${expectedHeader}\n` +
          `  found:    ${firstLine.trim()}\n` +
          `delete the file and re-run to start a fresh fetch.`,
      );
    }
  }

  const alreadyDone = readIdSet(outPath);
  if (alreadyDone.size === 0) {
    writeFileSync(outPath, expectedHeader + '\n');
  } else {
    process.stderr.write(`  resume: ${alreadyDone.size.toLocaleString()} PGCs already cached\n`);
  }

  const pgcs = allPgcs.filter((p) => !alreadyDone.has(p));
  process.stderr.write(`  fetching ${pgcs.length.toLocaleString()} remaining\n`);

  let i = 0;
  let done = 0;
  let failed = 0;
  let firstError: string | undefined;

  async function worker(): Promise<void> {
    while (i < pgcs.length) {
      const my = i++;
      const pgc = pgcs[my]!;
      try {
        const r = await fetchOne(pgc);
        // Always write a row — matched or not — so the next resume sees the
        // PGC in the cache and skips it. Unmatched rows look like `pgc,,,,,,`
        // (six trailing empties for pa, logr25, logd25, e_logd25, mod0, e_mod0).
        // Per-cell NaN→"" so the consumer can use parseFloat("") → NaN as
        // the missing-value signal.
        const cell = (n: number): string => (Number.isFinite(n) ? String(n) : '');
        if (r) {
          appendFileSync(
            outPath,
            `${pgc},${r.pa},${r.logr25},${cell(r.logd25)},${cell(r.e_logd25)},${cell(r.mod0)},${cell(r.e_mod0)}\n`,
          );
        } else {
          appendFileSync(outPath, `${pgc},,,,,,\n`);
        }
      } catch (e) {
        // Network blip / TLS failure — DO NOT write a cache row; resume will
        // retry next run. Count + log failures: a silent catch would let an
        // outage (e.g. an expired upstream cert) wipe out an entire run
        // with no visible error.
        failed++;
        const msg = (e as Error).message;
        const cause = (e as { cause?: { code?: string; message?: string } }).cause;
        if (firstError === undefined) {
          firstError = `${msg}${cause ? ` (cause: ${cause.code ?? ''} ${cause.message ?? ''})` : ''}`;
          process.stderr.write(`  WARN first fetch failure for PGC ${pgc}: ${firstError}\n`);
        }
      }
      done++;
      if (done % 1000 === 0) {
        process.stderr.write(`  ${done}/${pgcs.length} (${failed} failed)\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  process.stderr.write(
    `done; total cached: ${(alreadyDone.size + done - failed).toLocaleString()}` +
      (failed > 0 ? `; ${failed.toLocaleString()} fetches failed and were NOT cached\n` : '\n'),
  );
  if (failed > 0 && failed === done) {
    process.stderr.write(
      `\nWARNING: every fetch failed. The cache file holds no new data.\n` +
        `Common causes: expired upstream TLS cert, API URL changed.\n` +
        `First error was: ${firstError ?? '(none captured)'}\n`,
    );
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
