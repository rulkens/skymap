#!/usr/bin/env node
/**
 * fetchMilliquas — pull the Milliquas v8 catalogue (Flesch 2023) from
 * `quasars.org` into `data/raw/milliquas/`.
 *
 * Milliquas is a compilation of ~983k confirmed-and-candidate AGN drawn
 * from SDSS, 2MRS, GAIA, VLASS, and dozens of smaller surveys.  It is
 * the single biggest input to Skymap's quasar layer — once it lands the
 * renderer can show a redshift-ordered cloud of active nuclei extending
 * far past the galaxy catalogs' depth.  Without this fetcher a fresh
 * clone has no way to populate the layer; the file is too large
 * (~194 MB extracted) to ship in git, but small enough that a single
 * `curl` + unzip is the right tool — no resume cache, no chunked
 * paging, no rate-limiting state machine.
 *
 * Why checksum verification matters more here than usual:
 *
 *  - Milliquas releases are versioned by *overwriting the same URL*.
 *    quasars.org/milliquas.zip points at the latest version regardless
 *    of which schema it has.  v7 was 32 columns wide; v8 added several
 *    flag fields and renamed others.  Without a checksum we'd silently
 *    absorb a future v9 schema change into the build pipeline, and the
 *    parser would either crash or — worse — emit subtly-wrong byte
 *    offsets that look correct in aggregate but mis-label individual
 *    quasars.
 *  - The download is unsigned (no GPG, no manifest), and the upstream
 *    is a single maintainer's personal site.  A hash pinned in source
 *    is the cheapest defence we have against either a release we
 *    didn't intend to consume yet, or — in the worst case — a
 *    compromised tarball.
 *
 * Why no resume cache (unlike `fetchHyperLeda` or `fetch2massXsc`):
 * this is a single ~32 MB download from a single URL.  HyperLEDA is a
 * million-API-call workflow over an unreliable upstream where partial
 * progress must survive interruptions; this script is fundamentally
 * different and shouldn't pretend to be the same shape.  A plain
 * idempotent "if the file's there with roughly the right size, skip;
 * otherwise fetch + verify + extract" is the right tool.
 *
 * On checksum mismatch: this script EXITS NON-ZERO and leaves the
 * downloaded zip in place for manual inspection.  A new hash should
 * never be merged without a human reading the Milliquas release notes
 * on <https://quasars.org/milliquas.htm> and confirming that the
 * column layout / units / flags are still what the parser expects.
 * Do NOT auto-update `EXPECTED_ZIP_SHA256` or `EXPECTED_TXT_SHA256`.
 */

import {
  createWriteStream,
  createReadStream,
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

import { rawDataPath } from '../utils/io/rawDataRegistry';

const ZIP_URL = 'https://quasars.org/milliquas.zip';

// Pinned hashes from the v8 release downloaded on 2026-05-20.  If
// either of these stops matching, treat it as an intentional release
// bump and follow the procedure in this file's module header — do
// NOT just paste in a new value.
const EXPECTED_ZIP_SHA256 = '9128d6aa91354d0ee1c83dde3ab8764a20d542aa82327e4a969a4357ba9ac984';
const EXPECTED_TXT_SHA256 = '4c70119381f5fb1de1c2125bd5f8f7f37b646a4c35dfa9f30e6aa484fb27f78d';

// Expected uncompressed size of `milliquas.txt`.  Used only for the
// "skip if already present" fast path; the authoritative integrity
// check is the SHA-256 below.  ±1% tolerance allows the maintainer to
// regenerate the file with trailing-newline / line-ending variations
// without forcing a full re-download just to recompute the hash.
const EXPECTED_TXT_BYTES = 194142000;
const SIZE_TOLERANCE = 0.01;

const OUT_DIR = rawDataPath('milliquas.dir');
const ZIP_PATH = resolve(OUT_DIR, 'milliquas.zip');
const TXT_PATH = resolve(OUT_DIR, 'milliquas.txt');

type FetchResult = {
  readonly bytes: number;
  readonly elapsedMs: number;
};

async function downloadZip(url: string, dest: string): Promise<FetchResult> {
  const started = Date.now();
  // Node 20+'s global `fetch` returns a streaming Response with a
  // Web ReadableStream body.  Piping it to a Node WriteStream avoids
  // buffering the entire 32 MB in memory — small as that is on
  // modern machines, the streaming idiom is the one the rest of the
  // fetchers use, so we match it here.
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}`);
  }
  const sink = createWriteStream(dest);
  const reader = res.body.getReader();
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (!sink.write(value)) {
      await new Promise<void>((r) => sink.once('drain', () => r()));
    }
  }
  await new Promise<void>((r) => sink.end(() => r()));
  return { bytes, elapsedMs: Date.now() - started };
}

async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

async function countLines(path: string): Promise<number> {
  // Streaming line count — the file is ~200 MB; loading it into a
  // single string would spike RSS to ~400 MB on the V8 side.  readline
  // over a stream keeps the working set under ~1 MB.
  let n = 0;
  const rl = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  for await (const _ of rl) {
    n++;
  }
  return n;
}

function withinTolerance(actual: number, expected: number, tol: number): boolean {
  if (expected === 0) return actual === 0;
  return Math.abs(actual - expected) / expected <= tol;
}

function unzip(zipPath: string, outDir: string): void {
  // No project dependency offers ZIP extraction (sharp, msdf-bmfont-xml,
  // and the rest are all special-purpose).  Pulling in `adm-zip` just to
  // unpack one file once per release would be net-negative — the same
  // reasoning the CF-4 README applies to the `.npz` extraction step.
  // Shell out to the system `unzip`, which exists on every macOS / Linux
  // dev box and on every CI image we care about.
  const cmd = 'unzip';
  const args = ['-o', zipPath, '-d', outDir];
  process.stderr.write(`  $ ${cmd} ${args.join(' ')}\n`);
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.error) {
    throw new Error(`failed to spawn \`unzip\`: ${result.error.message}`);
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`unzip exited with status ${result.status}`);
  }
  if (result.signal) {
    throw new Error(`unzip terminated by signal ${result.signal}`);
  }
}

