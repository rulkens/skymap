#!/usr/bin/env node
/**
 * buildFilaments — assemble the cosmic-web filament skeleton.
 *
 * Pipeline:
 *
 *   1. Read public/data/{sdss,2mrs,glade}.bin → merged xyz positions
 *   2. Write data/raw/galaxies_merged.tsv (one line per galaxy: "x y z")
 *   3. Run DisPerSE: mse + skelconv (default 5σ persistence, 2 smoothing passes)
 *   4. Parse the resulting .NDskl, convert to FilamentCloud, encode FILA v1
 *   5. Write public/data/filaments.bin
 *
 * Run order: must be after `npm run build-all` so the survey .bin files
 * exist on disk in `public/data/`.  The orchestrator reads those instead
 * of re-parsing the raw catalogues, because by the time DisPerSE runs we
 * already have the cross-matched, deduped positions on disk and reusing
 * them keeps this script from depending on the (slow, GLADE-streaming)
 * raw-catalogue path.
 *
 * External requirements:
 *   - DisPerSE installed (`mse` and `skelconv` on PATH).  See README for
 *     build instructions; this script throws a friendly error if either
 *     binary is missing.
 *   - ~16 GB RAM during the `mse` step (DisPerSE peaks high).
 *   - 6-12 hours wall time on a workstation for the merged catalogue.
 *
 * The `--cut` flag overrides the default 5σ persistence threshold (e.g.
 * `--cut 7` for a sparser, more conservative skeleton).  `--smooth N`
 * adjusts the number of skelconv smoothing passes.
 *
 * Why we shell out rather than wrap a library?  DisPerSE is a sizeable
 * C++ codebase with native dependencies (CFITSIO, optionally MPI); a
 * subprocess boundary is the only practical interface from Node.  We
 * trade one-shot wall time for zero install pain on the JS side.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePointCloud } from '../src/data/pointCloudFormat.js';
import { parseNDskl, skeletonToFilamentCloud } from './parsers/ndskl.js';
import { encodeFilaments } from '../src/data/filamentBinaryFormat.js';
import type { PointCloud } from '../src/@types/index.js';

/**
 * Default persistence cut in σ.  The 2025 SDSS DR18 filament paper used
 * 5σ + 2 smoothing passes as the production setting; we mirror that so
 * out-of-the-box runs reproduce a published result.
 */
const DEFAULT_PERSISTENCE_CUT = 5;
const DEFAULT_SMOOTHING_PASSES = 2;

/**
 * Tiny argv parser.  We don't pull in a flags library because there are
 * exactly two flags and the cost of a dependency outweighs the benefit
 * of a 5-line hand-rolled loop.  `--cut` and `--smooth` each consume the
 * next argv slot as their numeric value; anything else is ignored.
 */
function parseArgs(): { cut: number; smooth: number } {
  const argv = process.argv.slice(2);
  let cut = DEFAULT_PERSISTENCE_CUT;
  let smooth = DEFAULT_SMOOTHING_PASSES;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cut') cut = Number(argv[++i] ?? cut);
    else if (a === '--smooth') smooth = Number(argv[++i] ?? smooth);
  }
  return { cut, smooth };
}

/**
 * Probe the PATH for the DisPerSE binaries we need.  We invoke each with
 * `--help` because it exits 0 quickly and is portable across DisPerSE
 * versions (older builds don't honour `--version`).  We check BOTH `mse`
 * and `skelconv` up front: a partially-built install (e.g. mse linked
 * but skelconv's CFITSIO link failed) would otherwise sit through the
 * multi-hour mse run before crashing on the missing skelconv.  A missing
 * binary or any non-zero exit is treated as "not installed" and we fail
 * loudly with a pointer to the README so the operator knows what to fix.
 */
function checkDisperse(): void {
  for (const bin of ['mse', 'skelconv'] as const) {
    const r = spawnSync(bin, ['--help'], { encoding: 'utf8' });
    if (r.error || r.status !== 0) {
      process.stderr.write(
        `error: DisPerSE \`${bin}\` binary not found on PATH.\n` +
          'Install: see README "Filament skeleton" section.\n',
      );
      process.exit(1);
    }
  }
}

/**
 * Read each survey's .bin from `public/data/` and concatenate the xyz
 * positions into one big Float32Array.  Missing files are treated as
 * non-fatal warnings — running with only SDSS available is a useful
 * intermediate state during development.
 *
 * Buffer→ArrayBuffer note: `readFileSync` returns a Node `Buffer`, whose
 * `.buffer` is the (possibly shared, possibly offset) underlying pool.
 * `decodePointCloud` constructs a `DataView` over the buffer starting at
 * byte 0, so handing it the pool directly would mis-read every file.
 * We slice out a clean owned ArrayBuffer covering exactly this Buffer's
 * bytes before decoding.
 */
function readMergedPositions(): { count: number; positions: Float32Array } {
  const sources = ['sdss.bin', '2mrs.bin', 'glade.bin'] as const;
  const clouds: PointCloud[] = [];
  for (const name of sources) {
    const path = resolve('public/data', name);
    if (!existsSync(path)) {
      process.stderr.write(`warning: ${path} not found — skipping\n`);
      continue;
    }
    const buf = readFileSync(path);
    // Slice yields a fresh ArrayBuffer with byteOffset=0 and the exact
    // file length, sidestepping the pooled-Buffer offset gotcha noted
    // above.
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    clouds.push(decodePointCloud(ab));
  }

  const total = clouds.reduce((acc, c) => acc + c.count, 0);
  const positions = new Float32Array(total * 3);
  let off = 0;
  for (const c of clouds) {
    positions.set(c.positions, off);
    off += c.positions.length;
  }
  return { count: total, positions };
}