async function main(): Promise<void> {
  const started = Date.now();

  // Fast path: txt already present with roughly the right size.  We
  // skip even the SHA-256 here because the verification on the
  // *original* download already happened in a previous run, and
  // rehashing 194 MB on every script invocation is wasted work.  A
  // malicious or corrupted on-disk file would still get caught by the
  // build pipeline downstream (the parser is strict about row width).
  if (existsSync(TXT_PATH)) {
    const sz = statSync(TXT_PATH).size;
    if (withinTolerance(sz, EXPECTED_TXT_BYTES, SIZE_TOLERANCE)) {
      process.stderr.write(
        `skipping, already present: ${TXT_PATH} (${sz.toLocaleString()} bytes, ` +
          `within ±${(SIZE_TOLERANCE * 100).toFixed(0)}% of expected ${EXPECTED_TXT_BYTES.toLocaleString()})\n`,
      );
      return;
    }
    process.stderr.write(
      `  existing ${TXT_PATH} is ${sz.toLocaleString()} bytes ` +
        `(expected ~${EXPECTED_TXT_BYTES.toLocaleString()}); re-downloading.\n`,
    );
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  process.stderr.write(`downloading ${ZIP_URL}\n`);
  const dl = await downloadZip(ZIP_URL, ZIP_PATH);
  process.stderr.write(
    `  fetched ${dl.bytes.toLocaleString()} bytes in ${(dl.elapsedMs / 1000).toFixed(1)} s\n`,
  );

  process.stderr.write(`verifying zip SHA-256\n`);
  const zipHash = await sha256OfFile(ZIP_PATH);
  if (zipHash !== EXPECTED_ZIP_SHA256) {
    process.stderr.write(
      `\nERROR: ${ZIP_PATH} SHA-256 mismatch.\n` +
        `  expected: ${EXPECTED_ZIP_SHA256}\n` +
        `  actual:   ${zipHash}\n\n` +
        `The file has been left on disk for manual inspection.  Before bumping\n` +
        `EXPECTED_ZIP_SHA256 in this script, read the release notes at\n` +
        `https://quasars.org/milliquas.htm and confirm the column layout has\n` +
        `not changed.  Do NOT auto-update the constant.\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`  zip OK\n`);

  process.stderr.write(`extracting to ${OUT_DIR}\n`);
  // unzip will overwrite existing files (-o); we also pre-delete the
  // old txt so a failed extract doesn't leave a stale file that the
  // fast path would later mistakenly accept.
  if (existsSync(TXT_PATH)) unlinkSync(TXT_PATH);
  unzip(ZIP_PATH, OUT_DIR);

  if (!existsSync(TXT_PATH)) {
    throw new Error(
      `extraction completed but ${TXT_PATH} is missing — has the upstream ` +
        `archive layout changed?  Inspect ${ZIP_PATH} manually.`,
    );
  }

  process.stderr.write(`verifying txt SHA-256\n`);
  const txtHash = await sha256OfFile(TXT_PATH);
  if (txtHash !== EXPECTED_TXT_SHA256) {
    process.stderr.write(
      `\nERROR: ${TXT_PATH} SHA-256 mismatch.\n` +
        `  expected: ${EXPECTED_TXT_SHA256}\n` +
        `  actual:   ${txtHash}\n\n` +
        `The file has been left on disk for manual inspection.  See the\n` +
        `note above about EXPECTED_ZIP_SHA256 — the same caution applies.\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`  txt OK\n`);

  const txtSize = statSync(TXT_PATH).size;
  const lines = await countLines(TXT_PATH);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  process.stderr.write(
    `done in ${elapsed} s — ${txtSize.toLocaleString()} bytes, ${lines.toLocaleString()} lines\n`,
  );
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}

// Re-export for tests if anyone wants to exercise individual helpers
// without invoking the script end-to-end.  Kept at the bottom so it
// doesn't clutter the file's primary surface.
export { ZIP_URL, EXPECTED_ZIP_SHA256, EXPECTED_TXT_SHA256, OUT_DIR, ZIP_PATH, TXT_PATH };