/**
 * Materialise the per-galaxy positions as a TSV file DisPerSE can read.
 * One line per galaxy, three space-separated floats: `x y z` in Mpc.
 *
 * We build the line array first, then `writeFileSync` once.  An earlier
 * version streamed line-by-line via `fs.appendFile` and was ~30× slower
 * for ~3 M galaxies thanks to per-line syscall overhead.  3 M short
 * strings are well under V8's string limits, so the all-in-memory build
 * is fine here.
 */
function writeTsvInput(path: string, positions: Float32Array, count: number): void {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    lines.push(
      `${positions[i * 3 + 0]!} ${positions[i * 3 + 1]!} ${positions[i * 3 + 2]!}`,
    );
  }
  // Unconditional mkdirSync with `recursive: true` is a no-op when the
  // directory already exists, and avoids a TOCTOU window between the
  // existsSync probe and the mkdir call.
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join('\n') + '\n');
}

/**
 * Run DisPerSE in two stages and return the path of the ASCII NDskl
 * file the parser will consume.
 *
 *   1. `mse` extracts the Morse-Smale complex from the point set and
 *      writes a binary `.NDskl` next to the input.  `--upSkl` asks for
 *      the up-skeleton (filaments along ascending density gradient);
 *      `--forceLoops` keeps closed loops in the cosmic web; `--nsig N`
 *      sets the persistence cut in σ.
 *
 *   2. `skelconv` smooths the skeleton, trims segments below the
 *      robustness threshold, and converts the binary to ASCII so the
 *      JS parser doesn't have to decode the proprietary binary form.
 *
 * The output filename pattern is `<input>.NDskl.S<cut>.NDskl_ascii` —
 * skelconv composes it deterministically from the cut value, which is
 * why we pass `cut` as both the persistence threshold and the trim
 * level.
 *
 * We use `spawnSync` with the array argv form rather than `execSync`
 * with template-string interpolation: the array form bypasses the shell
 * entirely, so paths with spaces (the project's SDSS CSV already lives
 * at `Skyserver_SQL5_3_2026 6_09_20 PM.csv`) or shell metacharacters in
 * the input path don't break the invocation.  Each step explicitly
 * checks the exit code and throws with the binary name + status so the
 * outer error handler can report something actionable.
 */
function runDisperse(tsvPath: string, cut: number, smooth: number): string {
  process.stderr.write(`running mse on ${tsvPath} (this can take hours)…\n`);
  const mseResult = spawnSync(
    'mse',
    [tsvPath, '--upSkl', '--forceLoops', '--nsig', String(cut)],
    { stdio: 'inherit' },
  );
  if (mseResult.status !== 0) {
    throw new Error(`mse failed with exit code ${mseResult.status}`);
  }
  const skelRaw = `${tsvPath}.NDskl`;

  process.stderr.write(`running skelconv (smooth=${smooth})…\n`);
  const skelResult = spawnSync(
    'skelconv',
    [
      skelRaw,
      '-smooth',
      String(smooth),
      '-trimBelow',
      'robustness',
      String(cut),
      '-to',
      'NDskl_ascii',
    ],
    { stdio: 'inherit' },
  );
  if (skelResult.status !== 0) {
    throw new Error(`skelconv failed with exit code ${skelResult.status}`);
  }
  return `${skelRaw}.S${cut}.NDskl_ascii`;
}

async function main(): Promise<void> {
  const { cut, smooth } = parseArgs();
  process.stderr.write(`buildFilaments — cut=${cut}σ smooth=${smooth}\n`);

  checkDisperse();

  const { count, positions } = readMergedPositions();
  process.stderr.write(`  merged ${count.toLocaleString()} galaxy positions\n`);

  const tsvPath = resolve('data/raw/galaxies_merged.tsv');
  writeTsvInput(tsvPath, positions, count);
  process.stderr.write(`  wrote ${tsvPath}\n`);

  const ndsklPath = runDisperse(tsvPath, cut, smooth);
  process.stderr.write(`  parsed skeleton at ${ndsklPath}\n`);

  const skel = parseNDskl(readFileSync(ndsklPath, 'utf8'));
  const cloud = skeletonToFilamentCloud(skel);
  process.stderr.write(
    `  ${cloud.stripCount.toLocaleString()} strips, ` +
      `${cloud.vertexCount.toLocaleString()} vertices\n`,
  );

  const outPath = resolve('public/data/filaments.bin');
  const buf = encodeFilaments(cloud);
  writeFileSync(outPath, Buffer.from(buf));
  process.stderr.write(
    `wrote filaments.bin (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)\n`,
  );
}

// Only run when this file is invoked directly (e.g. via `tsx`).  This
// mirrors the buildAllBins pattern so a future test can import helpers
// from this module without triggering DisPerSE.
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(
      `error: ${(err as Error).stack ?? (err as Error).message}\n`,
    );
    process.exit(1);
  });
}
